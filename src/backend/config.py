# src/backend/config.py
import os
from pathlib import Path

APP_NAME = "Asta Studio"
APP_VERSION = "6.0.0"


def _app_data_dir() -> Path:
    override = os.environ.get("ASTA_APP_DATA_DIR") or os.environ.get("LDP_APP_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "AstaStudio"
    return Path.home() / ".local" / "share" / "AstaStudio"


APP_DATA_DIR = _app_data_dir()
AUTH_DATA_DIR = APP_DATA_DIR / "Auth"

# Local machine-bound authentication state.
AUTH_TOKEN_FILE = str(AUTH_DATA_DIR / "session.json")
SYNC_PASSWORD_FILE = str(AUTH_DATA_DIR / "password_sync.json")
BLOCK_STATE_FILE = str(AUTH_DATA_DIR / "block.json")

LEGACY_AUTH_FILES = {
    SYNC_PASSWORD_FILE: os.path.join(os.path.expanduser("~"), ".lucky_draw_v5_password_sync.json"),
    BLOCK_STATE_FILE: os.path.join(os.path.expanduser("~"), ".lucky_draw_v5_block.json"),
}

# Anti-Spam / Rate-Limiting Thresholds (Block App if exceeded)
MAX_FAILED_ATTEMPTS = 5
MAX_REMOTE_REQUESTS = 3
DEFAULT_BLOCK_DURATION_SECONDS = 900 # 15 minutes default penalty

# No built-in password is accepted. Password verification is owned by the
# Super Admin service; this value exists only for short-lived legacy migration.
DEFAULT_MASTER_PASSWORD_HASH = ""

# Google Apps Script Webhook URL for Gmail Remote Approval
GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxGuKLa0WXH7JQohjfVB3jTxiuTc0DaB_st_F7LCSjEryr5GAh3Q_L7oUW6TWasnhVX/exec"
