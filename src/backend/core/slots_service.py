# src/backend/core/slots_service.py
import os
import json
import random
import threading
from typing import List, Optional, Dict, Any
from src.backend.core.models import DrawSlot, SlotCreate, Participant
from src.backend.core.pool_service import pool_service

SLOTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data", "slots.json")

class SlotNotFoundError(Exception):
    """Raised when a draw targets a slot that does not exist."""


class SlotDrawCompleteError(Exception):
    """Raised when a slot has already reached its configured winner limit."""


class SlotsService:
    """
    Manages Deck Matrix Slots, Secret Preset Winner Rigging, and Draw Execution.
    """
    def __init__(self):
        self.slots: Dict[str, DrawSlot] = {}
        self.is_rigging_locked: bool = True  # Default LOCKED to keep presets hidden from staff/guests
        self._draw_lock = threading.Lock()
        self._load_from_disk()
        if not self.slots:
            self._seed_default_slots()

    def _load_from_disk(self):
        if os.path.exists(SLOTS_FILE):
            try:
                with open(SLOTS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.is_rigging_locked = data.get("is_rigging_locked", True)
                    slots_data = data.get("slots", [])
                    for item in slots_data:
                        s = DrawSlot(**item)
                        self.slots[s.id] = s
            except Exception as e:
                print("Error loading slots from disk:", e)

    def _save_to_disk(self):
        try:
            os.makedirs(os.path.dirname(SLOTS_FILE), exist_ok=True)
            data = {
                "is_rigging_locked": self.is_rigging_locked,
                "slots": [s.model_dump() for s in self.slots.values()]
            }
            with open(SLOTS_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print("Error saving slots to disk:", e)

    def _seed_default_slots(self):
        """Seeds default Resolume Deck Grid rounds."""
        sample_slots = [
            DrawSlot(id="SLOT-1", title="ROUND #1 - GRAND PRIZE", prize_name="iPad Pro M4 (256GB)", quantity=1, category_filter="VIP", status="ready", animation_style="wheel_spin"),
            DrawSlot(id="SLOT-2", title="ROUND #2 - 1ST RUNNER UP", prize_name="iPhone 16 Pro Max", quantity=2, category_filter="All", status="ready", animation_style="slot_machine"),
            DrawSlot(id="SLOT-3", title="ROUND #3 - SPECIAL BONUS", prize_name="Cash Voucher $500", quantity=5, category_filter="Regular", status="ready", animation_style="digital_pulse")
        ]
        for s in sample_slots:
            self.slots[s.id] = s
        self._save_to_disk()

    def get_all_slots(self, include_secret_presets: bool = False) -> List[Dict[str, Any]]:
        res = []
        for s in self.slots.values():
            dump = s.model_dump()
            if self.is_rigging_locked and not include_secret_presets:
                # Mask secret presets if locked
                if dump.get("preset_winner_ids"):
                    dump["preset_winner_ids"] = ["•••••••• (LOCKED PRESET)" for _ in dump["preset_winner_ids"]]
            res.append(dump)
        return res

    def get_slot_by_id(self, slot_id: str) -> Optional[DrawSlot]:
        return self.slots.get(slot_id)

    def create_slot(self, item: SlotCreate) -> DrawSlot:
        s_id = f"SLOT-{len(self.slots)+1}"
        s = DrawSlot(
            id=s_id,
            title=item.title.strip().upper(),
            prize_name=item.prize_name.strip(),
            quantity=item.quantity,
            category_filter=item.category_filter,
            animation_style=item.animation_style,
            status="ready"
        )
        self.slots[s.id] = s
        self._save_to_disk()
        return s

    def assign_presets(self, slot_id: str, preset_ids: List[str]) -> bool:
        if self.is_rigging_locked:
            return False  # Cannot modify presets when locked!
        slot = self.slots.get(slot_id)
        if not slot:
            return False
        slot.preset_winner_ids = [pid.strip() for pid in preset_ids if pid.strip()]
        self._save_to_disk()
        return True

    def toggle_rigging_lock(self, locked: Optional[bool] = None) -> bool:
        if locked is not None:
            self.is_rigging_locked = locked
        else:
            self.is_rigging_locked = not self.is_rigging_locked
        self._save_to_disk()
        return self.is_rigging_locked

    def execute_slot_draw(self, slot_id: str) -> Optional[Participant]:
        """
        Executes a draw for a slot:
        1. Checks secret presets first.
        2. If empty, picks randomly from active candidates.
        """
        with self._draw_lock:
            slot = self.slots.get(slot_id)
            if not slot:
                raise SlotNotFoundError(f"Slot {slot_id} was not found")

            if slot.status == "completed" or slot.quantity <= 0 or len(slot.winners) >= slot.quantity:
                if slot.status != "completed":
                    slot.status = "completed"
                    self._save_to_disk()
                raise SlotDrawCompleteError(
                    f"Slot {slot_id} already has {len(slot.winners)} of {slot.quantity} winners"
                )

            slot.status = "drawing"
            self._save_to_disk()

            winner: Optional[Participant] = None

            # 1. Check Secret Rigged Presets
            if slot.preset_winner_ids:
                for preset_id in list(slot.preset_winner_ids):
                    p = pool_service.get_by_id(preset_id)
                    if p and p.status == "active":
                        winner = p
                        slot.preset_winner_ids.remove(preset_id)
                        break
                    elif p:
                        # If preset candidate already won elsewhere, skip them
                        slot.preset_winner_ids.remove(preset_id)

            # 2. If no valid preset, pick randomly from active candidates matching category filter
            if not winner:
                active_candidates = pool_service.get_all(
                    category=slot.category_filter if slot.category_filter != "All" else None,
                    status="active"
                )
                if active_candidates:
                    winner = random.choice(active_candidates)

            if winner:
                pool_service.mark_as_won(winner.id, slot.id, slot.prize_name)
                slot.winners.append(winner)
                if len(slot.winners) >= slot.quantity:
                    slot.status = "completed"
                else:
                    slot.status = "ready"
                self._save_to_disk()
                return winner

            # If no active candidates left
            slot.status = "ready"
            self._save_to_disk()
            return None

    def reset_slot_winners(self, slot_id: str) -> bool:
        slot = self.slots.get(slot_id)
        if not slot:
            return False
        for w in slot.winners:
            p = pool_service.get_by_id(w.id)
            if p:
                p.status = "active"
                p.won_slot_id = None
                p.won_prize_name = None
        slot.winners = []
        slot.status = "ready"
        pool_service._save_to_disk()
        self._save_to_disk()
        return True

    def reset_all_slots(self):
        pool_service.reset_all_status()
        for s in self.slots.values():
            s.winners = []
            s.status = "ready"
        self._save_to_disk()

slots_service = SlotsService()
