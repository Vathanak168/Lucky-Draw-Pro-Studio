from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

import webview

from src.backend.desktop.history_report import safe_history_filename, write_history_workbook
from src.backend.desktop.storage_service import DesktopStorageService, _safe_filename, desktop_storage


class DesktopBridge:
    def __init__(self, storage: DesktopStorageService = desktop_storage):
        self._storage = storage
        self._window: Optional[Any] = None

    def _bind_window(self, window: Any) -> None:
        self._window = window

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
            file_types=("Lucky Draw Pro Studio (*.ldp;*.json)",),
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
        suggested = f"{_safe_filename(str(document.get('projectName') or 'Untitled Project'))}.ldp"
        selected = self._select_one(
            "save",
            directory=settings.get("lastProjectDirectory") or "",
            save_filename=suggested,
            file_types=("Lucky Draw Pro Studio (*.ldp)",),
        )
        if not selected:
            return {"ok": False, "cancelled": True}
        path = Path(selected)
        if path.suffix.lower() != ".ldp":
            path = path.with_suffix(".ldp")
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
            str(report.get("projectName") or "Lucky Draw"),
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


desktop_bridge = DesktopBridge()
