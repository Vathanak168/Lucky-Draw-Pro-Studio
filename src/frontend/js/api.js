// src/frontend/js/api.js
const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:8926/api' : '/api';

class StudioAPI {
    static async request(path, options = {}) {
        const res = await fetch(`${API_BASE}${path}`, options);
        const contentType = res.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await res.json()
            : { detail: await res.text() };

        if (!res.ok) {
            const detail = payload.detail;
            const detailData = detail && typeof detail === 'object' ? detail : null;
            const message = detailData?.message || (typeof detail === 'string' ? detail : '') || payload.message || 'Request Failed';
            const error = new Error(message);
            error.status = res.status;
            error.data = detailData ? { ...payload, ...detailData } : payload;
            throw error;
        }
        return payload;
    }

    static async getAuthStatus() {
        return this.request('/auth/status');
    }

    static async getAuthSession() {
        return this.request('/auth/session');
    }

    static async loginMasterPassword(password) {
        return this.request('/auth/login', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
        });
    }

    static async requestRemoteGmailUnlock(clientName) {
        return this.request('/auth/request-remote', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_name: clientName })
        });
    }

    static async checkRemoteGmailUnlock() {
        return this.request('/auth/check-remote');
    }

    static async logoutConsole() {
        return this.request('/auth/logout', { method: "POST" });
    }

    static async syncSuperAdminPassword() {
        try {
            return await this.request('/auth/sync-password');
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
