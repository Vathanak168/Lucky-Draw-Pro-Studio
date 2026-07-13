# src/backend/core/projects_service.py
import os
import json
from typing import List, Dict, Any, Optional

PROJECTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data", "projects.json")

class ProjectsService:
    """
    Manages Desktop Project File Storage (`data/projects.json` & `.ldp` exports).
    """
    def __init__(self):
        self.projects: List[Dict[str, Any]] = []
        self._load_from_disk()

    def _load_from_disk(self):
        if os.path.exists(PROJECTS_FILE):
            try:
                with open(PROJECTS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self.projects = data
                    elif isinstance(data, dict) and "projects" in data:
                        self.projects = data["projects"]
            except Exception as e:
                print("Error loading projects from disk:", e)

    def _save_to_disk(self):
        try:
            os.makedirs(os.path.dirname(PROJECTS_FILE), exist_ok=True)
            with open(PROJECTS_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.projects, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print("Error saving projects to disk:", e)

    def get_all_projects(self) -> List[Dict[str, Any]]:
        self._load_from_disk()
        return self.projects

    def save_project(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        self._load_from_disk()
        p_id = snapshot.get("id")
        p_name = snapshot.get("name")
        existing_idx = -1
        for idx, p in enumerate(self.projects):
            if (p_id and p.get("id") == p_id) or (p_name and p.get("name") == p_name):
                existing_idx = idx
                break
        
        if existing_idx >= 0:
            self.projects[existing_idx] = snapshot
        else:
            self.projects.insert(0, snapshot)
            
        self._save_to_disk()
        return snapshot

    def delete_project(self, p_id: str) -> List[Dict[str, Any]]:
        self._load_from_disk()
        self.projects = [p for p in self.projects if p.get("id") != p_id and p.get("name") != p_id]
        self._save_to_disk()
        return self.projects

projects_service = ProjectsService()
