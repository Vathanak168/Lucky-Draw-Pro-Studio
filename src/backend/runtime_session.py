from __future__ import annotations

import hmac
import secrets


RUNTIME_TOKEN = secrets.token_urlsafe(32)


def runtime_token_is_valid(value: str | None) -> bool:
    candidate = str(value or "")
    return bool(candidate) and hmac.compare_digest(candidate, RUNTIME_TOKEN)
