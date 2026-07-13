// src/frontend/js/auth/gatekeeper.js
class GatekeeperUI {
    constructor() {
        this.overlay = null;
        this.pollingInterval = null;
        this.syncInterval = null;
        this.blockCountdown = null;
    }

    async init() {
        this.overlay = document.getElementById("gatekeeperOverlay");
        if (!this.overlay) return;
        if (!window.StudioAPI) {
            this.lockConsole();
            const alertBox = document.getElementById("ownerAlertBox");
            if (alertBox) {
                alertBox.className = "status-alert error";
                alertBox.textContent = "Authentication service failed to load.";
            }
            return;
        }
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
            if (status.blocked) {
                this.showBlockedLockdown(status.blocked_remaining, status.block_reason);
                return;
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

        if (!pwdInput.value) {
            alertBox.className = "status-alert error";
            alertBox.textContent = "Enter the master password.";
            pwdInput.focus();
            return;
        }
        
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
            if (err.message && err.message.includes("BLOCKED")) {
                this.showBlockedLockdown(900, err.message);
            }
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
            if (res.blocked) {
                alertBox.className = "status-alert error";
                alertBox.textContent = res.message;
                this.showBlockedLockdown(900, res.message);
                return;
            }

            if (res.status === "SENT_SIMULATION" || res.status === "ERROR") {
                alertBox.className = res.status === "ERROR" ? "status-alert error" : "status-alert info";
                alertBox.textContent = res.message || "Remote approval is not configured.";
                reqBtn.disabled = false;
                return;
            }
            
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
                if (check.details && check.details.blocked) {
                    clearInterval(this.pollingInterval);
                    alertBox.className = "status-alert error";
                    alertBox.textContent = check.details.message;
                    this.showBlockedLockdown(check.details.duration || 900, check.details.message);
                    return;
                }
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
        if (this.blockCountdown) clearInterval(this.blockCountdown);
        if (this.overlay) {
            this.overlay.classList.add("hidden");
            this.overlay.setAttribute("aria-hidden", "true");
        }
        if (window.VJConsole && window.VJConsole.init) {
            window.VJConsole.init();
        }
    }

    lockConsole() {
        if (this.overlay) {
            this.overlay.classList.remove("hidden");
            this.overlay.setAttribute("aria-hidden", "false");
        }
    }

    showBlockedLockdown(remainingSeconds = 900, reason = "Repeated requests spammed") {
        this.lockConsole();
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        if (this.blockCountdown) clearInterval(this.blockCountdown);

        const alertBoxes = document.querySelectorAll(".status-alert");
        const reqBtn = document.getElementById("reqRemoteBtn");
        const pwdInput = document.getElementById("masterPwdInput");
        if (reqBtn) reqBtn.disabled = true;
        if (pwdInput) pwdInput.disabled = true;

        let rem = remainingSeconds;
        const updateText = () => {
            const mins = Math.floor(rem / 60);
            const secs = rem % 60;
            alertBoxes.forEach(box => {
                box.className = "status-alert error";
                box.style.border = "2px solid #ef4444";
                box.style.background = "#220000";
                box.style.color = "#ff6b6b";
                box.style.fontWeight = "bold";
                box.innerHTML = `⛔ APPLICATION BLOCKED BY ADMIN/SUPER ADMIN<br><span style="font-size:12px; font-weight:normal;">Reason: ${reason}</span><br>⏱️ Unlocks in: ${mins}m ${secs}s`;
            });
            if (rem <= 0) {
                clearInterval(this.blockCountdown);
                if (reqBtn) reqBtn.disabled = false;
                if (pwdInput) pwdInput.disabled = false;
                alertBoxes.forEach(box => {
                    box.className = "status-alert info";
                    box.style.border = "";
                    box.style.background = "";
                    box.style.color = "";
                    box.textContent = "Block expired. You may try again.";
                });
            }
            rem--;
        };
        updateText();
        this.blockCountdown = setInterval(updateText, 1000);
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
