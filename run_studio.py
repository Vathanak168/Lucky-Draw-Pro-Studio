# run_studio.py
import os
import sys
import threading
import time
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import webview

from src.backend.config import APP_NAME, APP_VERSION
from src.backend.auth.router import router as auth_router
from src.backend.core.router import router as core_router
from src.backend.desktop.bridge import desktop_bridge
from src.backend.desktop.router import router as desktop_router
from src.backend.desktop.storage_service import desktop_storage

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Disable caching for local desktop webview so updates appear immediately on refresh
@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Allow local CORS for desktop communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_router)
app.include_router(core_router)
app.include_router(desktop_router)

# Serve Frontend static assets from src/frontend
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "frontend")
app.mount(
    "/local-assets",
    StaticFiles(directory=str(desktop_storage.workspaces_dir)),
    name="local-assets"
)
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

def run_fastapi():
    """Runs Uvicorn FastAPI server in background thread."""
    uvicorn.run(app, host="127.0.0.1", port=8926, log_level="error")

def main():
    # Start FastAPI server thread
    server_thread = threading.Thread(target=run_fastapi, daemon=True)
    server_thread.start()
    
    # Wait slightly for server to bind port
    time.sleep(0.8)
    
    # Create Native PyWebView Window
    window = webview.create_window(
        title=f"{APP_NAME} ({APP_VERSION})",
        url="http://127.0.0.1:8926/index.html",
        js_api=desktop_bridge,
        width=1440,
        height=900,
        min_size=(1024, 700),
        background_color="#161616"
    )
    desktop_bridge._bind_window(window)
    
    # Start desktop GUI loop
    webview.start(debug=False)

if __name__ == "__main__":
    main()
