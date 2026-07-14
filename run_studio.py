# run_studio.py
import os
import socket
import sys
import threading
import time
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import webview

from src.backend.config import APP_NAME, APP_VERSION
from src.backend.auth.router import router as auth_router
from src.backend.auth.gatekeeper import gatekeeper
from src.backend.core.router import router as core_router
from src.backend.desktop.bridge import desktop_bridge
from src.backend.desktop.router import router as desktop_router
from src.backend.desktop.storage_service import desktop_storage

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Disable caching for local desktop webview so updates appear immediately on refresh
@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    if request.url.path.startswith("/local-assets/") and not gatekeeper.is_unlocked:
        return JSONResponse(status_code=401, content={"detail": "Asta Studio is locked"})
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Allow local CORS for desktop communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8926", "http://localhost:8926"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_router)
app.include_router(core_router)
app.include_router(desktop_router)

# Serve Frontend static assets from src/frontend
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "frontend")
APP_ICON = os.path.join(FRONTEND_DIR, "assets", "asta-mark.ico")
app.mount(
    "/local-assets",
    StaticFiles(directory=str(desktop_storage.workspaces_dir)),
    name="local-assets"
)
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


def port_is_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((host, port))
            return True
        except OSError:
            return False

def run_fastapi():
    """Runs Uvicorn FastAPI server in background thread."""
    uvicorn.run(app, host="127.0.0.1", port=8926, log_level="error")

def main():
    if not port_is_available("127.0.0.1", 8926):
        return

    # Start FastAPI server thread
    server_thread = threading.Thread(target=run_fastapi, daemon=True)
    server_thread.start()
    
    # Wait slightly for server to bind port
    time.sleep(0.8)
    
    # Create Native PyWebView Window
    window = webview.create_window(
        title=f"{APP_NAME} ({APP_VERSION})",
        url="http://127.0.0.1:8926/login.html",
        js_api=desktop_bridge,
        width=520,
        height=660,
        min_size=(440, 580),
        background_color="#03070d"
    )
    desktop_bridge._bind_window(window)
    
    # Start desktop GUI loop
    webview.start(debug=False, icon=APP_ICON)

if __name__ == "__main__":
    main()
