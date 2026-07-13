from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from src.backend.desktop.storage_service import desktop_storage


router = APIRouter(prefix="/api/desktop", tags=["Desktop Storage"])


class DocumentRequest(BaseModel):
    document: Dict[str, Any]


class RecoveryRequest(DocumentRequest):
    revision: int = 0


class SettingsRequest(BaseModel):
    patch: Dict[str, Any]


class PathRequest(BaseModel):
    path: str


class LegacyMigrationRequest(BaseModel):
    storage: Dict[str, Any]


class ProjectorHub:
    def __init__(self) -> None:
        self.connections: list[WebSocket] = []
        self.snapshots: Dict[str, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.append(websocket)
        for payload in self.snapshots.values():
            await websocket.send_json(payload)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def publish(self, payload: Dict[str, Any], sender: WebSocket) -> None:
        message_type = str(payload.get("type") or "unknown")
        self.snapshots[message_type] = payload
        stale: list[WebSocket] = []
        for connection in self.connections:
            if connection is sender:
                continue
            try:
                await connection.send_json(payload)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)


projector_hub = ProjectorHub()


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, FileNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, PermissionError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/startup")
def get_startup_state():
    return desktop_storage.get_startup_state()


@router.post("/settings")
def update_settings(request: SettingsRequest):
    try:
        return desktop_storage.update_settings(request.patch)
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/projects/new")
def new_project_workspace():
    return desktop_storage.new_workspace()


@router.post("/projects/save")
def save_project(request: DocumentRequest):
    try:
        return desktop_storage.save_project(request.document)
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/projects/save-as-default")
def save_project_as_default(request: DocumentRequest):
    try:
        return desktop_storage.save_project_as_default(request.document)
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/projects/open-recent")
def open_recent(request: PathRequest):
    try:
        return desktop_storage.open_recent(request.path)
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/projects/remove-recent")
def remove_recent(request: PathRequest):
    try:
        return {"ok": True, "recent": desktop_storage.remove_recent(request.path)}
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/projects/upload")
def upload_project(file: UploadFile = File(...)):
    suffix = Path(file.filename or "import.ldp").suffix.lower()
    if suffix not in {".ldp", ".json"}:
        raise HTTPException(status_code=400, detail="Only .ldp and .json project files are supported")
    target = desktop_storage.imports_dir / f"{uuid.uuid4().hex}{suffix}"
    try:
        with target.open("wb") as destination:
            shutil.copyfileobj(file.file, destination, length=1024 * 1024)
        return desktop_storage.open_project(str(target), retain_path=False)
    except Exception as exc:
        _raise_http_error(exc)
    finally:
        file.file.close()
        target.unlink(missing_ok=True)


@router.post("/assets/upload/{kind}")
def upload_asset(kind: str, file: UploadFile = File(...)):
    normalized_kind = "video" if kind == "video" else "image"
    suffix = Path(file.filename or "asset").suffix
    target = desktop_storage.imports_dir / f"{uuid.uuid4().hex}{suffix}"
    try:
        with target.open("wb") as destination:
            shutil.copyfileobj(file.file, destination, length=1024 * 1024)
        asset = desktop_storage.import_asset(str(target), normalized_kind)
        asset["name"] = file.filename or asset["name"]
        return {"ok": True, "asset": asset}
    except Exception as exc:
        _raise_http_error(exc)
    finally:
        file.file.close()
        target.unlink(missing_ok=True)


@router.post("/recovery")
def write_recovery(request: RecoveryRequest):
    try:
        return desktop_storage.write_recovery(request.document, request.revision)
    except Exception as exc:
        _raise_http_error(exc)


@router.post("/recovery/restore/{recovery_id}")
def restore_recovery(recovery_id: str):
    try:
        return desktop_storage.restore_recovery(recovery_id)
    except Exception as exc:
        _raise_http_error(exc)


@router.delete("/recovery/{project_id}")
def discard_recovery(project_id: str):
    return {"ok": True, "removed": desktop_storage.discard_recovery(project_id)}


@router.post("/legacy/migrate")
def migrate_legacy_storage(request: LegacyMigrationRequest):
    try:
        return desktop_storage.migrate_legacy_storage(request.storage)
    except Exception as exc:
        _raise_http_error(exc)


@router.websocket("/projector/ws")
async def projector_socket(websocket: WebSocket):
    await projector_hub.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            payload = json.loads(raw)
            if isinstance(payload, dict):
                await projector_hub.publish(payload, websocket)
    except (WebSocketDisconnect, json.JSONDecodeError):
        projector_hub.disconnect(websocket)
    except Exception:
        projector_hub.disconnect(websocket)
