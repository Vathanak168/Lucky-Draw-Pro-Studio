# src/backend/core/router.py
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from src.backend.core.models import (
    Participant, ParticipantCreate, BulkImportRequest,
    DrawSlot, SlotCreate, PresetAssignRequest, SecretLockToggleRequest, TriggerDrawRequest
)
from src.backend.core.pool_service import pool_service
from src.backend.core.slots_service import slots_service

router = APIRouter(prefix="/api/core", tags=["Core VJ Console Engine"])

# ==================== POOL (CANDIDATES) ENDPOINTS ====================

@router.get("/pool", response_model=List[Participant])
def get_candidates(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    """Returns list of participants with optional category, status, and search filters."""
    return pool_service.get_all(category=category, status=status, search=search)

@router.post("/pool/add", response_model=Participant)
def add_candidate(item: ParticipantCreate):
    """Adds a single candidate to the pool."""
    return pool_service.add_participant(item)

@router.post("/pool/import-csv")
def bulk_import_candidates(req: BulkImportRequest, default_category: str = "Regular"):
    """Bulk imports candidates from CSV/newline text."""
    count = pool_service.bulk_import_text(req.raw_text, default_category)
    return {"status": "success", "imported_count": count}

@router.delete("/pool/delete/{p_id}")
def delete_candidate(p_id: str):
    success = pool_service.delete_participant(p_id)
    if not success:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return {"status": "deleted"}

@router.post("/pool/reset-status")
def reset_candidates_status():
    """Resets all candidates back to 'active' status."""
    pool_service.reset_all_status()
    return {"status": "success", "message": "All candidates reset to active status."}

# ==================== SLOTS (ROUND DECKS) ENDPOINTS ====================

@router.get("/slots")
def get_all_slots(include_presets: bool = False):
    """Returns all deck grid slots. Masks preset IDs if Secret Rigging is LOCKED."""
    return {
        "is_rigging_locked": slots_service.is_rigging_locked,
        "slots": slots_service.get_all_slots(include_secret_presets=include_presets)
    }

@router.post("/slots/create", response_model=DrawSlot)
def create_slot(item: SlotCreate):
    """Creates a new deck grid round slot."""
    return slots_service.create_slot(item)

@router.post("/slots/assign-presets")
def assign_preset_winners(req: PresetAssignRequest):
    """Assigns secret winner IDs to a slot (Only allowed when Rigging Lock is UNLOCKED)."""
    success = slots_service.assign_presets(req.slot_id, req.preset_winner_ids)
    if not success:
        raise HTTPException(status_code=403, detail="Cannot assign presets while Secret Rigging is LOCKED (🔒)")
    return {"status": "success", "message": f"Assigned {len(req.preset_winner_ids)} secret presets to {req.slot_id}"}

@router.post("/slots/toggle-lock")
def toggle_rigging_lock(req: SecretLockToggleRequest):
    """Locks or unlocks the Secret Preset Rigging system."""
    locked = slots_service.toggle_rigging_lock(req.locked)
    return {"status": "success", "is_rigging_locked": locked}

@router.post("/slots/draw")
def trigger_slot_draw(req: TriggerDrawRequest):
    """
    Executes a draw for the target slot.
    Returns the winner (preset first if any, or random).
    """
    winner = slots_service.execute_slot_draw(req.slot_id)
    if not winner:
        raise HTTPException(status_code=400, detail="No active candidates available for this category/slot!")
    slot = slots_service.get_slot_by_id(req.slot_id)
    return {
        "status": "success",
        "slot_id": req.slot_id,
        "slot_status": slot.status if slot else "completed",
        "winner": winner.model_dump()
    }

@router.post("/slots/reset/{slot_id}")
def reset_slot(slot_id: str):
    """Resets winners for a specific slot."""
    success = slots_service.reset_slot_winners(slot_id)
    if not success:
        raise HTTPException(status_code=404, detail="Slot not found")
    return {"status": "success", "message": f"Slot {slot_id} reset successfully"}

@router.post("/slots/reset-all")
def reset_all_deck_slots():
    """Resets all slots and all candidate win states across the entire console."""
    slots_service.reset_all_slots()
    return {"status": "success", "message": "All slots and pools reset completely."}
