// src/frontend/js/api.js
const API_BASE = "http://127.0.0.1:8926/api";

class StudioAPI {
    static async getAuthStatus() {
        const res = await fetch(`${API_BASE}/auth/status`);
        return await res.json();
    }

    static async loginMasterPassword(password) {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Authentication Failed");
        }
        return await res.json();
    }

    static async requestRemoteGmailUnlock(clientName) {
        const res = await fetch(`${API_BASE}/auth/request-remote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_name: clientName })
        });
        return await res.json();
    }

    static async checkRemoteGmailUnlock() {
        const res = await fetch(`${API_BASE}/auth/check-remote`);
        return await res.json();
    }

    static async logoutConsole() {
        const res = await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
        return await res.json();
    }

    static async syncSuperAdminPassword() {
        try {
            const res = await fetch(`${API_BASE}/auth/sync-password`);
            return await res.json();
        } catch (e) {
            return { synced: false, offline: true };
        }
    }

    static async getSavedProjectsFromDisk() {
        try {
            const res = await fetch(`${API_BASE}/core/projects/list`);
            return await res.json();
        } catch (e) {
            return null;
        }
    }

    static async saveProjectToDisk(snapshot) {
        try {
            const res = await fetch(`${API_BASE}/core/projects/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(snapshot)
            });
            return await res.json();
        } catch (e) {
            return null;
        }
    }

    static async deleteProjectFromDisk(projectId) {
        try {
            const res = await fetch(`${API_BASE}/core/projects/delete/${encodeURIComponent(projectId)}`, {
                method: "DELETE"
            });
            return await res.json();
        } catch (e) {
            return null;
        }
    }
}

window.StudioAPI = StudioAPI;
