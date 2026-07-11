# src/backend/core/pool_service.py
import os
import json
import uuid
from typing import List, Optional, Dict
from src.backend.core.models import Participant, ParticipantCreate

POOL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data", "participants.json")

class PoolService:
    """
    Manages the Candidate Pool: storage, bulk import, querying, and winner status.
    """
    def __init__(self):
        self.participants: Dict[str, Participant] = {}
        self._load_from_disk()
        if not self.participants:
            self._seed_default_participants()

    def _load_from_disk(self):
        if os.path.exists(POOL_FILE):
            try:
                with open(POOL_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for item in data:
                        p = Participant(**item)
                        self.participants[p.id] = p
            except Exception as e:
                print("Error loading pool from disk:", e)

    def _save_to_disk(self):
        try:
            os.makedirs(os.path.dirname(POOL_FILE), exist_ok=True)
            data = [p.model_dump() for p in self.participants.values()]
            with open(POOL_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print("Error saving pool to disk:", e)

    def _seed_default_participants(self):
        """Seeds 25 sample candidates for quick testing."""
        sample_names = [
            ("Sok Dara", "IT Dept", "VIP"),
            ("Channary Veth", "Marketing", "VIP"),
            ("Bora Keth", "Sales", "Regular"),
            ("Serey Rith", "Finance", "Regular"),
            ("Phalla Meas", "Operations", "VIP"),
            ("Vichea Sorn", "IT Dept", "Regular"),
            ("Kagna Ly", "HR Dept", "Regular"),
            ("Visal Roth", "Logistics", "VIP"),
            ("Sophea Ouk", "Design", "Regular"),
            ("Moni Pich", "Executive", "Grand")
        ]
        for i, (name, dept, cat) in enumerate(sample_names, 1):
            p_id = f"P-{1000+i}"
            p = Participant(
                id=p_id,
                name=name,
                ticket_num=f"TCK-{800+i}",
                department=dept,
                category=cat,
                status="active"
            )
            self.participants[p.id] = p
        self._save_to_disk()

    def get_all(self, category: Optional[str] = None, status: Optional[str] = None, search: Optional[str] = None) -> List[Participant]:
        res = list(self.participants.values())
        if category and category != "All":
            res = [p for p in res if p.category == category]
        if status:
            res = [p for p in res if p.status == status]
        if search:
            s_low = search.lower()
            res = [p for p in res if s_low in p.name.lower() or s_low in p.ticket_num.lower() or s_low in p.department.lower()]
        return res

    def get_by_id(self, p_id: str) -> Optional[Participant]:
        return self.participants.get(p_id)

    def add_participant(self, item: ParticipantCreate) -> Participant:
        p_id = f"P-{uuid.uuid4().hex[:6].upper()}"
        t_num = item.ticket_num or f"TCK-{len(self.participants) + 1001}"
        p = Participant(
            id=p_id,
            name=item.name.strip(),
            ticket_num=t_num.strip(),
            department=item.department or "General",
            category=item.category or "Regular",
            status="active"
        )
        self.participants[p.id] = p
        self._save_to_disk()
        return p

    def bulk_import_text(self, raw_text: str, default_category: str = "Regular") -> int:
        """
        Imports candidates from CSV or newline text: 'Name, Ticket, Dept, Category'
        """
        lines = raw_text.strip().split('\n')
        added_count = 0
        for line in lines:
            line = line.strip()
            if not line:
                continue
            parts = [x.strip() for x in line.split(',')]
            name = parts[0]
            ticket = parts[1] if len(parts) > 1 and parts[1] else f"TCK-{len(self.participants)+1001}"
            dept = parts[2] if len(parts) > 2 and parts[2] else "General"
            cat = parts[3] if len(parts) > 3 and parts[3] else default_category
            
            p_id = f"P-{uuid.uuid4().hex[:6].upper()}"
            p = Participant(id=p_id, name=name, ticket_num=ticket, department=dept, category=cat, status="active")
            self.participants[p.id] = p
            added_count += 1
        
        if added_count > 0:
            self._save_to_disk()
        return added_count

    def mark_as_won(self, p_id: str, slot_id: str, prize_name: str):
        if p_id in self.participants:
            self.participants[p_id].status = "won"
            self.participants[p_id].won_slot_id = slot_id
            self.participants[p_id].won_prize_name = prize_name
            self._save_to_disk()

    def reset_all_status(self):
        for p in self.participants.values():
            p.status = "active"
            p.won_slot_id = None
            p.won_prize_name = None
        self._save_to_disk()

    def delete_participant(self, p_id: str) -> bool:
        if p_id in self.participants:
            del self.participants[p_id]
            self._save_to_disk()
            return True
        return False

pool_service = PoolService()
