import hashlib
import json
import os
import platform
import shutil
import time
from pathlib import Path
from typing import Any, Dict

import requests

from src.backend.config import (
    AUTH_TOKEN_FILE,
    BLOCK_STATE_FILE,
    DEFAULT_BLOCK_DURATION_SECONDS,
    DEFAULT_MASTER_PASSWORD_HASH,
    GOOGLE_APPS_SCRIPT_URL,
    LEGACY_AUTH_FILES,
    MAX_FAILED_ATTEMPTS,
    MAX_REMOTE_REQUESTS,
    SYNC_PASSWORD_FILE,
)
from src.backend.auth.machine_id import get_hardware_fingerprint


class AuthenticationUnavailableError(RuntimeError):
    pass


class GatekeeperService:
    """Machine-bound authentication with online password sync and remote approval."""

    def __init__(self) -> None:
        self._migrate_auth_files()
        self.machine_id = get_hardware_fingerprint()
        self.device_name = platform.node() or "Event Computer"
        self.is_unlocked = False
        self.unlock_type = ""
        self.session_started_at = 0.0
        self.current_password_hash = DEFAULT_MASTER_PASSWORD_HASH
        self.password_version = 0
        self.failed_attempts = 0
        self.remote_request_count = 0
        self._load_synced_password()
        self._discard_persisted_session()

    def _migrate_auth_files(self) -> None:
        for target_value, legacy_value in LEGACY_AUTH_FILES.items():
            target = Path(target_value)
            legacy = Path(legacy_value)
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.exists() and legacy.is_file():
                    shutil.copy2(legacy, target)
            except OSError:
                continue

    def is_blocked(self) -> tuple[bool, float, str]:
        if os.path.exists(BLOCK_STATE_FILE):
            try:
                with open(BLOCK_STATE_FILE, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                blocked_until = float(data.get("blocked_until", 0))
                remaining = blocked_until - time.time()
                if remaining > 0:
                    return True, remaining, str(data.get("reason") or "Access blocked")
                os.remove(BLOCK_STATE_FILE)
                self.failed_attempts = 0
                self.remote_request_count = 0
            except Exception:
                pass
        return False, 0, ""

    def block_app(
        self,
        duration_seconds: int = DEFAULT_BLOCK_DURATION_SECONDS,
        reason: str = "Request limit exceeded",
    ) -> Dict[str, Any]:
        duration = max(1, int(duration_seconds))
        blocked_until = time.time() + duration
        payload = {
            "machine_id": self.machine_id,
            "blocked_until": blocked_until,
            "duration": duration,
            "reason": reason,
            "timestamp": time.time(),
        }
        try:
            with open(BLOCK_STATE_FILE, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
        except OSError:
            pass
        finally:
            self.lock_session()
        return {
            "blocked": True,
            "blocked_until": blocked_until,
            "blocked_remaining": duration,
            "duration": duration,
            "reason": reason,
            "block_reason": reason,
        }

    def unblock_app(self) -> Dict[str, Any]:
        self.failed_attempts = 0
        self.remote_request_count = 0
        if os.path.exists(BLOCK_STATE_FILE):
            try:
                os.remove(BLOCK_STATE_FILE)
            except OSError:
                pass
        return {"blocked": False, "message": "Local block cleared"}

    def _load_synced_password(self) -> None:
        if not os.path.exists(SYNC_PASSWORD_FILE):
            return
        try:
            with open(SYNC_PASSWORD_FILE, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            password_hash = str(data.get("password_hash") or "")
            if password_hash:
                self.current_password_hash = password_hash
            self.password_version = int(data.get("version", 0))
        except Exception:
            pass

    def _save_synced_password(self, password_hash: str, version: int) -> None:
        payload = {
            "password_hash": password_hash,
            "version": int(version),
            "timestamp": time.time(),
        }
        Path(SYNC_PASSWORD_FILE).parent.mkdir(parents=True, exist_ok=True)
        with open(SYNC_PASSWORD_FILE, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        self.current_password_hash = password_hash
        self.password_version = int(version)

    def _save_password_version(self, version: int) -> None:
        payload = {
            "version": int(version),
            "timestamp": time.time(),
        }
        Path(SYNC_PASSWORD_FILE).parent.mkdir(parents=True, exist_ok=True)
        with open(SYNC_PASSWORD_FILE, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        self.password_version = int(version)

    def _apply_cloud_password(self, data: Dict[str, Any]) -> Dict[str, Any]:
        cloud_password_hash = str(data.get("global_password_hash") or "").strip().lower()
        global_password = str(data.get("global_password") or "")
        try:
            remote_version = int(data.get("password_version", 0))
        except (TypeError, ValueError):
            return {"synced": False, "online": True, "message": "Invalid password version"}

        if len(cloud_password_hash) == 64 and all(char in "0123456789abcdef" for char in cloud_password_hash):
            new_hash = cloud_password_hash
        elif global_password:
            # Backward compatibility while the current Apps Script deployment is replaced.
            new_hash = hashlib.sha256(global_password.encode("utf-8")).hexdigest()
        else:
            if remote_version < self.password_version:
                return {"synced": False, "online": True, "message": "Password version rollback rejected"}
            updated = remote_version != self.password_version
            if updated or os.path.exists(SYNC_PASSWORD_FILE):
                self._save_password_version(remote_version)
            return {
                "synced": True,
                "online": True,
                "updated": updated,
                "version": remote_version,
                "password_available": bool(data.get("password_available", True)),
                "server_verified": True,
            }
        if remote_version < self.password_version:
            return {"synced": False, "online": True, "message": "Password version rollback rejected"}

        updated = new_hash != self.current_password_hash or remote_version != self.password_version
        if updated:
            self._save_synced_password(new_hash, remote_version)

        return {
            "synced": True,
            "online": True,
            "updated": updated,
            "version": remote_version,
            "password_available": True,
        }

    def sync_remote_password_from_super_admin(self) -> Dict[str, Any]:
        if "script.google.com" not in GOOGLE_APPS_SCRIPT_URL or "YOUR_SCRIPT_ID_HERE" in GOOGLE_APPS_SCRIPT_URL:
            return {
                "synced": False,
                "online": False,
                "message": "Authorization service is not configured",
            }

        try:
            response = requests.post(
                GOOGLE_APPS_SCRIPT_URL,
                json={"action": "service_status", "machine_id": self.machine_id},
                timeout=3,
            )
            if response.status_code != 200:
                return {
                    "synced": False,
                    "online": True,
                    "message": "Authorization service rejected the request",
                }
            data = response.json()
            if data.get("status") == "ERROR" and "Unknown POST action" in str(data.get("message") or ""):
                legacy_response = requests.get(
                    GOOGLE_APPS_SCRIPT_URL,
                    params={"action": "sync_password", "machine_id": self.machine_id},
                    timeout=3,
                )
                if legacy_response.status_code != 200:
                    return {
                        "synced": False,
                        "online": True,
                        "message": "Authorization service rejected the request",
                    }
                data = legacy_response.json()
            return self._apply_cloud_password(data)
        except Exception:
            return {
                "synced": False,
                "online": False,
                "offline": True,
                "message": "Internet connection required",
            }

    def _discard_persisted_session(self) -> None:
        self.is_unlocked = False
        self.unlock_type = ""
        self.session_started_at = 0.0
        if os.path.exists(AUTH_TOKEN_FILE):
            try:
                os.remove(AUTH_TOKEN_FILE)
            except OSError:
                pass

    def _save_session(self, unlock_type: str) -> None:
        self.is_unlocked = True
        self.unlock_type = unlock_type
        self.session_started_at = time.time()

    def verify_master_password(self, password: str) -> bool:
        blocked, remaining, reason = self.is_blocked()
        if blocked:
            raise RuntimeError(f"Access blocked: {reason}. {int(remaining)} seconds remaining")

        if "script.google.com" not in GOOGLE_APPS_SCRIPT_URL or "YOUR_SCRIPT_ID_HERE" in GOOGLE_APPS_SCRIPT_URL:
            raise AuthenticationUnavailableError("Authorization service is not configured")

        try:
            response = requests.post(
                GOOGLE_APPS_SCRIPT_URL,
                json={
                    "action": "verify_password",
                    "machine_id": self.machine_id,
                    "password": password,
                },
                timeout=5,
            )
            if response.status_code != 200:
                raise AuthenticationUnavailableError("Authorization service rejected the request")
            data = response.json()
            if data.get("status") == "ERROR" and "Unknown POST action" in str(data.get("message") or ""):
                sync_info = self.sync_remote_password_from_super_admin()
                if not sync_info.get("synced"):
                    raise AuthenticationUnavailableError("Internet connection required")
                verified = hashlib.sha256(password.encode("utf-8")).hexdigest() == self.current_password_hash
            else:
                sync_info = self._apply_cloud_password(data)
                if not sync_info.get("synced"):
                    raise AuthenticationUnavailableError(sync_info.get("message") or "Authorization service unavailable")
                verified = data.get("verified") is True
        except AuthenticationUnavailableError:
            raise
        except Exception as exc:
            raise AuthenticationUnavailableError("Internet connection required") from exc

        if verified:
            self.failed_attempts = 0
            self._save_session("master_password")
            return True

        self.failed_attempts += 1
        if self.failed_attempts >= MAX_FAILED_ATTEMPTS:
            self.block_app(
                DEFAULT_BLOCK_DURATION_SECONDS,
                f"Exceeded {MAX_FAILED_ATTEMPTS} incorrect password attempts",
            )
        return False

    def request_remote_unlock(self, client_name: str) -> Dict[str, Any]:
        blocked, remaining, reason = self.is_blocked()
        if blocked:
            return {
                "status": "ERROR",
                "blocked": True,
                "blocked_remaining": int(remaining),
                "block_reason": reason,
                "message": reason,
            }

        self.lock_session()
        self.remote_request_count += 1
        if self.remote_request_count > MAX_REMOTE_REQUESTS:
            result = self.block_app(
                DEFAULT_BLOCK_DURATION_SECONDS,
                f"Exceeded {MAX_REMOTE_REQUESTS} remote access requests",
            )
            return {"status": "ERROR", **result, "message": result["reason"]}

        if "script.google.com" not in GOOGLE_APPS_SCRIPT_URL or "YOUR_SCRIPT_ID_HERE" in GOOGLE_APPS_SCRIPT_URL:
            return {"status": "ERROR", "offline": True, "message": "Authorization service is not configured"}

        payload = {
            "action": "request",
            "machine_id": self.machine_id,
            "client_name": client_name or self.device_name,
            "timestamp": int(time.time()),
        }
        try:
            response = requests.post(GOOGLE_APPS_SCRIPT_URL, json=payload, timeout=5)
            if response.status_code != 200:
                return {
                    "status": "ERROR",
                    "offline": False,
                    "message": "Authorization service rejected the request",
                }
            return response.json()
        except Exception:
            return {"status": "ERROR", "offline": True, "message": "Internet connection required"}

    def check_remote_status(self) -> Dict[str, Any]:
        blocked, remaining, reason = self.is_blocked()
        if blocked:
            return {
                "approved": False,
                "blocked": True,
                "duration": int(remaining),
                "blocked_remaining": int(remaining),
                "message": reason,
            }

        if "script.google.com" not in GOOGLE_APPS_SCRIPT_URL or "YOUR_SCRIPT_ID_HERE" in GOOGLE_APPS_SCRIPT_URL:
            return {"approved": False, "offline": True, "message": "Authorization service is not configured"}

        try:
            response = requests.post(
                GOOGLE_APPS_SCRIPT_URL,
                json={"action": "check", "machine_id": self.machine_id},
                timeout=5,
            )
            if response.status_code != 200:
                return {
                    "approved": False,
                    "offline": False,
                    "message": "Authorization service rejected the request",
                }

            data = response.json()
            if data.get("status") == "ERROR" and "Unknown POST action" in str(data.get("message") or ""):
                legacy_response = requests.get(
                    GOOGLE_APPS_SCRIPT_URL,
                    params={"action": "check", "machine_id": self.machine_id},
                    timeout=5,
                )
                if legacy_response.status_code != 200:
                    return {
                        "approved": False,
                        "offline": False,
                        "message": "Authorization service rejected the request",
                    }
                data = legacy_response.json()
            sync_info = self._apply_cloud_password(data)
            if not sync_info.get("synced"):
                return {
                    "approved": False,
                    "offline": not sync_info.get("online", False),
                    "message": sync_info.get("message") or "Password sync failed",
                    "sync": sync_info,
                }

            if data.get("blocked") is True or str(data.get("status") or "").startswith("BLOCKED"):
                duration = int(data.get("duration", DEFAULT_BLOCK_DURATION_SECONDS))
                reason = str(data.get("message") or "Blocked by Admin")
                result = self.block_app(duration, reason)
                return {"approved": False, **result, "message": reason, "sync": sync_info}

            if data.get("approved") is True:
                self._save_session("remote_gmail")
                return {
                    "approved": True,
                    "message": "Access granted by Admin",
                    "sync": sync_info,
                }

            message = str(data.get("message") or "Pending Admin approval")
            return {
                "approved": False,
                "denied": "denied" in message.lower() or "rejected" in message.lower(),
                "message": message,
                "sync": sync_info,
            }
        except Exception:
            return {"approved": False, "offline": True, "message": "Internet connection required"}

    def lock_session(self) -> None:
        self.is_unlocked = False
        self.unlock_type = ""
        self.session_started_at = 0.0
        if os.path.exists(AUTH_TOKEN_FILE):
            try:
                os.remove(AUTH_TOKEN_FILE)
            except OSError:
                pass


gatekeeper = GatekeeperService()
