import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.backend.auth.gatekeeper import AuthenticationUnavailableError, gatekeeper


router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    password: str


class RemoteUnlockRequest(BaseModel):
    client_name: Optional[str] = "Event Computer"


class BlockRequest(BaseModel):
    duration: Optional[int] = 900
    reason: Optional[str] = "Blocked by Admin"


def _blocked_detail(remaining: float, reason: str) -> dict:
    return {
        "blocked": True,
        "blocked_remaining": max(0, int(remaining)),
        "block_reason": reason,
        "message": reason,
    }


def require_auth_simulator() -> None:
    if os.getenv("ASTA_AUTH_SIMULATOR", "").strip() != "1":
        raise HTTPException(status_code=404, detail="Not Found")


@router.get("/status")
def get_auth_status():
    sync_info = gatekeeper.sync_remote_password_from_super_admin()
    blocked, remaining, reason = gatekeeper.is_blocked()
    return {
        "unlocked": gatekeeper.is_unlocked if not blocked else False,
        "blocked": blocked,
        "blocked_remaining": max(0, int(remaining)),
        "block_reason": reason,
        "machine_id": gatekeeper.machine_id,
        "device_name": gatekeeper.device_name,
        "password_version": gatekeeper.password_version,
        "online": bool(sync_info.get("online")),
        "auth_ready": bool(sync_info.get("synced")),
        "sync": sync_info,
    }


@router.get("/session")
def get_auth_session():
    blocked, remaining, reason = gatekeeper.is_blocked()
    return {
        "unlocked": gatekeeper.is_unlocked if not blocked else False,
        "blocked": blocked,
        "blocked_remaining": max(0, int(remaining)),
        "block_reason": reason,
        "unlock_type": gatekeeper.unlock_type if gatekeeper.is_unlocked else "",
    }


@router.get("/sync-password")
def sync_password_override():
    result = gatekeeper.sync_remote_password_from_super_admin()
    if not result.get("synced"):
        raise HTTPException(status_code=503, detail=result.get("message") or "Internet connection required")
    return result


@router.post("/login")
def login_master_password(request: LoginRequest):
    blocked, remaining, reason = gatekeeper.is_blocked()
    if blocked:
        raise HTTPException(status_code=423, detail=_blocked_detail(remaining, reason))

    try:
        success = gatekeeper.verify_master_password(request.password)
    except AuthenticationUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        blocked, remaining, reason = gatekeeper.is_blocked()
        if blocked:
            raise HTTPException(status_code=423, detail=_blocked_detail(remaining, reason)) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not success:
        blocked, remaining, reason = gatekeeper.is_blocked()
        if blocked:
            raise HTTPException(status_code=423, detail=_blocked_detail(remaining, reason))
        raise HTTPException(status_code=401, detail="Incorrect password")

    return {"unlocked": True, "unlock_type": gatekeeper.unlock_type}


@router.post("/request-remote")
def request_remote_gmail_unlock(request: RemoteUnlockRequest):
    result = gatekeeper.request_remote_unlock(request.client_name or gatekeeper.device_name)
    if result.get("blocked"):
        raise HTTPException(
            status_code=423,
            detail=_blocked_detail(
                result.get("blocked_remaining", 900),
                str(result.get("block_reason") or result.get("message") or "Access blocked"),
            ),
        )
    if result.get("status") == "ERROR":
        status_code = 503 if result.get("offline") else 502
        raise HTTPException(status_code=status_code, detail=result.get("message") or "Request failed")
    return result


@router.get("/check-remote")
def check_remote_gmail_unlock():
    details = gatekeeper.check_remote_status()
    if details.get("offline"):
        raise HTTPException(status_code=503, detail=details.get("message") or "Internet connection required")
    return {"unlocked": gatekeeper.is_unlocked, "details": details}


@router.post("/logout")
def lock_console():
    gatekeeper.lock_session()
    return {"unlocked": False}


@router.post("/block", dependencies=[Depends(require_auth_simulator)])
def block_application(request: BlockRequest):
    return gatekeeper.block_app(request.duration or 900, request.reason or "Blocked by Admin")


@router.post("/unblock", dependencies=[Depends(require_auth_simulator)])
def unblock_application():
    return gatekeeper.unblock_app()
