// src/frontend/js/api.js
const API_BASE = '/api';

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

}

window.StudioAPI = StudioAPI;
