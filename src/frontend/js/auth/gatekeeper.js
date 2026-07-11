// src/frontend/js/auth/gatekeeper.js
class GatekeeperUI {
    constructor() {
        this.overlay = null;
        this.pollingInterval = null;
        this.syncInterval = null;
    }

    async init() {
        this.overlay = document.getElementById("gatekeeperOverlay");
        this.setupSuperAdminWifiSync();
        await this.checkInitialStatus();
    }

    async checkInitialStatus() {
        try {
            const status = await StudioAPI.getAuthStatus();
            if (status.machine_id) {
                const badge = document.getElementById("machineIdDisplay");
                if (badge) badge.textContent = `MACHINE ID: ${status.machine_id}`;
            }
            if (status.unlocked) {
                this.unlockConsole();
            } else {
                this.lockConsole();
            }
        } catch (e) {
            console.error("Failed to check auth status:", e);
            this.lockConsole();
        }
    }

    switchTab(tabName) {
        document.querySelectorAll(".auth-tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".auth-panel").forEach(p => p.classList.remove("active"));
        
        if (tabName === "owner") {
            document.getElementById("tabBtnOwner").classList.add("active");
            document.getElementById("panelOwner").classList.add("active");
        } else {
            document.getElementById("tabBtnStaff").classList.add("active");
            document.getElementById("panelStaff").classList.add("active");
        }
    }

    async handleMasterLogin() {
        const pwdInput = document.getElementById("masterPwdInput");
        const alertBox = document.getElementById("ownerAlertBox");
        
        try {
            alertBox.className = "status-alert info";
            alertBox.textContent = "Verifying Master Password...";
            const res = await StudioAPI.loginMasterPassword(pwdInput.value);
            if (res.unlocked) {
                alertBox.textContent = "Access Granted! Unlocking Console...";
                setTimeout(() => this.unlockConsole(), 600);
            }
        } catch (err) {
            alertBox.className = "status-alert error";
            alertBox.textContent = err.message || "Wrong Master Password.";
        }
    }

    async handleRemoteRequest() {
        const nameInput = document.getElementById("staffNameInput");
        const alertBox = document.getElementById("staffAlertBox");
        const reqBtn = document.getElementById("reqRemoteBtn");

        try {
            reqBtn.disabled = true;
            alertBox.className = "status-alert info";
            alertBox.textContent = "Sending Remote Request to Admin Gmail...";
            
            const res = await StudioAPI.requestRemoteGmailUnlock(nameInput.value || "Event Crew Laptop");
            
            alertBox.textContent = "Request Sent! Polling Admin approval via Gmail...";
            this.startPollingForApproval();
        } catch (err) {
            alertBox.className = "status-alert error";
            alertBox.textContent = "Failed to send request. Check network.";
            reqBtn.disabled = false;
        }
    }

    startPollingForApproval() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        const alertBox = document.getElementById("staffAlertBox");

        this.pollingInterval = setInterval(async () => {
            try {
                const check = await StudioAPI.checkRemoteGmailUnlock();
                if (check.unlocked || (check.details && check.details.approved)) {
                    clearInterval(this.pollingInterval);
                    alertBox.className = "status-alert info";
                    alertBox.textContent = "🔓 APPROVED BY ADMIN! Unlocking Console...";
                    setTimeout(() => this.unlockConsole(), 800);
                }
            } catch (e) {
                console.error("Polling error:", e);
            }
        }, 3000);
    }

    unlockConsole() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        if (this.overlay) {
            this.overlay.classList.add("hidden");
        }
        // Initialize Core VJ Console if available
        if (window.VJConsole && window.VJConsole.init) {
            window.VJConsole.init();
        }
    }

    lockConsole() {
        if (this.overlay) {
            this.overlay.classList.remove("hidden");
        }
    }

    setupSuperAdminWifiSync() {
        // Trigger instant sync immediately whenever laptop reconnects to Wi-Fi!
        window.addEventListener("online", async () => {
            console.log("🌐 [Wi-Fi Reconnected] Triggering instant Super Admin global password sync...");
            const res = await StudioAPI.syncSuperAdminPassword();
            if (res && res.updated) {
                console.log("⚡ Super Admin password updated remotely over Wi-Fi! Version:", res.version);
            }
        });

        // Periodic background Wi-Fi check every 15 seconds
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(async () => {
            if (navigator.onLine) {
                try {
                    const res = await StudioAPI.syncSuperAdminPassword();
                    if (res && res.updated) {
                        console.log("⚡ [Auto-Sync] Super Admin password updated over Wi-Fi! Version:", res.version);
                    }
                } catch (e) {}
            }
        }, 15000);
    }
}

window.Gatekeeper = new GatekeeperUI();
window.addEventListener("DOMContentLoaded", () => {
    window.Gatekeeper.init();
});
