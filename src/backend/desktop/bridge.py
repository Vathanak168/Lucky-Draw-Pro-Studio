from __future__ import annotations

from functools import wraps
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import quote

import webview

from src.backend.desktop.history_report import safe_history_filename, write_history_workbook
from src.backend.desktop.projector_service import ProjectorOutputService, projector_output
from src.backend.desktop.storage_service import (
    PROJECT_EXTENSION,
    DesktopStorageService,
    _safe_filename,
    desktop_storage,
)
from src.backend.desktop.telegram_service import TelegramService, telegram_service
from src.backend.auth.gatekeeper import gatekeeper


class DesktopBridge:
    def __init__(
        self,
        storage: DesktopStorageService = desktop_storage,
        telegram: TelegramService = telegram_service,
        projector: ProjectorOutputService = projector_output,
    ):
        self._storage = storage
        self._telegram = telegram
        self._projector = projector
        self._window: Optional[Any] = None

    def _bind_window(self, window: Any, base_url: str, runtime_token: str) -> None:
        self._window = window
        self._projector.bind_main_window(
            window,
            f"{base_url}/projector/projector.html#runtime_token={quote(runtime_token)}",
        )

    def _prepare_app_close(self) -> None:
        try:
            self._projector.close()
        except Exception:
            pass

    def _shutdown(self) -> None:
        try:
            self._projector.close()
        except Exception:
            pass
        try:
            self._telegram.shutdown()
        except Exception:
            pass

    def _dialog_type(self, mode: str) -> Any:
        dialog_enum = getattr(webview, "FileDialog", None)
        if dialog_enum is not None:
            candidates = ("SAVE",) if mode == "save" else ("OPEN", "LOAD")
            for name in candidates:
                value = getattr(dialog_enum, name, None)
                if value is not None:
                    return value
        fallback_name = "SAVE_DIALOG" if mode == "save" else "OPEN_DIALOG"
        return getattr(webview, fallback_name)

    def _select_one(self, mode: str, **kwargs: Any) -> Optional[str]:
        if self._window is None:
            raise RuntimeError("Desktop window is not ready")
        result = self._window.create_file_dialog(self._dialog_type(mode), **kwargs)
        if not result:
            return None
        if isinstance(result, (list, tuple)):
            return str(result[0]) if result else None
        return str(result)

    def enter_workspace(self) -> Dict[str, Any]:
        if not gatekeeper.is_unlocked:
            raise PermissionError("Asta Studio is locked")
        if self._window is None:
            raise RuntimeError("Desktop window is not ready")

        width, height = 1440, 900
        self._window.resize(width, height)
        try:
            screens = list(webview.screens or [])
            if screens:
                screen = screens[0]
                x = int(getattr(screen, "x", 0) + max(0, (getattr(screen, "width", width) - width) / 2))
                y = int(getattr(screen, "y", 0) + max(0, (getattr(screen, "height", height) - height) / 2))
                self._window.move(x, y)
        except Exception:
            pass
        return {"ok": True}

    def get_startup_state(self) -> Dict[str, Any]:
        return self._storage.get_startup_state()

    def new_project_workspace(self) -> Dict[str, Any]:
        return self._storage.new_workspace()

    def update_settings(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        return self._storage.update_settings(patch)

    def open_project(self) -> Dict[str, Any]:
        settings = self._storage.load_settings()
        selected = self._select_one(
            "open",
            directory=settings.get("lastProjectDirectory") or "",
            allow_multiple=False,
            file_types=("Asta Studio (*.asta;*.ldp;*.json)",),
        )
        if not selected:
            return {"ok": False, "cancelled": True}
        return self._storage.open_project(selected)

    def open_recent(self, path: str) -> Dict[str, Any]:
        return self._storage.open_recent(path)

    def save_project(self, document: Dict[str, Any]) -> Dict[str, Any]:
        if self._storage.current_project_path is None:
            return self.save_project_as(document)
        return self._storage.save_project(document)

    def save_project_as(self, document: Dict[str, Any]) -> Dict[str, Any]:
        settings = self._storage.load_settings()
        suggested = f"{_safe_filename(str(document.get('projectName') or 'Untitled Project'))}{PROJECT_EXTENSION}"
        selected = self._select_one(
            "save",
            directory=settings.get("lastProjectDirectory") or "",
            save_filename=suggested,
            file_types=("Asta Studio (*.asta)",),
        )
        if not selected:
            return {"ok": False, "cancelled": True}
        path = Path(selected)
        if path.suffix.lower() != PROJECT_EXTENSION:
            path = path.with_suffix(PROJECT_EXTENSION)
        return self._storage.save_project(document, str(path))

    def remove_recent(self, path: str) -> Dict[str, Any]:
        return {"ok": True, "recent": self._storage.remove_recent(path)}

    def write_recovery(self, document: Dict[str, Any], revision: int = 0) -> Dict[str, Any]:
        return self._storage.write_recovery(document, revision)

    def restore_recovery(self, recovery_id: str) -> Dict[str, Any]:
        return self._storage.restore_recovery(recovery_id)

    def discard_recovery(self, project_id: str) -> Dict[str, Any]:
        return {"ok": True, "removed": self._storage.discard_recovery(project_id)}

    def export_history(self, report: Dict[str, Any]) -> Dict[str, Any]:
        settings = self._storage.load_settings()
        suggested = safe_history_filename(
            str(report.get("projectName") or "Asta Studio"),
            "all" if report.get("scope") == "all" else "view",
        )
        selected = self._select_one(
            "save",
            directory=settings.get("lastProjectDirectory") or "",
            save_filename=suggested,
            file_types=("Excel Workbook (*.xlsx)",),
        )
        if not selected:
            return {"ok": False, "cancelled": True}
        path = Path(selected)
        if path.suffix.lower() != ".xlsx":
            path = path.with_suffix(".xlsx")
        result = write_history_workbook(path, report)
        self._storage.update_settings({"lastProjectDirectory": str(path.parent)})
        return result

    def telegram_status(self, project_id: str = "") -> Dict[str, Any]:
        return self._telegram.status(project_id)

    def telegram_connect(self, token: str, group_chat_id: str = "") -> Dict[str, Any]:
        return self._telegram.connect(token, group_chat_id)

    def telegram_disconnect(self) -> Dict[str, Any]:
        return self._telegram.disconnect()

    def telegram_test_connection(self) -> Dict[str, Any]:
        return self._telegram.test_connection()

    def telegram_save_preferences(self, preferences: Dict[str, Any], validate_group: bool = False) -> Dict[str, Any]:
        return self._telegram.save_preferences(preferences, validate_group)

    def telegram_enqueue(self, jobs: list[Dict[str, Any]]) -> Dict[str, Any]:
        return self._telegram.enqueue_batch(jobs)

    def telegram_jobs(self, project_id: str = "", limit: int = 100) -> Dict[str, Any]:
        return {"ok": True, "jobs": self._telegram.list_jobs(project_id, limit)}

    def telegram_retry(self, job_id: str) -> Dict[str, Any]:
        return self._telegram.retry_job(job_id)

    def telegram_handle_redraw(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._telegram.handle_redraw(payload)

    def projector_status(self) -> Dict[str, Any]:
        return self._projector.status()

    def projector_toggle(self, display_id: str = "") -> Dict[str, Any]:
        return self._projector.toggle(display_id)

    def projector_select_display(self, display_id: str) -> Dict[str, Any]:
        return self._projector.select_display(display_id)

    def projector_close(self) -> Dict[str, Any]:
        return self._projector.close()

    def select_background_asset(self, kind: str) -> Dict[str, Any]:
        is_video = kind == "video"
        selected = self._select_one(
            "open",
            allow_multiple=False,
            file_types=(
                "Video files (*.mp4;*.webm;*.mov;*.mkv)"
                if is_video
                else "Image files (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp)",
            ),
        )
        if not selected:
            return {"ok": False, "cancelled": True}
        return {"ok": True, "asset": self._storage.import_asset(selected, "video" if is_video else "image")}

def _authenticated_bridge_call(method):
    @wraps(method)
    def secured(self, *args, **kwargs):
        if not gatekeeper.is_unlocked:
            raise PermissionError("Asta Studio is locked")
        return method(self, *args, **kwargs)

    return secured


for _method_name, _method in list(vars(DesktopBridge).items()):
    if _method_name.startswith("_") or _method_name == "enter_workspace" or not callable(_method):
        continue
    setattr(DesktopBridge, _method_name, _authenticated_bridge_call(_method))


desktop_bridge = DesktopBridge()
