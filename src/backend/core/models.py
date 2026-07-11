# src/backend/core/models.py
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class Participant(BaseModel):
    id: str
    name: str
    ticket_num: str
    department: Optional[str] = "General"
    category: Optional[str] = "All"
    status: str = "active"  # 'active', 'won', 'disabled'
    won_slot_id: Optional[str] = None
    won_prize_name: Optional[str] = None

class ParticipantCreate(BaseModel):
    name: str
    ticket_num: Optional[str] = None
    department: Optional[str] = "General"
    category: Optional[str] = "All"

class BulkImportRequest(BaseModel):
    raw_text: str  # CSV or newline separated

class DrawSlot(BaseModel):
    id: str
    title: str
    prize_name: str
    quantity: int = 1
    category_filter: str = "All"
    status: str = "ready"  # 'ready', 'drawing', 'completed'
    winners: List[Participant] = []
    preset_winner_ids: List[str] = []  # Secret pre-assigned candidate IDs
    animation_style: str = "slot_machine"  # 'slot_machine', 'wheel_spin', 'digital_pulse'

class SlotCreate(BaseModel):
    title: str
    prize_name: str
    quantity: int = 1
    category_filter: str = "All"
    animation_style: str = "slot_machine"

class PresetAssignRequest(BaseModel):
    slot_id: str
    preset_winner_ids: List[str]

class SecretLockToggleRequest(BaseModel):
    locked: bool

class TriggerDrawRequest(BaseModel):
    slot_id: str
