# src/backend/auth/gatekeeper.py
import json
import os
import hashlib
import time
import requests
from typing import Dict, Any, Optional

from src.backend.config import (
    AUTH_TOKEN_FILE,
    SYNC_PASSWORD_FILE,
    BLOCK_STATE_FILE,
    MAX_FAILED_ATTEMPTS,
    MAX_REMOTE_REQUESTS,
    DEFAULT_BLOCK_DURATION_SECONDS,
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
        self.current_password_hash = DEFAULT_MASTER_PASSWORD_HASH
        self.password_version = 0
        self.failed_attempts = 0
        self.remote_request_count = 0
        self._load_synced_password()
        self._load_session()
        # Initial background check for Super Admin overrides on startup
        try:
            self.sync_remote_password_from_super_admin()
        except Exception:
            pass

    def is_blocked(self):
        """Checks if the app is currently in a security block/lockdown state."""
        if os.path.exists(BLOCK_STATE_FILE):
            try:
                with open(BLOCK_STATE_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                blocked_until = float(data.get("blocked_until", 0))
                remaining = blocked_until - time.time()
                if remaining > 0:
                    return (True, remaining, data.get("reason", "App Blocked by Security Gateway"))
                else:
                    os.remove(BLOCK_STATE_FILE)
                    self.failed_attempts = 0
                    self.remote_request_count = 0
            except Exception:
                pass
        return (False, 0, "")

    def block_app(self, duration_seconds: int = DEFAULT_BLOCK_DURATION_SECONDS, reason: str = "Exceeded request attempts") -> Dict[str, Any]:
        """Locks down and blocks the application for a specified duration."""
        blocked_until = time.time() + duration_seconds
        payload = {
            "machine_id": self.machine_id,
            "blocked_until": blocked_until,
            "duration": duration_seconds,
            "reason": reason,
            "timestamp": time.time()
        }
        try:
            with open(BLOCK_STATE_FILE, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2)
            self.is_unlocked = False
            if os.path.exists(AUTH_TOKEN_FILE):
                try:
                    os.remove(AUTH_TOKEN_FILE)
                except Exception:
                    pass
            print(f"[{time.ctime()}] 🚨 APP BLOCKED FOR {duration_seconds}s! Reason: {reason}")
        except Exception as e:
            print("Failed to save block state:", e)
        return {"blocked": True, "blocked_until": blocked_until, "duration": duration_seconds, "reason": reason}

    def unblock_app(self) -> Dict[str, Any]:
        """Clears the application block state."""
        self.failed_attempts = 0
        self.remote_request_count = 0
        if os.path.exists(BLOCK_STATE_FILE):
            try:
                os.remove(BLOCK_STATE_FILE)
            except Exception:
                pass
        return {"blocked": False, "message": "App Unblocked successfully!"}

    def _load_synced_password(self):
        """Loads synced password override from Super Admin if previously saved locally."""
        if os.path.exists(SYNC_PASSWORD_FILE):
            try:
                with open(SYNC_PASSWORD_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if data.get("password_hash"):
                    self.current_password_hash = data.get("password_hash")
                    self.password_version = int(data.get("version", 0))
            except Exception:
                pass

    def _save_synced_password(self, pwd_hash: str, version: int, plain_pwd: str = ""):
        """Saves synced password override locally so it works offline too."""
        try:
            payload = {
                "password_hash": pwd_hash,
                "version": version,
                "timestamp": time.time()
            }
            with open(SYNC_PASSWORD_FILE, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2)
            self.current_password_hash = pwd_hash
            self.password_version = version
        except Exception as e:
            print("Failed to save synced password:", e)

    def sync_remote_password_from_super_admin(self) -> Dict[str, Any]:
        """
        Checks Google Apps Script via Wi-Fi/Internet for Super Admin global password overrides.
        If Wi-Fi is connected and Super Admin changed the password, immediately overrides all laptops!
        """
        try:
            if "script.google.com" not in GOOGLE_APPS_SCRIPT_URL or "YOUR_SCRIPT_ID_HERE" in GOOGLE_APPS_SCRIPT_URL:
                return {"synced": False, "message": "Apps Script URL not set"}
            
            # Fast non-blocking check over Wi-Fi
            resp = requests.get(
                GOOGLE_APPS_SCRIPT_URL,
                params={"action": "sync_password", "machine_id": self.machine_id},
                timeout=3
            )
            if resp.status_code == 200:
                data = resp.json()
                global_pwd = data.get("global_password")
                new_version = int(data.get("password_version", 0))
                
                if global_pwd and new_version > self.password_version:
                    new_hash = hashlib.sha256(global_pwd.encode('utf-8')).hexdigest()
                    self._save_synced_password(new_hash, new_version, global_pwd)
                    print(f"[{time.ctime()}] 🚀 SUPER ADMIN PASSWORD OVERRIDDEN OVER WI-FI! Version: {new_version}")
                    return {
                        "synced": True,
                        "updated": True,
                        "version": new_version,
                        "message": "Master Password immediately updated from Super Admin over Wi-Fi!"
                    }
                return {"synced": True, "updated": False, "version": self.password_version}
        except Exception as e:
            # If offline / no Wi-Fi, silently catch connection error
            return {"synced": False, "offline": True, "message": "Offline (No Wi-Fi). Will sync immediately once connected."}

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
        """Verifies direct password input against Super Admin synced password or local hash."""
        blocked, remaining, reason = self.is_blocked()
        if blocked:
            raise Exception(f"🚨 APP BLOCKED: {reason}. Time remaining: {int(remaining)}s")

        # Attempt immediate Wi-Fi sync before verification
        self.sync_remote_password_from_super_admin()
        pwd_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
        if pwd_hash == self.current_password_hash or pwd_hash == DEFAULT_MASTER_PASSWORD_HASH:
            self.failed_attempts = 0
            self._save_session("master_password")
            return True
        
        self.failed_attempts += 1
        if self.failed_attempts >= MAX_FAILED_ATTEMPTS:
            self.block_app(DEFAULT_BLOCK_DURATION_SECONDS, f"Exceeded {MAX_FAILED_ATTEMPTS} wrong master password attempts")
            raise Exception(f"🚨 APP BLOCKED: Exceeded {MAX_FAILED_ATTEMPTS} wrong password attempts. Locked for 15 minutes.")
        return False

    def request_remote_unlock(self, client_name: str) -> Dict[str, Any]:
        """
        Sends a remote unlock request to the owner's Gmail via Google Apps Script Webhook.
        Blocks app if user spams too many requests!
        """
        blocked, remaining, reason = self.is_blocked()
        if blocked:
            return {"status": "ERROR", "blocked": True, "message": f"🚨 APP BLOCKED: {reason}. Time remaining: {int(remaining)}s"}

        self.remote_request_count += 1
        if self.remote_request_count > MAX_REMOTE_REQUESTS:
            block_info = self.block_app(DEFAULT_BLOCK_DURATION_SECONDS, f"Exceeded request limit ({MAX_REMOTE_REQUESTS} requests). Blocked to prevent spamming Admin Gmail.")
            return {"status": "ERROR", "blocked": True, "message": block_info["reason"], "blocked_until": block_info["blocked_until"]}

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
        Polls Google Apps Script to check approval AND sync Super Admin global password over Wi-Fi.
        Also checks if Admin/Super Admin clicked 'Block App' in Gmail!
        """
        try:
            blocked, remaining, reason = self.is_blocked()
            if blocked:
                return {"approved": False, "blocked": True, "blocked_until": time.time() + remaining, "message": f"🚨 APP BLOCKED: {reason} ({int(remaining)}s remaining)"}

            # Automatically check for Super Admin password changes on every polling heartbeat!
            sync_info = self.sync_remote_password_from_super_admin()
            
            if "YOUR_SCRIPT_ID_HERE" in GOOGLE_APPS_SCRIPT_URL:
                return {"approved": False, "message": "Awaiting Admin Gmail Configuration", "sync": sync_info}
                
            resp = requests.get(
                GOOGLE_APPS_SCRIPT_URL,
                params={"action": "check", "machine_id": self.machine_id},
                timeout=5
            )
            data = resp.json()
            # Check if Admin/Super Admin issued a block instruction from Gmail
            if data.get("blocked") is True or str(data.get("message")).startswith("🚨 BLOCKED") or str(data.get("status")).startswith("BLOCKED"):
                duration = int(data.get("duration", DEFAULT_BLOCK_DURATION_SECONDS))
                block_reason = data.get("message", "App Blocked remotely by Admin / Super Admin")
                self.block_app(duration, block_reason)
                return {"approved": False, "blocked": True, "message": block_reason, "sync": sync_info}

            # If Super Admin updated password via check response, sync it
            if data.get("global_password") and int(data.get("password_version", 0)) > self.password_version:
                global_pwd = data.get("global_password")
                new_version = int(data.get("password_version", 0))
                new_hash = hashlib.sha256(global_pwd.encode('utf-8')).hexdigest()
                self._save_synced_password(new_hash, new_version, global_pwd)

            if data.get("approved") is True:
                self._save_session("remote_gmail")
                return {"approved": True, "message": "Unlocked via Remote Gmail Approval!", "sync": sync_info}
            return {"approved": False, "message": "Pending Admin Approval...", "sync": sync_info}
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
