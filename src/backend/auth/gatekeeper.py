# src/backend/auth/gatekeeper.py
import json
import os
import hashlib
import time
import requests
from typing import Dict, Any, Optional

from src.backend.config import (
    AUTH_TOKEN_FILE,
    DEFAULT_MASTER_PASSWORD_HASH,
    GOOGLE_APPS_SCRIPT_URL
)
from src.backend.auth.machine_id import get_hardware_fingerprint

class GatekeeperService:
    """
    Manages local authentication state, master password verification,
    and remote Gmail unlock requests/polling.
    """
    def __init__(self):
        self.machine_id = get_hardware_fingerprint()
        self.is_unlocked = False
        self._load_session()

    def _load_session(self):
        """Loads machine-bound authentication token if valid."""
        if os.path.exists(AUTH_TOKEN_FILE):
            try:
                with open(AUTH_TOKEN_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                # Verify that token belongs to THIS machine
                if data.get("machine_id") == self.machine_id and data.get("unlocked") is True:
                    self.is_unlocked = True
            except Exception:
                self.is_unlocked = False

    def _save_session(self, unlock_type: str):
        """Saves machine-bound unlock state."""
        try:
            payload = {
                "machine_id": self.machine_id,
                "unlocked": True,
                "unlock_type": unlock_type, # 'master_password' or 'remote_gmail'
                "timestamp": time.time()
            }
            with open(AUTH_TOKEN_FILE, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2)
            self.is_unlocked = True
        except Exception as e:
            print("Failed to save auth session:", e)

    def verify_master_password(self, password: str) -> bool:
        """Verifies direct password input against local SHA-256 hash."""
        pwd_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
        if pwd_hash == DEFAULT_MASTER_PASSWORD_HASH:
            self._save_session("master_password")
            return True
        return False

    def request_remote_unlock(self, client_name: str) -> Dict[str, Any]:
        """
        Sends a remote unlock request to the owner's Gmail via Google Apps Script Webhook.
        """
        payload = {
            "action": "request",
            "machine_id": self.machine_id,
            "client_name": client_name or "Event Staff Laptop",
            "timestamp": int(time.time())
        }
        try:
            if "script.google.com" not in GOOGLE_APPS_SCRIPT_URL or "YOUR_SCRIPT_ID_HERE" in GOOGLE_APPS_SCRIPT_URL:
                # If Apps Script not configured yet, return simulation info
                return {
                    "status": "SENT_SIMULATION",
                    "message": "Apps Script URL not set. In local test mode, use Master Password 'resolume2026' to unlock."
                }
            resp = requests.post(GOOGLE_APPS_SCRIPT_URL, json=payload, timeout=5)
            return resp.json()
        except Exception as e:
            return {"status": "ERROR", "message": str(e)}

    def check_remote_status(self) -> Dict[str, Any]:
        """
        Polls Google Apps Script to check if the owner has approved this machine in their Gmail.
        """
        try:
            if "YOUR_SCRIPT_ID_HERE" in GOOGLE_APPS_SCRIPT_URL:
                return {"approved": False, "message": "Awaiting Admin Gmail Configuration"}
                
            resp = requests.get(
                GOOGLE_APPS_SCRIPT_URL,
                params={"action": "check", "machine_id": self.machine_id},
                timeout=5
            )
            data = resp.json()
            if data.get("approved") is True:
                self._save_session("remote_gmail")
                return {"approved": True, "message": "Unlocked via Remote Gmail Approval!"}
            return {"approved": False, "message": "Pending Admin Approval..."}
        except Exception as e:
            return {"approved": False, "message": f"Error checking: {e}"}

    def lock_session(self):
        """Revokes local session and locks the console."""
        self.is_unlocked = False
        if os.path.exists(AUTH_TOKEN_FILE):
            try:
                os.remove(AUTH_TOKEN_FILE)
            except Exception:
                pass

gatekeeper = GatekeeperService()
