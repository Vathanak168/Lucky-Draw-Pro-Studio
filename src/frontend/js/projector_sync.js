/** Localhost-only live transport between the controller and projector. */
window.ProjectorSync = {
    socket: null,
    reconnectTimer: null,
    pending: new Map(),

    init() {
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
        const url = window.AstaRuntime
            ? AstaRuntime.websocketUrl('/api/desktop/projector/ws')
            : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/desktop/projector/ws`;
        this.socket = new WebSocket(url);
        this.socket.onopen = () => {
            for (const payload of this.pending.values()) this.send(payload);
            this.pending.clear();
        };
        this.socket.onclose = () => this.scheduleReconnect();
        this.socket.onerror = () => {
            try { this.socket.close(); } catch (e) {}
        };
    },

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.init();
        }, 1000);
    },

    publish(payload) {
        if (!payload || !payload.type) return;
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.pending.set(payload.type, payload);
            this.init();
            return;
        }
        this.send(payload);
    },

    send(payload) {
        try { this.socket.send(JSON.stringify(payload)); } catch (e) {
            this.pending.set(payload.type, payload);
        }
    }
};

ProjectorSync.init();
