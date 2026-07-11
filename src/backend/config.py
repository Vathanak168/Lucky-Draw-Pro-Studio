# src/backend/config.py
import os
import hashlib

APP_NAME = "Lucky Draw Pro Studio - VJ Console Edition"
APP_VERSION = "5.0.0"

# Local storage path for machine-bound authentication token
AUTH_TOKEN_FILE = os.path.join(os.path.expanduser("~"), ".lucky_draw_v5_auth.json")
SYNC_PASSWORD_FILE = os.path.join(os.path.expanduser("~"), ".lucky_draw_v5_password_sync.json")

# Master Password Hash (Default: 'resolume2026' - owner can change in setup)
# SHA-256 of 'resolume2026'
DEFAULT_MASTER_PASSWORD_HASH = hashlib.sha256("resolume2026".encode('utf-8')).hexdigest()

# Google Apps Script Webhook URL for Gmail Remote Approval
GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw9aGWSKDTWQYdPTRv86LRfcXOON20d6dANP4ot5HdWQJHCFFIECCkolhfj3M6rJhLQ/exec"
