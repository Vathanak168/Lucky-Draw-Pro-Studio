from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


project_root = Path(SPECPATH).resolve().parent


def data_file(relative_path):
    source = project_root / relative_path
    destination = str(Path(relative_path).parent).replace("\\", "/")
    return (str(source), destination)


frontend_files = [
    "src/frontend/index.html",
    "src/frontend/login.html",
    "src/frontend/legacy-recovery.html",
    "src/frontend/assets/asta-mark.ico",
    "src/frontend/assets/asta-mark.svg",
    "src/frontend/assets/Asta_Studio_Participant_Template.xlsx",
    "src/frontend/projector/projector.html",
    "src/frontend/projector/projector.js",
    "src/frontend/styles/login.css",
    "src/frontend/styles/resolume_arena.css",
    "src/frontend/styles/virtual_stage.css",
    "src/frontend/styles/macos_pro.css",
    "src/frontend/vendor/lucide.js",
    "src/frontend/vendor/xlsx.full.min.js",
    "src/frontend/vendor/SHEETJS-LICENSE.txt",
    "src/frontend/js/runtime_session.js",
    "src/frontend/js/macos_ui.js",
    "src/frontend/js/api.js",
    "src/frontend/js/desktop_storage.js",
    "src/frontend/js/projector_sync.js",
    "src/frontend/js/legacy_recovery.js",
    "src/frontend/js/studio.js",
    "src/frontend/js/auth/login.js",
    "src/frontend/js/core/audioSynth.js",
    "src/frontend/js/engine/state.js",
    "src/frontend/js/engine/virtual_scaler.js",
    "src/frontend/js/engine/animations.js",
    "src/frontend/js/engine/display.js",
    "src/frontend/js/engine/draw.js",
    "src/frontend/js/zones/zoneA_deck.js",
    "src/frontend/js/zones/zoneB_transport.js",
    "src/frontend/js/zones/zoneC_monitors.js",
    "src/frontend/js/zones/zoneD_poolManager.js",
    "src/frontend/js/zones/zoneD_inspector.js",
    "src/frontend/js/zones/zoneE_stageControls.js",
    "src/frontend/js/zones/zoneE_telegramBot.js",
    "src/frontend/js/zones/zoneE_browser.js",
]

hidden_imports = sorted(set(
    collect_submodules("uvicorn")
    + [
        "clr",
        "clr_loader",
        "pythoncom",
        "pywintypes",
        "win32com",
        "win32com.client",
        "wmi",
        "multipart",
        "openpyxl",
        "webview.platforms.edgechromium",
        "webview.platforms.winforms",
    ]
))

a = Analysis(
    [str(project_root / "run_studio.py")],
    pathex=[str(project_root)],
    binaries=[],
    datas=[data_file(path) for path in frontend_files],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "cefpython3",
        "PyQt5",
        "PyQt6",
        "PySide2",
        "PySide6",
        "tkinter",
    ],
    noarchive=False,
    optimize=1,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Asta Studio",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch="x86_64",
    icon=str(project_root / "src/frontend/assets/asta-mark.ico"),
    version=str(project_root / "packaging/version_info.txt"),
    uac_admin=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Asta Studio",
)
