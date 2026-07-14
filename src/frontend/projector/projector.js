class StageProjectorSync {
    constructor() {
        this.viewportEl = null;
        this.shellEl = null;
        this.canvasEl = null;
        this.socket = null;
        this.reconnectTimer = null;
    }

    init() {
        this.viewportEl = document.getElementById('stageOutputScreen');
        this.shellEl = document.querySelector('.virtual-canvas-shell');
        this.canvasEl = document.getElementById('virtualCanvas');
        if (window.VirtualStageFitter && this.viewportEl && this.shellEl) {
            VirtualStageFitter.attach(this.viewportEl, this.shellEl);
        }
        this.connect();
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.socket = new WebSocket(`${protocol}//${window.location.host}/api/desktop/projector/ws`);
        this.socket.onmessage = event => {
            try {
                this.applyMessage(JSON.parse(event.data));
            } catch (error) {
                console.error('Invalid projector message:', error);
            }
        };
        this.socket.onclose = () => this.scheduleReconnect();
        this.socket.onerror = () => {
            try { this.socket.close(); } catch (error) {}
        };
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 1000);
    }

    applyMessage(message) {
        if (!message || !this.canvasEl) return;
        if (message.type === 'mirror_update' && typeof message.html === 'string') {
            if (message.html !== this.canvasEl.innerHTML) this.canvasEl.innerHTML = message.html;
            return;
        }
        if (message.type === 'ticker_update') {
            const tickerEl = this.canvasEl.querySelector('.ticker-text');
            if (tickerEl) tickerEl.textContent = message.text || '';
            return;
        }
        if (message.type === 'draw_status') {
            document.body.dataset.drawing = message.isDrawing ? 'true' : 'false';
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.ProjectorSync = new StageProjectorSync();
    window.ProjectorSync.init();
});
