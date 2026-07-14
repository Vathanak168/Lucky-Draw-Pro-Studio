from __future__ import annotations

import ctypes
import logging
import os
import socket
import sys
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

import uvicorn
import webview
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from src.backend.auth.gatekeeper import gatekeeper
from src.backend.auth.router import router as auth_router
from src.backend.config import APP_DATA_DIR, APP_NAME, APP_VERSION
from src.backend.desktop.bridge import desktop_bridge
from src.backend.desktop.router import router as desktop_router
from src.backend.desktop.storage_service import desktop_storage
from src.backend.runtime_session import RUNTIME_TOKEN, runtime_token_is_valid


FRONTEND_DIR = Path(__file__).resolve().parent / "src" / "frontend"
APP_ICON = FRONTEND_DIR / "assets" / "asta-mark.ico"
INSTANCE_MUTEX_NAME = "Local\\AstaStudio.DesktopApp"


def configure_logging() -> logging.Logger:
    log_dir = APP_DATA_DIR / "Logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        log_dir / "asta-studio.log",
        maxBytes=2 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers.clear()
    root.addHandler(handler)
    return logging.getLogger("asta_studio")


LOGGER = configure_logging()
app = FastAPI(title=APP_NAME, version=APP_VERSION, openapi_url=None, docs_url=None, redoc_url=None)


@app.middleware("http")
async def secure_local_runtime(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/"):
        token = request.headers.get("X-Asta-Runtime-Token")
        if not runtime_token_is_valid(token):
            return JSONResponse(status_code=403, content={"detail": "Invalid desktop runtime session"})
    if path.startswith("/local-assets/") and not gatekeeper.is_unlocked:
        return JSONResponse(status_code=401, content={"detail": "Asta Studio is locked"})

    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "media-src 'self' blob:; "
        "font-src 'self' data:; "
        "connect-src 'self' ws://127.0.0.1:*; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    )
    return response


@app.get("/health", include_in_schema=False)
def health():
    return {"ok": True, "app": APP_NAME, "version": APP_VERSION}


app.include_router(auth_router)
app.include_router(desktop_router)
app.mount(
    "/local-assets",
    StaticFiles(directory=str(desktop_storage.workspaces_dir)),
    name="local-assets",
)
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


class SingleInstanceGuard:
    def __init__(self) -> None:
        self.handle = None

    def acquire(self) -> bool:
        if os.name != "nt":
            return True
        kernel32 = ctypes.windll.kernel32
        self.handle = kernel32.CreateMutexW(None, False, INSTANCE_MUTEX_NAME)
        if not self.handle:
            return False
        return kernel32.GetLastError() != 183

    def release(self) -> None:
        if self.handle and os.name == "nt":
            ctypes.windll.kernel32.CloseHandle(self.handle)
            self.handle = None


def show_error(message: str, title: str = APP_NAME) -> None:
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, message, title, 0x10)
    else:
        LOGGER.error("%s: %s", title, message)


def reserve_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def wait_for_backend(base_url: str, timeout_seconds: float = 12.0) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urlopen(f"{base_url}/health", timeout=0.5) as response:
                if response.status == 200:
                    return True
        except (OSError, URLError):
            time.sleep(0.1)
    return False


def run_packaged_smoke_test(base_url: str) -> bool:
    checks = (
        ("/health", {}, 200),
        ("/login.html", {}, 200),
        ("/vendor/xlsx.full.min.js", {}, 200),
        ("/api/auth/session", {}, 403),
        ("/api/auth/session", {"X-Asta-Runtime-Token": RUNTIME_TOKEN}, 200),
    )
    for path, headers, expected_status in checks:
        request = UrlRequest(f"{base_url}{path}", headers=headers)
        try:
            with urlopen(request, timeout=3) as response:
                if response.status != expected_status:
                    return False
                response.read(128)
        except HTTPError as exc:
            if exc.code != expected_status:
                return False
    LOGGER.info("Packaged smoke test passed")
    return True


def launch_project_from_args() -> None:
    for value in sys.argv[1:]:
        if value.startswith("--"):
            continue
        candidate = Path(value.strip('"')).expanduser()
        if candidate.suffix.lower() in {".asta", ".ldp", ".json"}:
            desktop_storage.queue_launch_project(str(candidate))
            return


def main() -> int:
    guard = SingleInstanceGuard()
    if not guard.acquire():
        show_error("Asta Studio is already running.")
        return 0

    server: uvicorn.Server | None = None
    server_thread: threading.Thread | None = None
    try:
        launch_project_from_args()
        port = reserve_port()
        base_url = f"http://127.0.0.1:{port}"
        config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)
        server = uvicorn.Server(config)
        server_thread = threading.Thread(target=server.run, name="asta-local-api", daemon=True)
        server_thread.start()

        if not wait_for_backend(base_url):
            raise RuntimeError("The local application service did not start.")

        if "--smoke-test" in sys.argv:
            return 0 if run_packaged_smoke_test(base_url) else 1

        login_url = f"{base_url}/login.html#runtime_token={RUNTIME_TOKEN}"
        window = webview.create_window(
            title=f"{APP_NAME} {APP_VERSION}",
            url=login_url,
            js_api=desktop_bridge,
            width=520,
            height=660,
            min_size=(440, 580),
            background_color="#03070d",
        )
        desktop_bridge._bind_window(window, base_url, RUNTIME_TOKEN)
        window.events.closing += desktop_bridge._prepare_app_close
        webview.start(debug=False, icon=str(APP_ICON), gui="edgechromium")
        return 0
    except Exception as exc:
        LOGGER.exception("Asta Studio failed to start")
        show_error(f"Asta Studio could not start.\n\n{exc}")
        return 1
    finally:
        desktop_bridge._shutdown()
        if server is not None:
            server.should_exit = True
        if server_thread is not None and server_thread.is_alive():
            server_thread.join(timeout=5)
        guard.release()


if __name__ == "__main__":
    raise SystemExit(main())
