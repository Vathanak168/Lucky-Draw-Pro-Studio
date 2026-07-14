import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

with patch("src.backend.auth.machine_id.get_hardware_fingerprint", return_value="LDP-TEST-0001"):
    import src.backend.auth.gatekeeper as gatekeeper_module


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        return self.payload


class GatekeeperServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.auth_file = root / "auth.json"
        self.sync_file = root / "password.json"
        self.block_file = root / "block.json"
        self.patchers = [
            patch.object(gatekeeper_module, "AUTH_TOKEN_FILE", str(self.auth_file)),
            patch.object(gatekeeper_module, "SYNC_PASSWORD_FILE", str(self.sync_file)),
            patch.object(gatekeeper_module, "BLOCK_STATE_FILE", str(self.block_file)),
            patch.object(gatekeeper_module, "GOOGLE_APPS_SCRIPT_URL", "https://script.google.com/test"),
            patch.object(gatekeeper_module, "get_hardware_fingerprint", return_value="LDP-TEST-0001"),
        ]
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self):
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temp_dir.cleanup()

    def make_service(self):
        return gatekeeper_module.GatekeeperService()

    def test_each_launch_discards_a_persisted_unlock(self):
        self.auth_file.write_text(
            json.dumps({"machine_id": "old", "unlocked": True, "timestamp": 9999999999}),
            encoding="utf-8",
        )

        service = self.make_service()

        self.assertFalse(service.is_unlocked)
        self.assertFalse(self.auth_file.exists())

    def test_new_global_password_invalidates_the_previous_password(self):
        service = self.make_service()
        responses = [
            FakeResponse({"status": "OK", "verified": True, "password_version": 1}),
            FakeResponse({"status": "OK", "verified": False, "password_version": 2}),
            FakeResponse({"status": "OK", "verified": True, "password_version": 2}),
        ]

        with patch.object(gatekeeper_module.requests, "post", side_effect=responses):
            self.assertTrue(service.verify_master_password("first-password"))
            service.lock_session()
            self.assertFalse(service.verify_master_password("first-password"))
            self.assertEqual(service.password_version, 2)
            self.assertTrue(service.verify_master_password("second-password"))

    def test_cached_password_cannot_unlock_while_offline(self):
        cached_hash = hashlib.sha256(b"cached-password").hexdigest()
        self.sync_file.write_text(
            json.dumps({"password_hash": cached_hash, "version": 3}),
            encoding="utf-8",
        )
        service = self.make_service()

        with patch.object(gatekeeper_module.requests, "post", side_effect=OSError("offline")):
            with self.assertRaises(gatekeeper_module.AuthenticationUnavailableError):
                service.verify_master_password("cached-password")

        self.assertFalse(service.is_unlocked)

    def test_password_version_rollback_is_rejected(self):
        cached_hash = hashlib.sha256(b"current-password").hexdigest()
        self.sync_file.write_text(
            json.dumps({"password_hash": cached_hash, "version": 9}),
            encoding="utf-8",
        )
        service = self.make_service()

        with patch.object(
            gatekeeper_module.requests,
            "post",
            return_value=FakeResponse({"status": "OK", "password_available": True, "password_version": 8}),
        ):
            result = service.sync_remote_password_from_super_admin()

        self.assertFalse(result["synced"])
        self.assertEqual(service.password_version, 9)
        self.assertEqual(service.current_password_hash, cached_hash)

    def test_cloud_password_hash_syncs_without_plaintext_password(self):
        service = self.make_service()
        password_hash = hashlib.sha256(b"cloud-password").hexdigest()

        with patch.object(gatekeeper_module.requests, "post", return_value=FakeResponse({
            "status": "ERROR", "message": "Unknown POST action"
        })):
            with patch.object(
                gatekeeper_module.requests,
                "get",
                return_value=FakeResponse({"global_password_hash": password_hash, "password_version": 12}),
            ):
                result = service.sync_remote_password_from_super_admin()

        self.assertTrue(result["synced"])
        self.assertEqual(service.current_password_hash, password_hash)
        self.assertEqual(service.password_version, 12)

    def test_server_verified_password_does_not_cache_password_hash(self):
        service = self.make_service()
        response = FakeResponse({
            "status": "OK",
            "verified": True,
            "password_available": True,
            "password_version": 15,
        })

        with patch.object(gatekeeper_module.requests, "post", return_value=response):
            self.assertTrue(service.verify_master_password("server-only-password"))

        cached = json.loads(self.sync_file.read_text(encoding="utf-8"))
        self.assertEqual(cached["version"], 15)
        self.assertNotIn("password_hash", cached)

    def test_remote_approval_unlocks_only_the_current_process(self):
        service = self.make_service()
        response = FakeResponse(
            {
                "approved": True,
                "global_password": "current-password",
                "password_version": 4,
            }
        )

        with patch.object(gatekeeper_module.requests, "post", return_value=response):
            result = service.check_remote_status()

        self.assertTrue(result["approved"])
        self.assertTrue(service.is_unlocked)
        self.assertEqual(service.unlock_type, "remote_gmail")
        self.assertFalse(self.auth_file.exists())

        relaunched_service = self.make_service()
        self.assertFalse(relaunched_service.is_unlocked)

    def test_remote_status_temporarily_falls_back_to_legacy_get_endpoint(self):
        service = self.make_service()
        post_response = FakeResponse({"status": "ERROR", "message": "Unknown POST action"})
        get_response = FakeResponse(
            {
                "approved": True,
                "global_password": "legacy-cloud-password",
                "password_version": 5,
            }
        )

        with patch.object(gatekeeper_module.requests, "post", return_value=post_response):
            with patch.object(gatekeeper_module.requests, "get", return_value=get_response):
                result = service.check_remote_status()

        self.assertTrue(result["approved"])
        self.assertTrue(service.is_unlocked)


if __name__ == "__main__":
    unittest.main()
