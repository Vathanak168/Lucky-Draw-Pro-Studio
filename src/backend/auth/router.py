# src/backend/auth/router.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.backend.auth.gatekeeper import gatekeeper

router = APIRouter(prefix="/api/auth", tags=["Authentication & Gatekeeper"])

class LoginRequest(BaseModel):
    password: str

class RemoteUnlockRequest(BaseModel):
    client_name: Optional[str] = "Event Crew Laptop"

@router.get("/status")
def get_auth_status():
    """Returns current lock status, unique Machine ID, and syncs Super Admin password over Wi-Fi."""
    sync_res = gatekeeper.sync_remote_password_from_super_admin()
    return {
        "unlocked": gatekeeper.is_unlocked,
        "machine_id": gatekeeper.machine_id,
        "password_version": gatekeeper.password_version,
        "sync": sync_res
    }

@router.get("/sync-password")
def sync_password_override():
    """Explicitly triggers a Wi-Fi sync to pull any new Super Admin global password."""
    res = gatekeeper.sync_remote_password_from_super_admin()
    return res

@router.post("/login")
def login_master_password(req: LoginRequest):
    """Verifies Master Password to unlock."""
    success = gatekeeper.verify_master_password(req.password)
    if not success:
        raise HTTPException(status_code=401, detail="Invalid Master Password")
    return {"unlocked": True, "message": "Access Granted"}

@router.post("/request-remote")
def request_remote_gmail_unlock(req: RemoteUnlockRequest):
    """Sends notification to Admin's Gmail requesting remote unlock."""
    res = gatekeeper.request_remote_unlock(req.client_name)
    return res

@router.get("/check-remote")
def check_remote_gmail_unlock():
    """Checks whether Admin approved the unlock via Gmail."""
    res = gatekeeper.check_remote_status()
    return {
        "unlocked": gatekeeper.is_unlocked,
        "details": res
    }

@router.post("/logout")
def lock_console():
    """Locks the console session."""
    gatekeeper.lock_session()
    return {"unlocked": False, "message": "Console Locked"}
