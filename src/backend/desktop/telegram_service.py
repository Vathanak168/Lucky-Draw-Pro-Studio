from __future__ import annotations

import base64
import copy
import ctypes
import hashlib
import json
import os
import threading
import time
import uuid
from ctypes import wintypes
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

import requests

from src.backend.desktop.storage_service import DesktopStorageService, desktop_storage


DEFAULT_TELEGRAM_TEMPLATES = {
    "groupRound": "<b>OFFICIAL RESULTS: {{category}}</b>\n\n{{winners}}\n\nAsta Studio",
    "groupSingle": "<b>WINNER ANNOUNCEMENT</b>\n\nWinner: <b>{{winner}}</b>\nID: <code>{{winnerId}}</code>\nPrize: {{category}}\nSlot: #{{slot}}",
    "groupRedraw": "<b>UPDATED RESULT: {{category}}</b>\n\nPrevious Winner: <s>{{previousWinner}}</s>\nNew Winner: <b>{{winner}}</b>\nSlot: #{{slot}}\n\n{{winners}}",
    "personalWinner": "<b>CONGRATULATIONS {{winner}}!</b>\n\nYou have won {{category}}.\nWinner ID: <code>{{winnerId}}</code>\nSlot: #{{slot}}",
    "personalRevoked": "<b>WINNING STATUS REVOKED</b>\n\n{{previousWinner}}, your winning status for {{category}} (Slot #{{slot}}) is no longer valid following an official redraw.",
}
LEGACY_GROUP_ROUND_TEMPLATE = "<b>OFFICIAL RESULTS: {{category}}</b>\n\n{{winners}}\n\nLucky Draw Pro Studio"

GROUP_JOB_TYPES = {"group_round", "group_single", "group_redraw", "group_revocation"}
PERSONAL_JOB_TYPES = {"personal_winner", "personal_revocation"}
ALLOWED_JOB_TYPES = GROUP_JOB_TYPES | PERSONAL_JOB_TYPES
TERMINAL_JOB_STATES = {"sent", "failed", "deleted", "cancelled", "skipped", "complete"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_utc(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


class TelegramApiError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 0,
        error_code: int = 0,
        retry_after: int = 0,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.retry_after = retry_after


class TelegramApiClient:
    def __init__(self, session: Optional[requests.Session] = None, timeout: tuple[float, float] = (5.0, 15.0)):
        self.session = session or requests.Session()
        self.timeout = timeout

    def request(self, token: str, method: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        if not token:
            raise TelegramApiError("Telegram bot is not connected")
        try:
            response = self.session.post(
                f"https://api.telegram.org/bot{token}/{method}",
                json=payload or {},
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise TelegramApiError("Telegram connection failed") from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise TelegramApiError("Telegram returned an invalid response", status_code=response.status_code) from exc

        if response.ok and isinstance(data, dict) and data.get("ok") is True:
            return data.get("result")

        parameters = data.get("parameters") if isinstance(data, dict) else {}
        retry_after = int(parameters.get("retry_after") or 0) if isinstance(parameters, dict) else 0
        description = data.get("description") if isinstance(data, dict) else None
        error_code = int(data.get("error_code") or 0) if isinstance(data, dict) else 0
        raise TelegramApiError(
            str(description or f"Telegram request failed ({response.status_code})"),
            status_code=response.status_code,
            error_code=error_code,
            retry_after=retry_after,
        )

    def get_me(self, token: str) -> Dict[str, Any]:
        result = self.request(token, "getMe")
        return result if isinstance(result, dict) else {}

    def get_chat(self, token: str, chat_id: str) -> Dict[str, Any]:
        result = self.request(token, "getChat", {"chat_id": chat_id})
        return result if isinstance(result, dict) else {}

    def send_message(self, token: str, chat_id: str, text: str) -> Dict[str, Any]:
        result = self.request(
            token,
            "sendMessage",
            {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
        )
        return result if isinstance(result, dict) else {}

    def delete_message(self, token: str, chat_id: str, message_id: int) -> bool:
        return bool(self.request(token, "deleteMessage", {"chat_id": chat_id, "message_id": message_id}))


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


class DpapiSecretStore:
    CRYPTPROTECT_UI_FORBIDDEN = 0x01

    def __init__(self, path: Path):
        self.path = Path(path)

    def _protect(self, value: bytes) -> bytes:
        if os.name != "nt":
            raise RuntimeError("Secure Telegram token storage requires Windows DPAPI")
        source_buffer = (ctypes.c_ubyte * len(value)).from_buffer_copy(value)
        source = _DataBlob(len(value), source_buffer)
        output = _DataBlob()
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32
        if not crypt32.CryptProtectData(
            ctypes.byref(source),
            "Lucky Draw Pro Studio Telegram Token",
            None,
            None,
            None,
            self.CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(output),
        ):
            raise ctypes.WinError()
        try:
            return ctypes.string_at(output.pbData, output.cbData)
        finally:
            kernel32.LocalFree(output.pbData)

    def _unprotect(self, value: bytes) -> bytes:
        if os.name != "nt":
            raise RuntimeError("Secure Telegram token storage requires Windows DPAPI")
        source_buffer = (ctypes.c_ubyte * len(value)).from_buffer_copy(value)
        source = _DataBlob(len(value), source_buffer)
        output = _DataBlob()
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32
        if not crypt32.CryptUnprotectData(
            ctypes.byref(source),
            None,
            None,
            None,
            None,
            self.CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(output),
        ):
            raise ctypes.WinError()
        try:
            return ctypes.string_at(output.pbData, output.cbData)
        finally:
            kernel32.LocalFree(output.pbData)

    def save(self, token: str) -> None:
        protected = self._protect(token.encode("utf-8"))
        payload = {"version": 1, "protectedToken": base64.b64encode(protected).decode("ascii")}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload), encoding="utf-8")
        os.replace(temporary, self.path)

    def load(self) -> str:
        if not self.path.exists():
            return ""
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            protected = base64.b64decode(payload.get("protectedToken") or "", validate=True)
            return self._unprotect(protected).decode("utf-8")
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            raise RuntimeError("Telegram token could not be unlocked") from exc

    def exists(self) -> bool:
        return self.path.exists()

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)


class TelegramService:
    def __init__(
        self,
        storage: DesktopStorageService = desktop_storage,
        *,
        api_client: Optional[TelegramApiClient] = None,
        secret_store: Optional[DpapiSecretStore] = None,
        start_worker: bool = True,
    ) -> None:
        self.storage = storage
        self.api = api_client or TelegramApiClient()
        self.secret_store = secret_store or DpapiSecretStore(storage.app_data_dir / "telegram_secret.json")
        self.jobs_file = storage.app_data_dir / "telegram_deliveries.json"
        self._lock = threading.RLock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._last_sent_by_chat: Dict[str, float] = {}
        self._last_global_send = 0.0
        self._jobs = self._load_jobs()
        self._migrate_legacy_token()
        self._recover_interrupted_jobs()
        if start_worker:
            self._worker = threading.Thread(target=self._worker_loop, name="telegram-delivery", daemon=True)
            self._worker.start()

    def _load_jobs(self) -> list[Dict[str, Any]]:
        raw = self.storage._read_json(self.jobs_file, [])
        return raw if isinstance(raw, list) else []

    def _write_jobs(self) -> None:
        pending = [job for job in self._jobs if job.get("status") not in TERMINAL_JOB_STATES]
        terminal = [job for job in self._jobs if job.get("status") in TERMINAL_JOB_STATES]
        self._jobs = [*terminal[-1400:], *pending]
        self.storage._atomic_write_json(self.jobs_file, self._jobs)

    def _migrate_legacy_token(self) -> None:
        settings = self.storage.load_settings()
        telegram_settings = settings.get("telegramSettings") if isinstance(settings.get("telegramSettings"), dict) else {}
        telegram_settings = copy.deepcopy(telegram_settings)
        had_legacy_token = "botToken" in telegram_settings
        legacy_token = str(telegram_settings.pop("botToken", "") or "").strip()
        if legacy_token and not self.secret_store.exists():
            self.secret_store.save(legacy_token)
        if had_legacy_token:
            self.storage.replace_telegram_settings(telegram_settings)

    def _recover_interrupted_jobs(self) -> None:
        changed = False
        for job in self._jobs:
            if job.get("status") == "sending":
                job["status"] = "pending"
                job["updatedAt"] = _utc_now()
                changed = True
            elif job.get("kind") == "redraw_operation" and job.get("status") == "processing":
                job["status"] = "failed"
                job["error"] = "Redraw operation was interrupted"
                job["updatedAt"] = _utc_now()
                changed = True
        if changed:
            self._write_jobs()

    def _settings(self) -> Dict[str, Any]:
        settings = self.storage.load_settings().get("telegramSettings")
        result = copy.deepcopy(settings) if isinstance(settings, dict) else {}
        result.pop("botToken", None)
        result.setdefault("groupChatId", "")
        result.setdefault("botIdentity", {})
        templates = result.get("templates") if isinstance(result.get("templates"), dict) else {}
        if templates.get("groupRound") == LEGACY_GROUP_ROUND_TEMPLATE:
            templates = {**templates, "groupRound": DEFAULT_TELEGRAM_TEMPLATES["groupRound"]}
        result["templates"] = {**DEFAULT_TELEGRAM_TEMPLATES, **templates}
        return result

    def _save_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        settings = copy.deepcopy(settings)
        settings.pop("botToken", None)
        return self.storage.replace_telegram_settings(settings)

    def _token(self) -> str:
        return self.secret_store.load()

    def status(self, project_id: str = "") -> Dict[str, Any]:
        preferences = self._settings()
        jobs = self.list_jobs(project_id, 500) if project_id else []
        counts: Dict[str, int] = {}
        for job in jobs:
            state = str(job.get("status") or "unknown")
            counts[state] = counts.get(state, 0) + 1
        return {
            "ok": True,
            "connected": self.secret_store.exists(),
            "bot": preferences.get("botIdentity") or {},
            "preferences": {
                "groupChatId": preferences.get("groupChatId") or "",
                "templates": preferences.get("templates") or copy.deepcopy(DEFAULT_TELEGRAM_TEMPLATES),
            },
            "counts": counts,
        }

    def connect(self, token: str, group_chat_id: str = "") -> Dict[str, Any]:
        token = str(token or "").strip()
        group_chat_id = str(group_chat_id or "").strip()
        if not token:
            raise ValueError("Bot Token is required")
        bot = self.api.get_me(token)
        chat = self.api.get_chat(token, group_chat_id) if group_chat_id else {}
        self.secret_store.save(token)
        settings = self._settings()
        settings["groupChatId"] = group_chat_id
        settings["botIdentity"] = {
            "id": bot.get("id"),
            "username": bot.get("username") or "",
            "firstName": bot.get("first_name") or "",
        }
        self._save_settings(settings)
        self._wake.set()
        return {"ok": True, "connected": True, "bot": settings["botIdentity"], "chat": chat, "preferences": settings}

    def disconnect(self) -> Dict[str, Any]:
        self.secret_store.clear()
        settings = self._settings()
        settings["botIdentity"] = {}
        self._save_settings(settings)
        return {"ok": True, "connected": False}

    def test_connection(self) -> Dict[str, Any]:
        token = self._token()
        bot = self.api.get_me(token)
        settings = self._settings()
        group_chat_id = str(settings.get("groupChatId") or "").strip()
        chat = self.api.get_chat(token, group_chat_id) if group_chat_id else {}
        return {"ok": True, "bot": bot, "chat": chat}

    def save_preferences(self, preferences: Dict[str, Any], validate_group: bool = False) -> Dict[str, Any]:
        if not isinstance(preferences, dict):
            raise ValueError("Telegram preferences must be an object")
        settings = self._settings()
        if "groupChatId" in preferences:
            group_chat_id = str(preferences.get("groupChatId") or "").strip()
            if validate_group and group_chat_id:
                self.api.get_chat(self._token(), group_chat_id)
            settings["groupChatId"] = group_chat_id
        incoming_templates = preferences.get("templates")
        if isinstance(incoming_templates, dict):
            templates = settings.get("templates") if isinstance(settings.get("templates"), dict) else {}
            for name in DEFAULT_TELEGRAM_TEMPLATES:
                if name in incoming_templates:
                    value = str(incoming_templates.get(name) or "").strip()
                    templates[name] = value or DEFAULT_TELEGRAM_TEMPLATES[name]
            settings["templates"] = templates
        self._save_settings(settings)
        return {"ok": True, "preferences": settings}

    def _job_key(self, job: Dict[str, Any]) -> str:
        explicit = str(job.get("idempotencyKey") or "").strip()
        if explicit:
            return explicit[:300]
        stable = {
            "projectId": job.get("projectId"),
            "eventId": job.get("eventId"),
            "kind": job.get("kind"),
            "chatId": job.get("chatId"),
            "roundIndex": job.get("roundIndex"),
            "slotIndex": job.get("slotIndex"),
        }
        digest = hashlib.sha256(json.dumps(stable, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
        return f"telegram:{digest}"

    def _normalize_job(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(raw, dict):
            raise ValueError("Telegram job must be an object")
        kind = str(raw.get("kind") or "")
        if kind not in ALLOWED_JOB_TYPES:
            raise ValueError("Unsupported Telegram message type")
        chat_id = str(raw.get("chatId") or "").strip()
        text = str(raw.get("text") or "").strip()
        if not chat_id:
            raise ValueError("Telegram Chat ID is required")
        if not text:
            raise ValueError("Telegram message is empty")
        if len(text) > 4096:
            raise ValueError("Telegram message exceeds 4096 characters")
        round_index = int(raw.get("roundIndex") or 0)
        slot_index = raw.get("slotIndex")
        slot_index = int(slot_index) if slot_index is not None and str(slot_index) != "" else None
        job = {
            "id": uuid.uuid4().hex,
            "idempotencyKey": "",
            "projectId": str(raw.get("projectId") or "")[:200],
            "eventId": str(raw.get("eventId") or "")[:300],
            "kind": kind,
            "destinationType": "group" if kind in GROUP_JOB_TYPES else "personal",
            "chatId": chat_id,
            "text": text,
            "roundIndex": max(0, round_index),
            "slotIndex": slot_index,
            "winnerId": str(raw.get("winnerId") or "")[:300],
            "winnerName": str(raw.get("winnerName") or "")[:500],
            "status": "pending",
            "attemptCount": 0,
            "createdAt": _utc_now(),
            "updatedAt": _utc_now(),
            "retryAt": "",
            "error": "",
            "telegramMessageId": None,
            "telegramChatId": "",
        }
        job["idempotencyKey"] = self._job_key({**job, "idempotencyKey": raw.get("idempotencyKey")})
        return job

    def enqueue_batch(self, jobs: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
        if not self.secret_store.exists():
            raise ValueError("Connect Telegram Bot first")
        normalized = [self._normalize_job(job) for job in jobs]
        added: list[Dict[str, Any]] = []
        existing: list[Dict[str, Any]] = []
        with self._lock:
            known = {str(job.get("idempotencyKey") or ""): job for job in self._jobs}
            for job in normalized:
                current = known.get(job["idempotencyKey"])
                if current:
                    existing.append(copy.deepcopy(current))
                    continue
                self._jobs.append(job)
                known[job["idempotencyKey"]] = job
                added.append(copy.deepcopy(job))
            if added:
                self._write_jobs()
        if added:
            self._wake.set()
        return {"ok": True, "added": added, "existing": existing}

    def list_jobs(self, project_id: str = "", limit: int = 100) -> list[Dict[str, Any]]:
        limit = min(500, max(1, int(limit or 100)))
        with self._lock:
            jobs = [
                copy.deepcopy(job)
                for job in self._jobs
                if job.get("kind") != "redraw_operation"
                and (not project_id or job.get("projectId") == project_id)
            ]
        jobs.sort(key=lambda job: str(job.get("createdAt") or ""), reverse=True)
        return jobs[:limit]

    def retry_job(self, job_id: str) -> Dict[str, Any]:
        with self._lock:
            job = next((item for item in self._jobs if item.get("id") == job_id), None)
            if not job:
                raise FileNotFoundError("Telegram message was not found")
            if job.get("status") != "failed":
                raise ValueError("Only failed Telegram messages can be retried")
            job["status"] = "pending"
            job["attemptCount"] = 0
            job["retryAt"] = ""
            job["error"] = ""
            job["updatedAt"] = _utc_now()
            self._write_jobs()
            result = copy.deepcopy(job)
        self._wake.set()
        return {"ok": True, "job": result}

    def _matching_redraw_job(self, job: Dict[str, Any], project_id: str, round_index: int, slot_index: int, winner_id: str) -> bool:
        if job.get("projectId") != project_id or int(job.get("roundIndex") or 0) != round_index:
            return False
        if job.get("supersededByEventId"):
            return False
        kind = str(job.get("kind") or "")
        if kind in GROUP_JOB_TYPES:
            return kind in {"group_round", "group_redraw", "group_revocation"} or job.get("slotIndex") == slot_index
        if kind == "personal_winner":
            return job.get("slotIndex") == slot_index or (winner_id and job.get("winnerId") == winner_id)
        return False

    def handle_redraw(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("Redraw payload must be an object")
        if not self.secret_store.exists():
            return {"ok": False, "connected": False, "deleted": 0, "fallbacks": 0}

        project_id = str(payload.get("projectId") or "")
        event_id = str(payload.get("eventId") or "")
        round_index = max(0, int(payload.get("roundIndex") or 0))
        slot_index = max(0, int(payload.get("slotIndex") or 0))
        previous = payload.get("previousWinner") if isinstance(payload.get("previousWinner"), dict) else {}
        previous_winner_id = str(previous.get("id") or "")
        operation_key = f"redraw:{project_id}:{event_id}"
        automation = payload.get("automation") if isinstance(payload.get("automation"), dict) else {}
        group_chat_id = str(payload.get("groupChatId") or self._settings().get("groupChatId") or "").strip()
        group_text = str(payload.get("groupText") or "").strip()
        personal_text = str(payload.get("personalText") or "").strip()
        revocation_text = str(payload.get("revocationText") or "").strip()
        new_winner = payload.get("newWinner") if isinstance(payload.get("newWinner"), dict) else {}
        deferred_deletes = 0

        with self._lock:
            existing_operation = next(
                (job for job in self._jobs if job.get("kind") == "redraw_operation" and job.get("idempotencyKey") == operation_key),
                None,
            )
            if existing_operation and existing_operation.get("status") == "complete":
                return {"ok": True, "duplicate": True, **copy.deepcopy(existing_operation.get("result") or {})}
            if existing_operation and existing_operation.get("status") == "processing":
                return {"ok": True, "duplicate": True, "processing": True}
            if existing_operation:
                operation = existing_operation
                operation["status"] = "processing"
                operation["error"] = ""
                operation["updatedAt"] = _utc_now()
            else:
                operation = {
                    "id": uuid.uuid4().hex,
                    "idempotencyKey": operation_key,
                    "projectId": project_id,
                    "eventId": event_id,
                    "kind": "redraw_operation",
                    "roundIndex": round_index,
                    "slotIndex": slot_index,
                    "status": "processing",
                    "createdAt": _utc_now(),
                    "updatedAt": _utc_now(),
                }
                self._jobs.append(operation)

            candidates = []
            for job in self._jobs:
                if not self._matching_redraw_job(job, project_id, round_index, slot_index, previous_winner_id):
                    continue
                if job.get("eventId") == event_id:
                    continue
                if job.get("status") == "pending":
                    job["status"] = "cancelled"
                    job["error"] = "Cancelled by redraw"
                    job["supersededByEventId"] = event_id
                    job["updatedAt"] = _utc_now()
                elif job.get("status") == "sending":
                    fallback_job = None
                    if job.get("destinationType") == "group" and group_chat_id and group_text:
                        fallback_job = {
                            "idempotencyKey": f"{operation_key}:group-update",
                            "projectId": project_id,
                            "eventId": event_id,
                            "kind": "group_redraw",
                            "chatId": group_chat_id,
                            "text": group_text,
                            "roundIndex": round_index,
                            "slotIndex": slot_index,
                            "winnerId": str(new_winner.get("id") or ""),
                            "winnerName": str(new_winner.get("name") or ""),
                        }
                    elif job.get("destinationType") == "personal" and revocation_text:
                        chat_id = str(job.get("chatId") or "").strip()
                        if chat_id:
                            fallback_job = {
                                "idempotencyKey": f"{operation_key}:personal-revocation:{chat_id}",
                                "projectId": project_id,
                                "eventId": event_id,
                                "kind": "personal_revocation",
                                "chatId": chat_id,
                                "text": revocation_text,
                                "roundIndex": round_index,
                                "slotIndex": slot_index,
                                "winnerId": previous_winner_id,
                                "winnerName": str(previous.get("name") or ""),
                            }
                    job["cancelAfterSend"] = True
                    job["cancelFallbackJob"] = fallback_job
                    job["supersededByEventId"] = event_id
                    job["updatedAt"] = _utc_now()
                    deferred_deletes += 1
                elif job.get("status") == "sent" and job.get("telegramMessageId"):
                    candidates.append(copy.deepcopy(job))
            self._write_jobs()

        token = self._token()
        deleted_ids: list[str] = []
        group_delete_failed = False
        personal_fallback_chats: set[str] = set()
        delete_errors: Dict[str, str] = {}
        for candidate in candidates:
            try:
                deleted = self.api.delete_message(
                    token,
                    str(candidate.get("telegramChatId") or candidate.get("chatId") or ""),
                    int(candidate.get("telegramMessageId")),
                )
                if not deleted:
                    raise TelegramApiError("Telegram did not delete the previous message")
                deleted_ids.append(str(candidate.get("id")))
            except Exception as exc:
                delete_errors[str(candidate.get("id"))] = str(exc)
                if candidate.get("destinationType") == "group":
                    group_delete_failed = True
                elif candidate.get("destinationType") == "personal":
                    personal_fallback_chats.add(str(candidate.get("chatId") or ""))

        with self._lock:
            for job in self._jobs:
                if str(job.get("id")) in deleted_ids:
                    job["status"] = "deleted"
                    job["deletedAt"] = _utc_now()
                    job["supersededByEventId"] = event_id
                    job["updatedAt"] = _utc_now()
                elif any(str(job.get("id")) == str(candidate.get("id")) for candidate in candidates):
                    job["deleteFailed"] = True
                    job["deleteError"] = delete_errors.get(str(job.get("id")), "Delete failed")
                    job["supersededByEventId"] = event_id
                    job["updatedAt"] = _utc_now()
            self._write_jobs()

        jobs_to_enqueue: list[Dict[str, Any]] = []

        if group_chat_id and group_text and (bool(automation.get("group")) or group_delete_failed):
            jobs_to_enqueue.append({
                "idempotencyKey": f"{operation_key}:group-update",
                "projectId": project_id,
                "eventId": event_id,
                "kind": "group_redraw",
                "chatId": group_chat_id,
                "text": group_text,
                "roundIndex": round_index,
                "slotIndex": slot_index,
                "winnerId": str(new_winner.get("id") or ""),
                "winnerName": str(new_winner.get("name") or ""),
            })

        for chat_id in personal_fallback_chats:
            if chat_id and revocation_text:
                jobs_to_enqueue.append({
                    "idempotencyKey": f"{operation_key}:personal-revocation:{chat_id}",
                    "projectId": project_id,
                    "eventId": event_id,
                    "kind": "personal_revocation",
                    "chatId": chat_id,
                    "text": revocation_text,
                    "roundIndex": round_index,
                    "slotIndex": slot_index,
                    "winnerId": previous_winner_id,
                    "winnerName": str(previous.get("name") or ""),
                })

        new_chat_id = str(new_winner.get("chatId") or "").strip()
        if bool(automation.get("personal")) and new_chat_id and personal_text:
            jobs_to_enqueue.append({
                "idempotencyKey": f"{operation_key}:personal-winner:{new_chat_id}",
                "projectId": project_id,
                "eventId": event_id,
                "kind": "personal_winner",
                "chatId": new_chat_id,
                "text": personal_text,
                "roundIndex": round_index,
                "slotIndex": slot_index,
                "winnerId": str(new_winner.get("id") or ""),
                "winnerName": str(new_winner.get("name") or ""),
            })

        enqueue_result = self.enqueue_batch(jobs_to_enqueue) if jobs_to_enqueue else {"added": [], "existing": []}
        result = {
            "deleted": len(deleted_ids),
            "deleteFailed": len(candidates) - len(deleted_ids),
            "fallbacks": len(personal_fallback_chats) + (1 if group_delete_failed else 0),
            "queued": len(enqueue_result.get("added") or []),
            "deferredDeletes": deferred_deletes,
        }
        with self._lock:
            operation["status"] = "complete"
            operation["result"] = result
            operation["updatedAt"] = _utc_now()
            self._write_jobs()
        return {"ok": True, **result}

    def _next_pending_job(self) -> Optional[Dict[str, Any]]:
        if not self.secret_store.exists():
            return None
        now = datetime.now(timezone.utc)
        with self._lock:
            for job in sorted(self._jobs, key=lambda item: str(item.get("createdAt") or "")):
                if job.get("status") != "pending" or job.get("kind") not in ALLOWED_JOB_TYPES:
                    continue
                retry_at = _parse_utc(job.get("retryAt"))
                if retry_at and retry_at > now:
                    continue
                job["status"] = "sending"
                job["attemptCount"] = int(job.get("attemptCount") or 0) + 1
                job["updatedAt"] = _utc_now()
                self._write_jobs()
                return copy.deepcopy(job)
        return None

    def _wait_for_rate_limit(self, job: Dict[str, Any]) -> None:
        chat_id = str(job.get("chatId") or "")
        now = time.monotonic()
        minimum_chat_interval = 3.05 if job.get("destinationType") == "group" else 1.05
        wait_for_chat = minimum_chat_interval - (now - self._last_sent_by_chat.get(chat_id, 0.0))
        wait_global = 0.04 - (now - self._last_global_send)
        delay = max(0.0, wait_for_chat, wait_global)
        if delay:
            time.sleep(delay)

    def process_pending_once(self) -> bool:
        job = self._next_pending_job()
        if not job:
            return False
        try:
            self._wait_for_rate_limit(job)
            result = self.api.send_message(self._token(), str(job.get("chatId") or ""), str(job.get("text") or ""))
            sent_at = _utc_now()
            with self._lock:
                stored = next(item for item in self._jobs if item.get("id") == job.get("id"))
                stored["status"] = "sent"
                stored["telegramMessageId"] = result.get("message_id")
                result_chat = result.get("chat") if isinstance(result.get("chat"), dict) else {}
                stored["telegramChatId"] = str(result_chat.get("id") or stored.get("chatId") or "")
                stored["sentAt"] = sent_at
                stored["updatedAt"] = sent_at
                stored["error"] = ""
                cancel_after_send = bool(stored.get("cancelAfterSend"))
                cancel_fallback_job = copy.deepcopy(stored.get("cancelFallbackJob"))
                self._write_jobs()
            now = time.monotonic()
            self._last_sent_by_chat[str(job.get("chatId") or "")] = now
            self._last_global_send = now
            if cancel_after_send:
                try:
                    deleted = self.api.delete_message(
                        self._token(),
                        str(result_chat.get("id") or job.get("chatId") or ""),
                        int(result.get("message_id")),
                    )
                    if not deleted:
                        raise TelegramApiError("Telegram did not delete the previous message")
                    with self._lock:
                        stored = next(item for item in self._jobs if item.get("id") == job.get("id"))
                        stored["status"] = "deleted"
                        stored["deletedAt"] = _utc_now()
                        stored["updatedAt"] = _utc_now()
                        stored.pop("cancelAfterSend", None)
                        stored.pop("cancelFallbackJob", None)
                        self._write_jobs()
                except Exception as exc:
                    with self._lock:
                        stored = next(item for item in self._jobs if item.get("id") == job.get("id"))
                        stored["deleteFailed"] = True
                        stored["deleteError"] = str(exc)[:1000]
                        stored.pop("cancelAfterSend", None)
                        stored.pop("cancelFallbackJob", None)
                        stored["updatedAt"] = _utc_now()
                        self._write_jobs()
                    if isinstance(cancel_fallback_job, dict):
                        try:
                            self.enqueue_batch([cancel_fallback_job])
                        except Exception as fallback_exc:
                            with self._lock:
                                stored = next(item for item in self._jobs if item.get("id") == job.get("id"))
                                stored["deleteError"] = f"{stored.get('deleteError')}; fallback failed: {fallback_exc}"[:1000]
                                stored["updatedAt"] = _utc_now()
                                self._write_jobs()
        except TelegramApiError as exc:
            attempts = int(job.get("attemptCount") or 1)
            retryable = bool(exc.retry_after) or exc.status_code >= 500 or exc.status_code == 0
            with self._lock:
                stored = next(item for item in self._jobs if item.get("id") == job.get("id"))
                if retryable and attempts < 3:
                    delay = max(1, exc.retry_after or (2 ** attempts))
                    stored["status"] = "pending"
                    stored["retryAt"] = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
                else:
                    stored["status"] = "failed"
                    stored["retryAt"] = ""
                stored["error"] = str(exc)[:1000]
                stored["updatedAt"] = _utc_now()
                self._write_jobs()
        except Exception as exc:
            with self._lock:
                stored = next(item for item in self._jobs if item.get("id") == job.get("id"))
                stored["status"] = "failed"
                stored["error"] = str(exc)[:1000]
                stored["updatedAt"] = _utc_now()
                self._write_jobs()
        return True

    def _worker_loop(self) -> None:
        while not self._stop.is_set():
            processed = self.process_pending_once()
            if processed:
                continue
            self._wake.wait(timeout=1.0)
            self._wake.clear()


telegram_service = TelegramService(desktop_storage)
