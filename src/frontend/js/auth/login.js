window.AstaLogin = {
    mode: 'password',
    machineId: '',
    authReady: false,
    busy: false,
    pending: false,
    blocked: false,
    blockTimer: null,
    pollTimer: null,
    pollGeneration: 0,

    init() {
        this.passwordTab = document.getElementById('passwordTab');
        this.requestTab = document.getElementById('requestTab');
        this.passwordForm = document.getElementById('passwordForm');
        this.requestForm = document.getElementById('requestForm');
        this.pendingView = document.getElementById('pendingView');
        this.passwordInput = document.getElementById('passwordInput');
        this.deviceNameInput = document.getElementById('deviceNameInput');
        this.unlockButton = document.getElementById('unlockButton');
        this.requestAccessButton = document.getElementById('requestAccessButton');
        this.passwordVisibilityButton = document.getElementById('passwordVisibilityButton');
        this.cancelRequestButton = document.getElementById('cancelRequestButton');
        this.machineIdDisplay = document.getElementById('machineIdDisplay');
        this.copyMachineIdButton = document.getElementById('copyMachineIdButton');
        this.authStatus = document.getElementById('authStatus');
        this.authStatusText = document.getElementById('authStatusText');
        this.authStatusIcon = document.getElementById('authStatusIcon');
        this.connectionDot = document.getElementById('connectionDot');
        this.connectionText = document.getElementById('connectionText');
        this.retryConnectionButton = document.getElementById('retryConnectionButton');

        document.querySelectorAll('[data-mode]').forEach(button => {
            button.addEventListener('click', () => this.setMode(button.dataset.mode));
        });
        this.passwordForm.addEventListener('submit', event => this.handlePasswordSubmit(event));
        this.requestForm.addEventListener('submit', event => this.handleRequestSubmit(event));
        this.passwordVisibilityButton.addEventListener('click', () => this.togglePasswordVisibility());
        this.cancelRequestButton.addEventListener('click', () => this.cancelRemoteRequest());
        this.copyMachineIdButton.addEventListener('click', () => this.copyMachineId());
        this.retryConnectionButton.addEventListener('click', () => this.refreshStatus());

        this.renderIcons();
        this.refreshStatus();
    },

    renderIcons() {
        if (window.lucide) window.lucide.createIcons();
    },

    setMode(mode) {
        if (this.busy || this.pending || this.blocked || !this.authReady || !['password', 'request'].includes(mode)) return;
        this.mode = mode;
        const passwordActive = mode === 'password';
        this.passwordTab.classList.toggle('active', passwordActive);
        this.passwordTab.setAttribute('aria-selected', String(passwordActive));
        this.requestTab.classList.toggle('active', !passwordActive);
        this.requestTab.setAttribute('aria-selected', String(!passwordActive));
        this.passwordForm.hidden = !passwordActive;
        this.requestForm.hidden = passwordActive;
        this.pendingView.hidden = true;
        this.clearStatus();
        setTimeout(() => (passwordActive ? this.passwordInput : this.deviceNameInput).focus(), 0);
    },

    async refreshStatus() {
        if (this.busy) return;
        this.stopBlockCountdown();
        this.setBusy(true);
        this.setConnection('checking', 'Checking Connection');
        this.setStatus('info', 'Checking Authorization', 'loader-circle');

        try {
            const status = await StudioAPI.getAuthStatus();
            this.applyDevice(status);

            if (status.blocked) {
                this.authReady = false;
                this.setConnection(status.online ? 'online' : 'offline', status.online ? 'Connected' : 'Offline');
                this.startBlockCountdown(status.blocked_remaining, status.block_reason);
                return;
            }

            if (status.unlocked) {
                await this.enterWorkspace();
                return;
            }

            this.authReady = Boolean(status.auth_ready);
            if (this.authReady) {
                this.setConnection('online', 'Authorization Service Connected');
                this.clearStatus();
                setTimeout(() => this.passwordInput.focus(), 0);
            } else {
                const serviceOnline = Boolean(status.online);
                this.setConnection(serviceOnline ? 'online' : 'offline', serviceOnline ? 'Authorization Service Error' : 'Authorization Service Offline');
                this.setStatus('error', serviceOnline ? 'Authorization Unavailable' : 'Internet Connection Required', serviceOnline ? 'circle-alert' : 'wifi-off');
            }
        } catch (error) {
            this.authReady = false;
            this.setConnection('offline', 'Authorization Service Offline');
            this.setStatus('error', 'Internet Connection Required', 'wifi-off');
        } finally {
            this.setBusy(false);
            this.updateControls();
        }
    },

    applyDevice(status) {
        this.machineId = status.machine_id || '';
        this.machineIdDisplay.textContent = this.machineId || 'Unavailable';
        this.copyMachineIdButton.disabled = !this.machineId;
        if (!this.deviceNameInput.value) {
            this.deviceNameInput.value = status.device_name || 'Event Computer';
        }
    },

    async handlePasswordSubmit(event) {
        event.preventDefault();
        if (this.busy || this.blocked || !this.authReady) return;
        const password = this.passwordInput.value;
        if (!password) {
            this.setStatus('warning', 'Password Required', 'key-round');
            this.passwordInput.focus();
            return;
        }

        this.setBusy(true);
        this.setStatus('info', 'Verifying Password', 'loader-circle');
        try {
            const result = await StudioAPI.loginMasterPassword(password);
            if (result.unlocked) {
                this.passwordInput.value = '';
                await this.enterWorkspace();
            }
        } catch (error) {
            if (error.status === 423 || error.status === 429 || error.data?.blocked) {
                const remaining = error.data?.blocked_remaining || 900;
                const reason = error.data?.block_reason || error.message;
                this.startBlockCountdown(remaining, reason);
            } else if (error.status === 503) {
                this.authReady = false;
                this.setConnection('offline', 'Authorization Service Offline');
                this.setStatus('error', 'Internet Connection Required', 'wifi-off');
            } else {
                this.setStatus('error', 'Incorrect Password', 'circle-alert');
                this.passwordInput.select();
            }
        } finally {
            this.setBusy(false);
            this.updateControls();
        }
    },

    async handleRequestSubmit(event) {
        event.preventDefault();
        if (this.busy || this.blocked || !this.authReady) return;
        const deviceName = this.deviceNameInput.value.trim() || 'Event Computer';

        this.setBusy(true);
        this.setStatus('info', 'Sending Request', 'loader-circle');
        try {
            const result = await StudioAPI.requestRemoteGmailUnlock(deviceName);
            if (result.blocked) {
                this.startBlockCountdown(result.blocked_remaining || 900, result.message);
                return;
            }
            if (result.status === 'ERROR') {
                throw new Error(result.message || 'Request Failed');
            }
            this.showPending();
            this.startApprovalPolling();
        } catch (error) {
            if (error.status === 423 || error.data?.blocked) {
                this.startBlockCountdown(
                    error.data?.blocked_remaining || 900,
                    error.data?.block_reason || error.message,
                );
            } else {
                this.setStatus('error', error.status === 503 ? 'Internet Connection Required' : 'Request Failed', error.status === 503 ? 'wifi-off' : 'circle-alert');
            }
        } finally {
            this.setBusy(false);
            this.updateControls();
        }
    },

    showPending() {
        this.pending = true;
        this.passwordForm.hidden = true;
        this.requestForm.hidden = true;
        this.pendingView.hidden = false;
        this.setStatus('info', 'Request Sent', 'send');
    },

    startApprovalPolling() {
        this.stopApprovalPolling();
        const generation = ++this.pollGeneration;

        const poll = async () => {
            if (generation !== this.pollGeneration) return;
            try {
                const result = await StudioAPI.checkRemoteGmailUnlock();
                const details = result.details || {};
                if (details.blocked) {
                    this.startBlockCountdown(details.duration || details.blocked_remaining || 900, details.message);
                    return;
                }
                if (result.unlocked || details.approved) {
                    await this.enterWorkspace();
                    return;
                }
                if (details.denied) {
                    this.cancelRemoteRequest(false);
                    this.setStatus('error', 'Request Denied', 'circle-x');
                    return;
                }
            } catch (error) {
                this.setConnection('offline', 'Authorization Service Offline');
                this.setStatus('warning', 'Connection Interrupted', 'wifi-off');
            }

            if (generation === this.pollGeneration) {
                this.pollTimer = setTimeout(poll, 3000);
            }
        };

        this.pollTimer = setTimeout(poll, 1200);
    },

    stopApprovalPolling() {
        this.pollGeneration += 1;
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = null;
    },

    cancelRemoteRequest(clearStatus = true) {
        this.stopApprovalPolling();
        this.pending = false;
        this.pendingView.hidden = true;
        this.requestForm.hidden = this.mode !== 'request';
        this.passwordForm.hidden = this.mode !== 'password';
        if (clearStatus) this.clearStatus();
        this.updateControls();
    },

    startBlockCountdown(seconds, reason) {
        this.stopApprovalPolling();
        this.stopBlockCountdown();
        this.pending = false;
        this.blocked = true;
        this.authReady = false;
        this.pendingView.hidden = true;
        this.passwordForm.hidden = this.mode !== 'password';
        this.requestForm.hidden = this.mode !== 'request';
        let remaining = Math.max(0, Math.ceil(Number(seconds) || 0));

        const render = () => {
            const minutes = Math.floor(remaining / 60);
            const secs = remaining % 60;
            const time = `${minutes}:${String(secs).padStart(2, '0')}`;
            this.setStatus('error', `Access Blocked - ${time}`, 'lock-keyhole');
            if (remaining <= 0) {
                this.stopBlockCountdown();
                this.blocked = false;
                this.refreshStatus();
                return;
            }
            remaining -= 1;
        };

        render();
        this.blockTimer = setInterval(render, 1000);
        this.updateControls();
        if (reason) this.authStatus.title = String(reason);
    },

    stopBlockCountdown() {
        if (this.blockTimer) clearInterval(this.blockTimer);
        this.blockTimer = null;
        this.authStatus.title = '';
    },

    async enterWorkspace() {
        this.stopApprovalPolling();
        this.pending = false;
        this.setBusy(true);
        this.setStatus('success', 'Access Granted', 'circle-check');
        try {
            const bridge = await this.waitForDesktopBridge();
            if (bridge?.enter_workspace) {
                await bridge.enter_workspace();
            }
        } catch (error) {
            console.warn('Desktop window resize was unavailable:', error);
        }
        window.location.replace('index.html');
    },

    async waitForDesktopBridge(timeoutMs = 900) {
        if (window.pywebview?.api) return window.pywebview.api;
        return new Promise(resolve => {
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            window.addEventListener('pywebviewready', () => finish(window.pywebview?.api || null), { once: true });
            setTimeout(() => finish(window.pywebview?.api || null), timeoutMs);
        });
    },

    togglePasswordVisibility() {
        const reveal = this.passwordInput.type === 'password';
        this.passwordInput.type = reveal ? 'text' : 'password';
        this.passwordVisibilityButton.title = reveal ? 'Hide Password' : 'Show Password';
        this.passwordVisibilityButton.setAttribute('aria-label', this.passwordVisibilityButton.title);
        this.passwordVisibilityButton.innerHTML = `<i data-lucide="${reveal ? 'eye-off' : 'eye'}"></i>`;
        this.renderIcons();
        this.passwordInput.focus();
    },

    async copyMachineId() {
        if (!this.machineId) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(this.machineId);
            } else {
                const input = document.createElement('textarea');
                input.value = this.machineId;
                input.style.position = 'fixed';
                input.style.opacity = '0';
                document.body.appendChild(input);
                input.select();
                const copied = document.execCommand('copy');
                input.remove();
                if (!copied) throw new Error('Copy failed');
            }
            this.setStatus('success', 'Machine ID Copied', 'copy-check');
        } catch (error) {
            this.setStatus('error', 'Copy Failed', 'circle-alert');
        }
    },

    setBusy(busy) {
        this.busy = busy;
        this.updateControls();
    },

    updateControls() {
        const disabled = this.busy || this.pending || this.blocked || !this.authReady;
        this.passwordTab.disabled = disabled;
        this.requestTab.disabled = disabled;
        this.passwordInput.disabled = disabled;
        this.deviceNameInput.disabled = disabled;
        this.unlockButton.disabled = disabled;
        this.requestAccessButton.disabled = disabled;
        this.passwordVisibilityButton.disabled = disabled;
        this.retryConnectionButton.hidden = this.authReady || this.busy || this.blocked;
    },

    setConnection(state, text) {
        this.connectionDot.dataset.state = state;
        this.connectionText.textContent = text;
    },

    setStatus(state, text, icon) {
        this.authStatus.dataset.state = state;
        this.authStatusText.textContent = text;
        this.authStatusIcon.innerHTML = `<i data-lucide="${icon || 'circle'}"></i>`;
        this.renderIcons();
    },

    clearStatus() {
        this.setStatus('idle', '', 'circle');
    }
};

document.addEventListener('DOMContentLoaded', () => window.AstaLogin.init());
