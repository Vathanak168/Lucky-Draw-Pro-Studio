@echo off
cd /d "%~dp0"
start "Asta Studio" ".venv\Scripts\pythonw.exe" -B "run_studio.py"
