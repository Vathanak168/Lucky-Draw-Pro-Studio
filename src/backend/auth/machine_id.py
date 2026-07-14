# src/backend/auth/machine_id.py
import hashlib
import platform
import subprocess

def get_hardware_fingerprint() -> str:
    """
    Retrieves unique hardware identifiers from Windows (Motherboard UUID or WMI BIOS Serial).
    Generates a deterministic, tamper-resistant Machine ID string (e.g. ASTA-849A-2F1B).
    """
    raw_id = platform.node() + "_" + platform.machine()
    
    # Try to get motherboard UUID via Windows WMI/PowerShell
    if platform.system() == "Windows":
        try:
            import wmi
            c = wmi.WMI()
            for c_spec in c.Win32_ComputerSystemProduct():
                if c_spec.UUID and c_spec.UUID != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF":
                    raw_id += "_" + str(c_spec.UUID)
                    break
        except Exception:
            try:
                out = subprocess.check_output(
                    ['powershell', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID'],
                    universal_newlines=True,
                    timeout=3,
                    stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                ).strip()
                if out:
                    raw_id += "_" + out
            except Exception:
                pass

    # Hash and format nicely for display: e.g., ASTA-849A-2F1B
    sha = hashlib.sha256(raw_id.encode('utf-8')).hexdigest().upper()
    part1 = sha[0:4]
    part2 = sha[4:8]
    return f"ASTA-{part1}-{part2}"

if __name__ == "__main__":
    print("Detected Machine ID:", get_hardware_fingerprint())
