from __future__ import annotations

import copy
import json
import os
import re
import shutil
import tempfile
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, Optional
from urllib.parse import quote


APP_FOLDER_NAME = "LuckyDrawProStudio"
PROJECT_SCHEMA_VERSION = "7.0"
MAX_RECENT_FILES = 30
MAX_PROJECT_JSON_BYTES = 64 * 1024 * 1024
WORKSPACE_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_app_data_dir() -> Path:
    override = os.environ.get("LDP_APP_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / APP_FOLDER_NAME
    return Path.home() / ".local" / "share" / APP_FOLDER_NAME


def _safe_filename(value: str, fallback: str = "project") -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1F]+', "_", value or "").strip(" ._")
    return cleaned[:100] or fallback


def _deep_merge(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    result = copy.deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


class DesktopStorageService:
    def __init__(self, app_data_dir: Optional[Path] = None):
        self.app_data_dir = Path(app_data_dir or _default_app_data_dir()).resolve()
        self.settings_file = self.app_data_dir / "settings.json"
        self.recent_file = self.app_data_dir / "recent.json"
        self.recovery_dir = self.app_data_dir / "Recovery"
        self.workspaces_dir = self.app_data_dir / "Workspaces"
        self.projects_dir = self.app_data_dir / "Projects"
        self.imports_dir = self.app_data_dir / "Imports"
        self._lock = threading.RLock()
        self.current_project_path: Optional[Path] = None
        self.current_workspace_id = ""
        self._ensure_directories()
        self.new_workspace()

    def _ensure_directories(self) -> None:
        for directory in (
            self.app_data_dir,
            self.recovery_dir,
            self.workspaces_dir,
            self.projects_dir,
            self.imports_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)

    @property
    def current_workspace_dir(self) -> Path:
        return self.workspaces_dir / self.current_workspace_id

    def _workspace_is_referenced(self, workspace_id: str) -> bool:
        if not WORKSPACE_ID_PATTERN.fullmatch(workspace_id or ""):
            return False
        for path in self.recovery_dir.glob("*.recovery.json"):
            recovery = self._read_json(path, {})
            if isinstance(recovery, dict) and recovery.get("workspaceId") == workspace_id:
                return True
        return False

    def _remove_workspace_if_unused(self, workspace_id: str) -> None:
        if (
            not WORKSPACE_ID_PATTERN.fullmatch(workspace_id or "")
            or workspace_id == self.current_workspace_id
            or self._workspace_is_referenced(workspace_id)
        ):
            return
        shutil.rmtree(self.workspaces_dir / workspace_id, ignore_errors=True)

    def new_workspace(self) -> Dict[str, Any]:
        with self._lock:
            previous_workspace_id = self.current_workspace_id
            self.current_workspace_id = uuid.uuid4().hex
            (self.current_workspace_dir / "assets").mkdir(parents=True, exist_ok=True)
            self.current_project_path = None
            self._remove_workspace_if_unused(previous_workspace_id)
            return {
                "workspaceId": self.current_workspace_id,
                "projectPath": None,
            }

    def _atomic_write_bytes(self, target: Path, payload: bytes) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        temp_path: Optional[Path] = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb", delete=False, dir=target.parent, prefix=f".{target.name}.", suffix=".tmp"
            ) as handle:
                temp_path = Path(handle.name)
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, target)
        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink(missing_ok=True)

    def _atomic_write_json(self, target: Path, value: Any) -> None:
        payload = json.dumps(value, indent=2, ensure_ascii=False).encode("utf-8")
        self._atomic_write_bytes(target, payload)

    def _read_json(self, path: Path, default: Any) -> Any:
        try:
            with path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            return copy.deepcopy(default)

    def load_settings(self) -> Dict[str, Any]:
        defaults = {
            "ribbonMode": "all",
            "poolRibbonMode": "all",
            "telegramSettings": {"botToken": "", "groupChatId": ""},
            "lastProjectDirectory": "",
        }
        saved = self._read_json(self.settings_file, {})
        return _deep_merge(defaults, saved if isinstance(saved, dict) else {})

    def update_settings(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(patch, dict):
            raise ValueError("Settings patch must be an object")
        with self._lock:
            settings = _deep_merge(self.load_settings(), patch)
            self._atomic_write_json(self.settings_file, settings)
            return settings

    def list_recent(self) -> list[Dict[str, Any]]:
        raw = self._read_json(self.recent_file, [])
        if not isinstance(raw, list):
            return []
        result: list[Dict[str, Any]] = []
        for item in raw[:MAX_RECENT_FILES]:
            if not isinstance(item, dict) or not item.get("path"):
                continue
            entry = copy.deepcopy(item)
            entry["missing"] = not Path(entry["path"]).exists()
            result.append(entry)
        return result

    def _add_recent(self, path: Path, document: Dict[str, Any]) -> list[Dict[str, Any]]:
        resolved = path.resolve()
        existing = [item for item in self.list_recent() if Path(item["path"]).resolve() != resolved]
        entry = {
            "id": document.get("projectId") or uuid.uuid4().hex,
            "name": document.get("projectName") or resolved.stem,
            "path": str(resolved),
            "updatedAt": document.get("updatedAt") or _utc_now(),
            "lastOpenedAt": _utc_now(),
            "totalRounds": document.get("totalRounds") or 1,
            "participantCount": len(document.get("participants") or []),
            "missing": False,
        }
        recents = [entry, *existing][:MAX_RECENT_FILES]
        self._atomic_write_json(self.recent_file, recents)
        return recents

    def remove_recent(self, path: str) -> list[Dict[str, Any]]:
        requested = Path(path).resolve()
        with self._lock:
            recents = [item for item in self.list_recent() if Path(item["path"]).resolve() != requested]
            for item in recents:
                item.pop("missing", None)
            self._atomic_write_json(self.recent_file, recents)
            return self.list_recent()

    def get_startup_state(self) -> Dict[str, Any]:
        return {
            "settings": self.load_settings(),
            "recent": self.list_recent(),
            "recoveries": self.list_recoveries(),
            "workspaceId": self.current_workspace_id,
            "projectPath": str(self.current_project_path) if self.current_project_path else None,
            "appDataPath": str(self.app_data_dir),
        }

    def _validate_document(self, document: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(document, dict):
            raise ValueError("Project document must be an object")
        normalized = copy.deepcopy(document)
        normalized["appName"] = "LuckyDrawProStudio"
        normalized["schemaVersion"] = PROJECT_SCHEMA_VERSION
        normalized["projectId"] = str(normalized.get("projectId") or uuid.uuid4().hex)[:200]
        normalized["projectName"] = str(normalized.get("projectName") or "Untitled Project")[:200]
        normalized["updatedAt"] = _utc_now()
        normalized["createdAt"] = normalized.get("createdAt") or normalized["updatedAt"]
        normalized["participants"] = [
            item for item in (normalized.get("participants") or []) if isinstance(item, dict)
        ] if isinstance(normalized.get("participants"), list) else []
        normalized["prizeCategories"] = [
            str(item)[:200] for item in (normalized.get("prizeCategories") or []) if str(item).strip()
        ] if isinstance(normalized.get("prizeCategories"), list) else []
        normalized["categoryThemes"] = normalized.get("categoryThemes") if isinstance(normalized.get("categoryThemes"), dict) else {}
        normalized["categoryQuotas"] = normalized.get("categoryQuotas") if isinstance(normalized.get("categoryQuotas"), dict) else {}
        normalized["audioSettings"] = normalized.get("audioSettings") if isinstance(normalized.get("audioSettings"), dict) else {}
        normalized["displaySettings"] = normalized.get("displaySettings") if isinstance(normalized.get("displaySettings"), dict) else {}
        normalized["fontSizeCache"] = normalized.get("fontSizeCache") if isinstance(normalized.get("fontSizeCache"), dict) else {}
        normalized["roundConfigs"] = [
            item for item in (normalized.get("roundConfigs") or []) if isinstance(item, dict)
        ] if isinstance(normalized.get("roundConfigs"), list) else []
        normalized["drawState"] = normalized.get("drawState") if isinstance(normalized.get("drawState"), dict) else {}
        normalized["assets"] = [
            item for item in (normalized.get("assets") or []) if isinstance(item, dict)
        ] if isinstance(normalized.get("assets"), list) else []
        normalized["background"] = normalized.get("background") if isinstance(normalized.get("background"), dict) else {
            "type": "none",
            "assetId": None,
        }
        try:
            normalized["totalRounds"] = max(1, int(normalized.get("totalRounds") or 1))
        except (TypeError, ValueError, OverflowError):
            normalized["totalRounds"] = 1
        normalized["activeCategoryTab"] = str(normalized.get("activeCategoryTab") or "All")[:200]
        return normalized

    def _portable_document(self, document: Dict[str, Any]) -> Dict[str, Any]:
        portable = self._validate_document(document)
        portable.pop("runtime", None)
        for asset in portable.get("assets", []):
            if isinstance(asset, dict):
                asset.pop("url", None)
                asset.pop("originalPath", None)
                asset.pop("workspaceId", None)
        return portable

    def _asset_source(self, asset: Dict[str, Any]) -> Optional[Path]:
        relative = asset.get("relativePath")
        if not relative:
            return None
        relative_path = PurePosixPath(str(relative).replace("\\", "/"))
        if relative_path.is_absolute() or ".." in relative_path.parts:
            return None
        candidate = (self.current_workspace_dir / Path(*relative_path.parts)).resolve()
        workspace = self.current_workspace_dir.resolve()
        if workspace not in candidate.parents or not candidate.is_file():
            return None
        return candidate

    def _write_project_package(self, target: Path, document: Dict[str, Any]) -> Dict[str, Any]:
        target.parent.mkdir(parents=True, exist_ok=True)
        temp_path: Optional[Path] = None
        portable = self._portable_document(document)
        project_json = json.dumps(portable, indent=2, ensure_ascii=False).encode("utf-8")
        if len(project_json) > MAX_PROJECT_JSON_BYTES:
            raise ValueError("Project data is too large")
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb", delete=False, dir=target.parent, prefix=f".{target.name}.", suffix=".tmp"
            ) as handle:
                temp_path = Path(handle.name)

            with zipfile.ZipFile(temp_path, mode="w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                archive.writestr("project.json", project_json)
                for asset in portable.get("assets", []):
                    source = self._asset_source(asset)
                    relative = str(asset.get("relativePath") or "").replace("\\", "/")
                    relative_path = PurePosixPath(relative)
                    if (
                        not source
                        or not relative.startswith("assets/")
                        or relative_path.is_absolute()
                        or ".." in relative_path.parts
                    ):
                        raise ValueError(f"Project asset is missing or invalid: {asset.get('name') or relative or 'unknown'}")
                    kind = str(asset.get("kind") or "").lower()
                    compression = zipfile.ZIP_STORED if kind == "video" else zipfile.ZIP_DEFLATED
                    archive.write(source, arcname=relative, compress_type=compression)

            with zipfile.ZipFile(temp_path, mode="r") as archive:
                if "project.json" not in archive.namelist() or archive.testzip() is not None:
                    raise ValueError("Project package validation failed")

            with temp_path.open("r+b") as handle:
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, target)
            return portable
        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink(missing_ok=True)

    def save_project(self, document: Dict[str, Any], path: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            target = Path(path).expanduser() if path else self.current_project_path
            if target is None:
                name = _safe_filename(str(document.get("projectName") or "Untitled Project"))
                target = self._available_project_path(name)
            if target.suffix.lower() != ".ldp":
                target = target.with_suffix(".ldp")
            target = target.resolve()
            normalized = self._write_project_package(target, document)
            self.current_project_path = target
            recents = self._add_recent(target, normalized)
            self.discard_recovery(str(normalized["projectId"]))
            self.update_settings({"lastProjectDirectory": str(target.parent)})
            return {
                "ok": True,
                "path": str(target),
                "name": normalized["projectName"],
                "projectId": normalized["projectId"],
                "updatedAt": normalized["updatedAt"],
                "recent": recents,
            }

    def _available_project_path(self, name: str) -> Path:
        stem = _safe_filename(name, "Untitled Project")
        candidate = self.projects_dir / f"{stem}.ldp"
        index = 2
        while candidate.exists():
            candidate = self.projects_dir / f"{stem} ({index}).ldp"
            index += 1
        return candidate

    def save_project_as_default(self, document: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            name = str(document.get("projectName") or "Untitled Project")
            return self.save_project(document, str(self._available_project_path(name)))

    def _safe_extract_assets(self, archive: zipfile.ZipFile, workspace: Path) -> None:
        workspace_resolved = workspace.resolve()
        for info in archive.infolist():
            normalized = PurePosixPath(info.filename)
            if info.is_dir() or not normalized.parts or normalized.parts[0] != "assets":
                continue
            if normalized.is_absolute() or ".." in normalized.parts:
                raise ValueError("Unsafe asset path in project package")
            target = (workspace / Path(*normalized.parts)).resolve()
            if workspace_resolved not in target.parents:
                raise ValueError("Unsafe asset extraction target")
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info, "r") as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)

    def _attach_runtime_assets(self, document: Dict[str, Any]) -> Dict[str, Any]:
        hydrated = copy.deepcopy(document)
        valid_assets: list[Dict[str, Any]] = []
        for asset in hydrated.get("assets", []):
            if not asset.get("relativePath") or not self._asset_source(asset):
                continue
            relative = str(asset["relativePath"]).replace("\\", "/")
            encoded = "/".join(quote(part) for part in PurePosixPath(relative).parts)
            asset["workspaceId"] = self.current_workspace_id
            asset["url"] = f"/local-assets/{self.current_workspace_id}/{encoded}"
            valid_assets.append(asset)
        hydrated["assets"] = valid_assets
        valid_asset_ids = {asset.get("id") for asset in valid_assets}
        background = hydrated.get("background") or {}
        if background.get("assetId") not in valid_asset_ids:
            hydrated["background"] = {"type": "none", "assetId": None}
        hydrated["runtime"] = {
            "workspaceId": self.current_workspace_id,
            "projectPath": str(self.current_project_path) if self.current_project_path else None,
        }
        return hydrated

    def open_project(self, path: str, retain_path: bool = True) -> Dict[str, Any]:
        source = Path(path).expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Project file not found: {source}")
        with self._lock:
            previous_workspace_id = self.current_workspace_id
            next_workspace_id = uuid.uuid4().hex
            next_workspace = self.workspaces_dir / next_workspace_id
            (next_workspace / "assets").mkdir(parents=True, exist_ok=True)
            try:
                if zipfile.is_zipfile(source):
                    with zipfile.ZipFile(source, mode="r") as archive:
                        try:
                            project_info = archive.getinfo("project.json")
                        except KeyError as exc:
                            raise ValueError("The .ldp package has no project.json") from exc
                        if project_info.file_size > MAX_PROJECT_JSON_BYTES:
                            raise ValueError("Project data is too large")
                        document = json.loads(archive.read(project_info).decode("utf-8"))
                        self._safe_extract_assets(archive, next_workspace)
                else:
                    with source.open("r", encoding="utf-8-sig") as handle:
                        document = json.load(handle)
                normalized = self._validate_document(document)
            except Exception:
                shutil.rmtree(next_workspace, ignore_errors=True)
                raise

            self.current_workspace_id = next_workspace_id
            self.current_project_path = source if retain_path else None
            self._remove_workspace_if_unused(previous_workspace_id)
            recents = self._add_recent(source, normalized) if retain_path else self.list_recent()
            return {
                "ok": True,
                "path": str(source) if retain_path else None,
                "document": self._attach_runtime_assets(normalized),
                "recent": recents,
            }

    def open_recent(self, path: str) -> Dict[str, Any]:
        requested = Path(path).expanduser().resolve()
        allowed = {Path(item["path"]).resolve() for item in self.list_recent()}
        if requested not in allowed:
            raise PermissionError("The requested file is not in Recent Projects")
        return self.open_project(str(requested))

    def import_asset(self, path: str, kind: str) -> Dict[str, Any]:
        source = Path(path).expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Asset not found: {source}")
        normalized_kind = "video" if kind == "video" else "image"
        filename = f"{uuid.uuid4().hex[:10]}_{_safe_filename(source.name, 'asset')}"
        relative = PurePosixPath("assets") / filename
        destination = self.current_workspace_dir / "assets" / filename
        shutil.copy2(source, destination)
        encoded = "/".join(quote(part) for part in relative.parts)
        return {
            "id": uuid.uuid4().hex,
            "kind": normalized_kind,
            "name": source.name,
            "relativePath": str(relative),
            "workspaceId": self.current_workspace_id,
            "url": f"/local-assets/{self.current_workspace_id}/{encoded}",
        }

    def write_recovery(self, document: Dict[str, Any], revision: int = 0) -> Dict[str, Any]:
        with self._lock:
            portable = self._portable_document(document)
            project_id = _safe_filename(str(portable.get("projectId") or "untitled"), "untitled")
            target = self.recovery_dir / f"{project_id}.recovery.json"
            recovery = {
                "schemaVersion": 1,
                "savedAt": _utc_now(),
                "revision": int(revision or 0),
                "workspaceId": self.current_workspace_id,
                "projectPath": str(self.current_project_path) if self.current_project_path else None,
                "document": portable,
            }
            current = self._read_json(target, {})
            if isinstance(current, dict) and int(current.get("revision") or 0) > recovery["revision"]:
                return {"ok": True, "ignored": True, "revision": current.get("revision")}
            self._atomic_write_json(target, recovery)
            return {"ok": True, "id": project_id, "savedAt": recovery["savedAt"], "revision": recovery["revision"]}

    def list_recoveries(self) -> list[Dict[str, Any]]:
        result: list[Dict[str, Any]] = []
        for path in self.recovery_dir.glob("*.recovery.json"):
            recovery = self._read_json(path, None)
            if not isinstance(recovery, dict) or not isinstance(recovery.get("document"), dict):
                continue
            document = recovery["document"]
            result.append({
                "id": path.name.removesuffix(".recovery.json"),
                "name": document.get("projectName") or "Recovered Project",
                "savedAt": recovery.get("savedAt"),
                "revision": recovery.get("revision") or 0,
                "projectPath": recovery.get("projectPath"),
            })
        result.sort(key=lambda item: item.get("savedAt") or "", reverse=True)
        return result

    def restore_recovery(self, recovery_id: str) -> Dict[str, Any]:
        with self._lock:
            safe_id = _safe_filename(recovery_id, "")
            path = self.recovery_dir / f"{safe_id}.recovery.json"
            recovery = self._read_json(path, None)
            if not isinstance(recovery, dict) or not isinstance(recovery.get("document"), dict):
                raise FileNotFoundError("Recovery file was not found or is invalid")
            previous_workspace_id = self.current_workspace_id
            workspace_id = str(recovery.get("workspaceId") or "")
            workspace = self.workspaces_dir / workspace_id
            if WORKSPACE_ID_PATTERN.fullmatch(workspace_id) and workspace.is_dir():
                self.current_workspace_id = workspace_id
                self._remove_workspace_if_unused(previous_workspace_id)
            else:
                self.new_workspace()
            project_path = recovery.get("projectPath")
            self.current_project_path = Path(project_path).resolve() if project_path else None
            document = self._validate_document(recovery["document"])
            return {
                "ok": True,
                "path": str(self.current_project_path) if self.current_project_path else None,
                "document": self._attach_runtime_assets(document),
                "recent": self.list_recent(),
            }

    def discard_recovery(self, project_id: str) -> bool:
        with self._lock:
            safe_id = _safe_filename(project_id, "")
            if not safe_id:
                return False
            target = self.recovery_dir / f"{safe_id}.recovery.json"
            recovery = self._read_json(target, {})
            workspace_id = str(recovery.get("workspaceId") or "") if isinstance(recovery, dict) else ""
            existed = target.exists()
            target.unlink(missing_ok=True)
            self._remove_workspace_if_unused(workspace_id)
            return existed

    def _parse_legacy_json(self, payload: Dict[str, Any], key: str, default: Any) -> Any:
        raw = payload.get(key)
        if raw is None or raw == "":
            return copy.deepcopy(default)
        if not isinstance(raw, str):
            return copy.deepcopy(raw)
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return copy.deepcopy(default)

    def migrate_legacy_storage(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("Legacy storage payload must be an object")
        participants = self._parse_legacy_json(payload, "luckyDrawParticipants", [])
        setup = self._parse_legacy_json(payload, "luckyDrawSetupData", {})
        draw_state = self._parse_legacy_json(payload, "luckyDrawState", {})
        saved_projects = self._parse_legacy_json(payload, "luckyDrawSavedProjects", [])
        category_quotas = self._parse_legacy_json(payload, "luckyDrawCategoryQuotas", {})
        audio_settings = self._parse_legacy_json(payload, "luckyDrawAudioSettings", {})
        telegram_settings = self._parse_legacy_json(payload, "luckyDrawTelegramSettings", {})
        setup = setup if isinstance(setup, dict) else {}
        participants = participants if isinstance(participants, list) else []
        draw_state = draw_state if isinstance(draw_state, dict) else {}
        saved_projects = saved_projects if isinstance(saved_projects, list) else []
        category_quotas = category_quotas if isinstance(category_quotas, dict) else {}
        audio_settings = audio_settings if isinstance(audio_settings, dict) else {}
        telegram_settings = telegram_settings if isinstance(telegram_settings, dict) else {}
        recovered: list[str] = []

        if isinstance(draw_state.get("settings"), dict):
            draw_state = copy.deepcopy(draw_state)
            draw_state["settings"].pop("bgImage", None)
            draw_state["settings"].pop("bgVideo", None)

        preference_patch: Dict[str, Any] = {}
        if telegram_settings:
            preference_patch["telegramSettings"] = telegram_settings
        if payload.get("ldp_ribbon_mode"):
            preference_patch["ribbonMode"] = payload["ldp_ribbon_mode"]
        if payload.get("ldp_pool_ribbon_mode"):
            preference_patch["poolRibbonMode"] = payload["ldp_pool_ribbon_mode"]
        if preference_patch:
            self.update_settings(preference_patch)

        candidates: Iterable[Dict[str, Any]] = saved_projects
        candidates = [item for item in candidates if isinstance(item, dict)]
        if not candidates:
            candidates = [{
                "name": setup.get("currentProjectName") if isinstance(setup, dict) else "Recovered Browser Project",
                "participants": participants,
                "prizeCategories": setup.get("prizeCategories") if isinstance(setup, dict) else None,
                "categoryThemes": setup.get("categoryThemes") if isinstance(setup, dict) else None,
                "roundConfigs": setup.get("roundConfigs") if isinstance(setup, dict) else None,
                "displaySettings": setup.get("displaySettings") if isinstance(setup, dict) else None,
                "totalRounds": setup.get("totalRounds") if isinstance(setup, dict) else 1,
            }]

        for index, snapshot in enumerate(candidates):
            name = str(snapshot.get("name") or snapshot.get("projectName") or f"Recovered Browser Project {index + 1}")
            document = {
                "appName": "LuckyDrawProStudio",
                "schemaVersion": PROJECT_SCHEMA_VERSION,
                "projectId": uuid.uuid4().hex,
                "projectName": name,
                "prizeCategories": snapshot.get("prizeCategories") or setup.get("prizeCategories") or [],
                "categoryThemes": snapshot.get("categoryThemes") or setup.get("categoryThemes") or {},
                "categoryQuotas": setup.get("categoryQuotas") or category_quotas or {},
                "audioSettings": setup.get("audioSettings") or audio_settings or {},
                "totalRounds": snapshot.get("totalRounds") or setup.get("totalRounds") or 1,
                "roundConfigs": snapshot.get("roundConfigs") or setup.get("roundConfigs") or [],
                "displaySettings": snapshot.get("displaySettings") or setup.get("displaySettings") or {},
                "participants": snapshot.get("participants") or participants or [],
                "drawState": draw_state if index == 0 and isinstance(draw_state, dict) else {},
                "assets": [],
                "background": {"type": "none", "assetId": None},
            }
            target = self._available_project_path(name)
            normalized = self._write_project_package(target, document)
            self._add_recent(target, normalized)
            recovered.append(str(target.resolve()))

        return {"ok": True, "recoveredFiles": recovered, "recent": self.list_recent()}


desktop_storage = DesktopStorageService()
