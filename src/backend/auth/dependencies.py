from fastapi import HTTPException

from src.backend.auth.gatekeeper import gatekeeper


def require_authenticated_session() -> None:
    blocked, remaining, reason = gatekeeper.is_blocked()
    if blocked:
        raise HTTPException(
            status_code=423,
            detail={
                "blocked": True,
                "blocked_remaining": max(0, int(remaining)),
                "block_reason": reason,
            },
        )
    if not gatekeeper.is_unlocked:
        raise HTTPException(status_code=401, detail="Asta Studio is locked")
