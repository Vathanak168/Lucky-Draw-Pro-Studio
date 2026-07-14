from __future__ import annotations

import threading
from typing import Any, Dict, Optional

import webview

from src.backend.desktop.storage_service import DesktopStorageService, desktop_storage


class ProjectorOutputService:
    def __init__(
        self,
        storage: DesktopStorageService = desktop_storage,
        *,
        webview_module: Any = webview,
    ) -> None:
        self.storage = storage
        self.webview = webview_module
        self._lock = threading.RLock()
        self._main_window: Optional[Any] = None
        self._output_window: Optional[Any] = None
        self._active_display_id = ""
        self._projector_url = ""

    def bind_main_window(self, window: Any, projector_url: str) -> None:
        with self._lock:
            self._main_window = window
            self._projector_url = str(projector_url or "").strip()
        events = getattr(window, "events", None)
        if events and getattr(events, "closed", None):
            events.closed += self._handle_main_closed

    @staticmethod
    def _screen_id(screen: Any) -> str:
        return ":".join(
            str(int(getattr(screen, field, 0) or 0))
            for field in ("x", "y", "width", "height")
        )

    def _get_screens(self) -> list[Any]:
        try:
            return list(self.webview.screens or [])
        except Exception as exc:
            raise RuntimeError("Connected displays could not be detected") from exc

    def _main_screen_id(self, screens: list[Any]) -> str:
        if not screens:
            return ""
        window = self._main_window
        if window is None:
            return self._screen_id(screens[0])
        try:
            center_x = int(window.x) + max(1, int(window.width)) // 2
            center_y = int(window.y) + max(1, int(window.height)) // 2
            for screen in screens:
                left = int(getattr(screen, "x", 0) or 0)
                top = int(getattr(screen, "y", 0) or 0)
                right = left + int(getattr(screen, "width", 0) or 0)
                bottom = top + int(getattr(screen, "height", 0) or 0)
                if left <= center_x < right and top <= center_y < bottom:
                    return self._screen_id(screen)
        except Exception:
            pass
        return self._screen_id(screens[0])

    def _display_records(self) -> tuple[list[Dict[str, Any]], Dict[str, Any]]:
        screens = self._get_screens()
        main_screen_id = self._main_screen_id(screens)
        records: list[Dict[str, Any]] = []
        lookup: Dict[str, Any] = {}
        for index, screen in enumerate(screens):
            screen_id = self._screen_id(screen)
            is_main = screen_id == main_screen_id
            width = int(getattr(screen, "width", 0) or 0)
            height = int(getattr(screen, "height", 0) or 0)
            record = {
                "id": screen_id,
                "index": index,
                "number": index + 1,
                "label": f"Display {index + 1} - {width} x {height}",
                "width": width,
                "height": height,
                "x": int(getattr(screen, "x", 0) or 0),
                "y": int(getattr(screen, "y", 0) or 0),
                "scale": float(getattr(screen, "scale", 1.0) or 1.0),
                "isMain": is_main,
                "isExternal": not is_main,
            }
            records.append(record)
            if not is_main:
                lookup[screen_id] = screen
        return records, lookup

    def _is_active(self) -> bool:
        window = self._output_window
        if window is None:
            return False
        closed = getattr(getattr(window, "events", None), "closed", None)
        if closed and closed.is_set():
            self._output_window = None
            return False
        return True

    def status(self) -> Dict[str, Any]:
        stale_output = None
        with self._lock:
            displays, external_lookup = self._display_records()
            settings = self.storage.load_settings()
            selected_id = str(settings.get("projectorDisplayId") or "")
            if selected_id not in external_lookup:
                selected_id = next(iter(external_lookup), "")
            active = self._is_active()
            if active and self._active_display_id not in external_lookup:
                stale_output = self._output_window
                self._output_window = None
                self._active_display_id = ""
                active = False
            active_id = self._active_display_id if active else ""
            result = {
                "ok": True,
                "native": self._main_window is not None,
                "active": active,
                "canOpen": bool(external_lookup) and self._main_window is not None,
                "selectedDisplayId": selected_id,
                "activeDisplayId": active_id,
                "externalDisplayCount": len(external_lookup),
                "displays": displays,
            }
        if stale_output is not None:
            try:
                stale_output.destroy()
            except Exception:
                pass
        return result

    def open(self, display_id: str = "") -> Dict[str, Any]:
        with self._lock:
            if self._main_window is None or not self._projector_url:
                raise RuntimeError("Desktop projector output is not ready")
            if self._is_active():
                return self.status()

            _displays, external_lookup = self._display_records()
            settings = self.storage.load_settings()
            target_id = str(display_id or settings.get("projectorDisplayId") or "")
            if target_id not in external_lookup:
                target_id = next(iter(external_lookup), "")
            if not target_id:
                raise RuntimeError("External Display Not Found. Set Windows display mode to Extend.")

            screen = external_lookup[target_id]
            self.storage.update_settings({"projectorDisplayId": target_id})
            try:
                output = self.webview.create_window(
                    "Asta Output",
                    url=self._projector_url,
                    width=max(1, int(getattr(screen, "width", 1920) or 1920)),
                    height=max(1, int(getattr(screen, "height", 1080) or 1080)),
                    screen=screen,
                    resizable=False,
                    fullscreen=True,
                    frameless=True,
                    easy_drag=False,
                    shadow=False,
                    focus=False,
                    on_top=True,
                    background_color="#000000",
                    text_select=False,
                    zoomable=False,
                )
            except Exception as exc:
                raise RuntimeError("Projector output window could not be created") from exc
            if output is None:
                raise RuntimeError("Projector output window could not be created")
            self._output_window = output
            self._active_display_id = target_id
            events = getattr(output, "events", None)
            if events and getattr(events, "closed", None):
                events.closed += self._handle_output_closed
            return self.status()

    def close(self) -> Dict[str, Any]:
        self._destroy_output()
        return self.status()

    def toggle(self, display_id: str = "") -> Dict[str, Any]:
        with self._lock:
            active = self._is_active()
        return self.close() if active else self.open(display_id)

    def select_display(self, display_id: str) -> Dict[str, Any]:
        display_id = str(display_id or "").strip()
        with self._lock:
            _displays, external_lookup = self._display_records()
            if display_id not in external_lookup:
                raise ValueError("Selected external display is not available")
            was_active = self._is_active()
            self.storage.update_settings({"projectorDisplayId": display_id})
        if was_active:
            self._destroy_output()
            return self.open(display_id)
        return self.status()

    def _destroy_output(self) -> None:
        with self._lock:
            output = self._output_window
            self._output_window = None
            self._active_display_id = ""
        if output is None:
            return
        closed = getattr(getattr(output, "events", None), "closed", None)
        if closed and closed.is_set():
            return
        try:
            output.destroy()
        except Exception:
            pass

    def _handle_output_closed(self, window: Any = None) -> None:
        with self._lock:
            if window is None or self._output_window is window:
                self._output_window = None
                self._active_display_id = ""

    def _handle_main_closed(self, window: Any = None) -> None:
        self._destroy_output()


projector_output = ProjectorOutputService(desktop_storage)
