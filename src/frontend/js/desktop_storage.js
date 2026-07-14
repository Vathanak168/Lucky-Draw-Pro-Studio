/**
 * DesktopStorage is the only persistence boundary used by the active UI.
 * It writes through Python to local files and never uses browser storage.
 */
window.DesktopStorage = {
    bridge: null,
    settings: {},
    recent: [],
    recoveries: [],
    currentPath: null,
    workspaceId: null,
    revision: 0,
    recoveryTimer: null,
    recoveryProvider: null,
    recoveryQueue: Promise.resolve(),
    workspaceReady: Promise.resolve(),

    async init() {
        this.bridge = await this.waitForBridge();
        const state = this.bridge
            ? await this.bridge.get_startup_state()
            : await this.request('/api/desktop/startup');
        this.settings = state.settings || {};
        this.recent = state.recent || [];
        this.recoveries = state.recoveries || [];
        this.revision = this.recoveries.reduce((max, item) => Math.max(max, Number(item.revision) || 0), this.revision);
        this.currentPath = state.projectPath || null;
        this.workspaceId = state.workspaceId || null;
        return state;
    },

    async waitForBridge(timeoutMs = 1200) {
        if (window.pywebview && window.pywebview.api) return window.pywebview.api;
        return new Promise(resolve => {
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            window.addEventListener('pywebviewready', () => finish(window.pywebview.api), { once: true });
            setTimeout(() => finish(window.pywebview && window.pywebview.api ? window.pywebview.api : null), timeoutMs);
        });
    },

    async request(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: options.body instanceof FormData
                ? (options.headers || {})
                : { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (!response.ok) {
            let detail = `Request failed (${response.status})`;
            try {
                const payload = await response.json();
                detail = payload.detail || detail;
            } catch (e) {}
            throw new Error(detail);
        }
        return response.json();
    },

    newProjectWorkspace() {
        this.workspaceReady = this.workspaceReady
            .catch(() => null)
            .then(async () => {
                const result = this.bridge
                    ? await this.bridge.new_project_workspace()
                    : await this.request('/api/desktop/projects/new', { method: 'POST', body: '{}' });
                this.currentPath = null;
                this.workspaceId = result.workspaceId || null;
                return result;
            });
        return this.workspaceReady;
    },

    async updateSettings(patch) {
        const result = this.bridge
            ? await this.bridge.update_settings(patch)
            : await this.request('/api/desktop/settings', {
                method: 'POST',
                body: JSON.stringify({ patch })
            });
        this.settings = result || this.settings;
        return this.settings;
    },

    async openProject() {
        await this.workspaceReady;
        if (!this.bridge) return { ok: false, needsBrowserFile: true };
        const result = await this.bridge.open_project();
        return this.captureProjectResult(result);
    },

    async openRecent(path) {
        await this.workspaceReady;
        const result = this.bridge
            ? await this.bridge.open_recent(path)
            : await this.request('/api/desktop/projects/open-recent', {
                method: 'POST',
                body: JSON.stringify({ path })
            });
        return this.captureProjectResult(result);
    },

    async openBrowserFile(file) {
        await this.workspaceReady;
        const form = new FormData();
        form.append('file', file);
        const result = await this.request('/api/desktop/projects/upload', { method: 'POST', body: form });
        return this.captureProjectResult(result);
    },

    captureProjectResult(result) {
        if (result && result.ok) {
            this.currentPath = result.path || null;
            this.recent = result.recent || this.recent;
            const runtime = result.document && result.document.runtime;
            if (runtime && runtime.workspaceId) this.workspaceId = runtime.workspaceId;
        }
        return result;
    },

    async saveProject(document, saveAs = false) {
        await this.workspaceReady;
        let result;
        if (this.bridge) {
            result = saveAs
                ? await this.bridge.save_project_as(document)
                : await this.bridge.save_project(document);
        } else {
            result = await this.request(
                saveAs ? '/api/desktop/projects/save-as-default' : '/api/desktop/projects/save',
                { method: 'POST', body: JSON.stringify({ document }) }
            );
        }
        if (result && result.ok) {
            this.currentPath = result.path || this.currentPath;
            this.recent = result.recent || this.recent;
        }
        return result;
    },

    async removeRecent(path) {
        const result = this.bridge
            ? await this.bridge.remove_recent(path)
            : await this.request('/api/desktop/projects/remove-recent', {
                method: 'POST',
                body: JSON.stringify({ path })
            });
        this.recent = result.recent || [];
        return this.recent;
    },

    async uploadBackgroundAsset(file, kind) {
        await this.workspaceReady;
        const form = new FormData();
        form.append('file', file);
        const result = await this.request(`/api/desktop/assets/upload/${kind}`, { method: 'POST', body: form });
        if (result.asset && result.asset.workspaceId) this.workspaceId = result.asset.workspaceId;
        return result.asset;
    },

    scheduleRecovery(provider, immediate = false) {
        this.revision += 1;
        this.recoveryProvider = provider;
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        if (immediate) {
            this.flushRecovery();
        } else {
            this.recoveryTimer = setTimeout(() => this.flushRecovery(), 1800);
        }
    },

    flushRecovery() {
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        const provider = this.recoveryProvider;
        const revision = this.revision;
        if (!provider) return this.recoveryQueue;
        this.recoveryQueue = this.recoveryQueue
            .catch(() => null)
            .then(async () => {
                await this.workspaceReady;
                const document = typeof provider === 'function' ? provider() : provider;
                if (!document) return null;
                return this.bridge
                    ? this.bridge.write_recovery(document, revision)
                    : this.request('/api/desktop/recovery', {
                        method: 'POST',
                        body: JSON.stringify({ document, revision })
                    });
            })
            .catch(error => {
                console.error('Recovery save failed:', error);
                return null;
            });
        return this.recoveryQueue;
    },

    async restoreRecovery(id) {
        await this.workspaceReady;
        const result = this.bridge
            ? await this.bridge.restore_recovery(id)
            : await this.request(`/api/desktop/recovery/restore/${encodeURIComponent(id)}`, {
                method: 'POST', body: '{}'
            });
        return this.captureProjectResult(result);
    },

    async discardRecovery(projectId) {
        if (!projectId) return;
        if (this.bridge) return this.bridge.discard_recovery(projectId);
        return this.request(`/api/desktop/recovery/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    },

    async clearRecoveryAfterSave(projectId) {
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        this.recoveryProvider = null;
        await this.recoveryQueue.catch(() => null);
        return this.discardRecovery(projectId);
    },

    async exportHistory(report) {
        if (this.bridge && typeof this.bridge.export_history === 'function') {
            return this.bridge.export_history(report);
        }

        const response = await fetch('/api/desktop/history/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report })
        });
        if (!response.ok) {
            let detail = `Export failed (${response.status})`;
            try {
                const payload = await response.json();
                detail = payload.detail || detail;
            } catch (e) {}
            throw new Error(detail);
        }

        const blob = await response.blob();
        const encodedFilename = response.headers.get('X-Export-Filename');
        let filename = 'Lucky Draw - Draw History.xlsx';
        if (encodedFilename) {
            try {
                filename = decodeURIComponent(encodedFilename);
            } catch (e) {
                filename = encodedFilename;
            }
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { ok: true, filename };
    },

    async telegramStatus(projectId = '') {
        if (this.bridge && typeof this.bridge.telegram_status === 'function') {
            return this.bridge.telegram_status(projectId);
        }
        return this.request(`/api/desktop/telegram/status?project_id=${encodeURIComponent(projectId)}`);
    },

    async telegramConnect(token, groupChatId = '') {
        if (this.bridge && typeof this.bridge.telegram_connect === 'function') {
            return this.bridge.telegram_connect(token, groupChatId);
        }
        return this.request('/api/desktop/telegram/connect', {
            method: 'POST',
            body: JSON.stringify({ token, groupChatId })
        });
    },

    async telegramDisconnect() {
        if (this.bridge && typeof this.bridge.telegram_disconnect === 'function') {
            return this.bridge.telegram_disconnect();
        }
        return this.request('/api/desktop/telegram/disconnect', { method: 'POST', body: '{}' });
    },

    async telegramTestConnection() {
        if (this.bridge && typeof this.bridge.telegram_test_connection === 'function') {
            return this.bridge.telegram_test_connection();
        }
        return this.request('/api/desktop/telegram/test', { method: 'POST', body: '{}' });
    },

    async telegramSavePreferences(preferences, validateGroup = false) {
        if (this.bridge && typeof this.bridge.telegram_save_preferences === 'function') {
            return this.bridge.telegram_save_preferences(preferences, validateGroup);
        }
        return this.request('/api/desktop/telegram/preferences', {
            method: 'POST',
            body: JSON.stringify({ preferences, validateGroup })
        });
    },

    async telegramEnqueue(jobs) {
        if (this.bridge && typeof this.bridge.telegram_enqueue === 'function') {
            return this.bridge.telegram_enqueue(jobs);
        }
        return this.request('/api/desktop/telegram/enqueue', {
            method: 'POST',
            body: JSON.stringify({ jobs })
        });
    },

    async telegramJobs(projectId = '', limit = 100) {
        if (this.bridge && typeof this.bridge.telegram_jobs === 'function') {
            return this.bridge.telegram_jobs(projectId, limit);
        }
        return this.request(`/api/desktop/telegram/jobs?project_id=${encodeURIComponent(projectId)}&limit=${encodeURIComponent(limit)}`);
    },

    async telegramRetry(jobId) {
        if (this.bridge && typeof this.bridge.telegram_retry === 'function') {
            return this.bridge.telegram_retry(jobId);
        }
        return this.request(`/api/desktop/telegram/jobs/${encodeURIComponent(jobId)}/retry`, {
            method: 'POST', body: '{}'
        });
    },

    async telegramHandleRedraw(payload) {
        if (this.bridge && typeof this.bridge.telegram_handle_redraw === 'function') {
            return this.bridge.telegram_handle_redraw(payload);
        }
        return this.request('/api/desktop/telegram/redraw', {
            method: 'POST',
            body: JSON.stringify({ payload })
        });
    }
};
