import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from src.backend.desktop.storage_service import DesktopStorageService


def project_document(name: str = "Asta Test"):
    return {
        "projectName": name,
        "participants": [{"id": "001", "name": "Test Winner"}],
        "roundConfigs": [],
        "drawState": {},
        "assets": [],
        "background": {"type": "none", "assetId": None},
    }


class DesktopStorageTests(unittest.TestCase):
    def test_new_projects_use_asta_extension_and_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = DesktopStorageService(Path(directory) / "data")
            saved = storage.save_project(project_document())

            project_path = Path(saved["path"])
            self.assertEqual(project_path.suffix, ".asta")
            self.assertTrue(zipfile.is_zipfile(project_path))
            with zipfile.ZipFile(project_path) as archive:
                payload = json.loads(archive.read("project.json").decode("utf-8"))
            self.assertEqual(payload["appName"], "AstaStudio")

            reopened = storage.open_project(str(project_path))
            self.assertEqual(reopened["document"]["projectName"], "Asta Test")
            self.assertEqual(reopened["document"]["participants"][0]["id"], "001")

    def test_legacy_ldp_projects_remain_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            storage = DesktopStorageService(root / "data")
            legacy_path = root / "Legacy Project.ldp"

            saved = storage.save_project(project_document("Legacy Project"), str(legacy_path))
            self.assertEqual(Path(saved["path"]).suffix, ".ldp")
            reopened = storage.open_project(str(legacy_path))
            self.assertEqual(reopened["document"]["projectName"], "Legacy Project")

    def test_default_path_copies_legacy_data_without_removing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            local_app_data = Path(directory)
            legacy = local_app_data / "LuckyDrawProStudio"
            legacy.mkdir()
            (legacy / "settings.json").write_text(json.dumps({"ribbonMode": "compact"}), encoding="utf-8")
            environment = {key: value for key, value in os.environ.items() if key not in {
                "ASTA_APP_DATA_DIR", "LDP_APP_DATA_DIR"
            }}
            environment["LOCALAPPDATA"] = str(local_app_data)

            with patch.dict(os.environ, environment, clear=True):
                storage = DesktopStorageService()

            self.assertEqual(storage.app_data_dir, local_app_data / "AstaStudio")
            self.assertEqual(storage.load_settings()["ribbonMode"], "compact")
            self.assertTrue((legacy / "settings.json").exists())
            self.assertTrue((storage.app_data_dir / ".migrated-from-LuckyDrawProStudio").exists())


if __name__ == "__main__":
    unittest.main()
