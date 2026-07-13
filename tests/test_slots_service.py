import threading
import unittest
from unittest.mock import Mock, patch

from src.backend.core.models import DrawSlot, Participant
from src.backend.core.slots_service import (
    SlotDrawCompleteError,
    SlotNotFoundError,
    SlotsService,
)


class FakePoolService:
    def __init__(self, candidates=None):
        self.candidates = candidates or []
        self.marked = []

    def get_by_id(self, participant_id):
        return next((p for p in self.candidates if p.id == participant_id), None)

    def get_all(self, category=None, status=None, search=None):
        return [
            p for p in self.candidates
            if (not category or p.category == category) and (not status or p.status == status)
        ]

    def mark_as_won(self, participant_id, slot_id, prize_name):
        participant = self.get_by_id(participant_id)
        if participant:
            participant.status = "won"
            participant.won_slot_id = slot_id
            participant.won_prize_name = prize_name
            self.marked.append(participant_id)


class SlotsServiceDrawTests(unittest.TestCase):
    def setUp(self):
        self.service = object.__new__(SlotsService)
        self.service.slots = {}
        self.service.is_rigging_locked = True
        self.service._draw_lock = threading.Lock()
        self.service._save_to_disk = Mock()

    def test_missing_slot_raises_not_found(self):
        with self.assertRaises(SlotNotFoundError):
            self.service.execute_slot_draw("MISSING")

    def test_completed_slot_cannot_append_another_winner(self):
        existing = Participant(id="P-1", name="Existing", ticket_num="001", status="won")
        slot = DrawSlot(
            id="SLOT-1",
            title="Grand Prize",
            prize_name="Prize",
            quantity=1,
            status="completed",
            winners=[existing],
        )
        self.service.slots[slot.id] = slot

        with self.assertRaises(SlotDrawCompleteError):
            self.service.execute_slot_draw(slot.id)

        self.assertEqual([winner.id for winner in slot.winners], ["P-1"])

    def test_slot_stops_exactly_at_configured_quantity(self):
        candidate = Participant(id="P-2", name="Winner", ticket_num="002", status="active")
        pool = FakePoolService([candidate])
        slot = DrawSlot(
            id="SLOT-2",
            title="Prize Draw",
            prize_name="Prize",
            quantity=1,
            status="ready",
        )
        self.service.slots[slot.id] = slot

        with patch("src.backend.core.slots_service.pool_service", pool):
            winner = self.service.execute_slot_draw(slot.id)
            with self.assertRaises(SlotDrawCompleteError):
                self.service.execute_slot_draw(slot.id)

        self.assertEqual(winner.id, candidate.id)
        self.assertEqual(pool.marked, [candidate.id])
        self.assertEqual(len(slot.winners), 1)
        self.assertEqual(slot.status, "completed")

    def test_no_candidates_restores_ready_status(self):
        slot = DrawSlot(
            id="SLOT-3",
            title="Empty Draw",
            prize_name="Prize",
            quantity=2,
            status="ready",
        )
        self.service.slots[slot.id] = slot

        with patch("src.backend.core.slots_service.pool_service", FakePoolService()):
            winner = self.service.execute_slot_draw(slot.id)

        self.assertIsNone(winner)
        self.assertEqual(slot.status, "ready")
        self.assertEqual(slot.winners, [])


if __name__ == "__main__":
    unittest.main()
