// src/frontend/projector/projector.js
class StageProjectorSync {
    constructor() {
        this.viewportEl = null;
        this.shellEl = null;
        this.canvasEl = null;
        this.lastWinnerId = null;
        this.isCurrentlyDrawing = false;
        this.socket = null;
        this.reconnectTimer = null;
    }

    init() {
        this.viewportEl = document.getElementById("stageOutputScreen");
        this.shellEl = document.querySelector(".virtual-canvas-shell");
        this.canvasEl = document.getElementById("virtualCanvas");

        if (window.VirtualStageFitter && this.viewportEl && this.shellEl) {
            VirtualStageFitter.attach(this.viewportEl, this.shellEl);
        }

        this.connect();
        console.log("Projector 1920x1080 localhost sync active.");
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.socket = new WebSocket(`${protocol}//${window.location.host}/api/desktop/projector/ws`);
        this.socket.onmessage = event => {
            try { this.applyMessage(JSON.parse(event.data)); } catch (error) {
                console.error('Invalid projector message:', error);
            }
        };
        this.socket.onclose = () => {
            if (this.reconnectTimer) return;
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect();
            }, 1000);
        };
        this.socket.onerror = () => {
            try { this.socket.close(); } catch (e) {}
        };
    }

    applyMessage(message) {
        if (!message || !this.canvasEl) return;
        if (message.type === 'mirror_update' && typeof message.html === 'string') {
            if (message.html !== this.canvasEl.innerHTML) this.canvasEl.innerHTML = message.html;
        } else if (message.type === 'ticker_update') {
            const tickerEl = document.querySelector('.ticker-text');
            if (tickerEl) tickerEl.textContent = message.text || '';
        } else if (message.type === 'draw_status') {
            this.isCurrentlyDrawing = !!message.isDrawing;
        }
    }

    renderReady(slot) {
        const gridEl = this.canvasEl.querySelector("#virtualWinnerGrid") || this.canvasEl;
        gridEl.style.display = 'flex';
        gridEl.style.flexDirection = 'column';
        gridEl.style.alignItems = 'center';
        gridEl.style.justifyContent = 'center';
        gridEl.style.gap = '24px';

        gridEl.innerHTML = `
            <div style="background: rgba(20,20,24,0.95); border: 4px solid var(--accent-cyan, #00e5a3); border-radius: 32px; padding: 60px 100px; text-align: center; box-shadow: 0 0 60px rgba(0,229,163,0.3);">
                <div style="font-size: 32px; font-weight: 800; color: var(--accent-cyan, #00e5a3); letter-spacing: 6px; text-transform: uppercase; margin-bottom: 16px;">
                    READY
                </div>
                <div style="font-size: 72px; font-weight: 900; color: #fff; line-height: 1.1; margin-bottom: 24px;">
                    ${slot.title}
                </div>
            </div>
        `;
    }

    renderDrawing(slot, tickerText) {
        const gridEl = this.canvasEl.querySelector("#virtualWinnerGrid") || this.canvasEl;
        gridEl.style.display = 'flex';
        gridEl.style.flexDirection = 'column';
        gridEl.style.alignItems = 'center';
        gridEl.style.justifyContent = 'center';
        gridEl.style.gap = '24px';

        gridEl.innerHTML = `
            <div style="background: rgba(20,20,24,0.95); border: 4px solid #00b4d8; border-radius: 32px; padding: 60px 100px; text-align: center; box-shadow: 0 0 60px rgba(0,180,216,0.3);">
                <div style="font-size: 32px; font-weight: 800; color: #00b4d8; letter-spacing: 6px; text-transform: uppercase; margin-bottom: 16px;">
                    SPINNING...
                </div>
                <div style="font-size: 64px; font-weight: 900; color: #fff; line-height: 1.1; margin-bottom: 28px;">
                    ${slot.title}
                </div>
                <div class="ticker-text" style="font-size: 110px; font-weight: 900; color: #00ffcc; font-family: var(--font-mono, monospace); letter-spacing: 4px;">
                    ${tickerText}
                </div>
            </div>
        `;
    }

    renderStageWinners(roundTitle, winners) {
        const count = winners.length || 1;
        const layout = window.VirtualStageFitter ? VirtualStageFitter.calculateLayout(count) : { columns: 2, gap: 36, cardWidth: 700, cardHeight: 280, fontSize: 110, labelSize: 30 };

        const gridEl = this.canvasEl.querySelector("#virtualWinnerGrid") || this.canvasEl;
        const totalRowWidth = layout.columns * layout.cardWidth + (layout.columns - 1) * layout.gap;
        gridEl.style.display = 'flex';
        gridEl.style.flexDirection = 'row';
        gridEl.style.flexWrap = 'wrap';
        gridEl.style.justifyContent = 'center';
        gridEl.style.alignContent = 'center';
        gridEl.style.gap = `${layout.gap}px`;
        gridEl.style.width = `${Math.min(1860, totalRowWidth)}px`;
        gridEl.style.margin = '0 auto';

        let html = '';
        winners.forEach((w, idx) => {
            const isPlaceholder = !w || w.name === '???' || w.name === '' || w.type === 'dummy';
            const displayText = (w && w.name !== '???' && w.type !== 'dummy') ? w.name : '';
            
            let cardFontSize = layout.fontSize;
            if (displayText && displayText.length > 0) {
                const usableWidth = Math.max(200, (layout.cardWidth || 600) - 48);
                if (displayText.length <= 11) {
                    const max1Line = Math.floor(usableWidth / (displayText.length * 0.54));
                    cardFontSize = Math.min(layout.fontSize, Math.max(36, max1Line));
                } else {
                    const max2Lines = Math.floor((usableWidth * 1.8) / (displayText.length * 0.52));
                    const maxByHeight = Math.floor((layout.cardHeight || 280) * 0.42);
                    cardFontSize = Math.min(layout.fontSize, Math.min(maxByHeight, Math.max(28, max2Lines)));
                }
            }

            html += `
                <div class="virtual-winner-card ${isPlaceholder ? '' : 'completed has-glow'}" style="min-height:${layout.cardHeight}px; width:${layout.cardWidth}px;">
                    <span class="virtual-winner-value" style="font-size:${cardFontSize}px; font-family:var(--font-mono, 'JetBrains Mono', monospace); font-weight:900;">
                        ${displayText}
                    </span>
                </div>
            `;
        });

        gridEl.innerHTML = html;
    }

    triggerConfettiBurst() {
        // Disabled per user request (no fireworks/confetti)
    }
}

window.addEventListener("DOMContentLoaded", () => {
    window.ProjectorSync = new StageProjectorSync();
    window.ProjectorSync.init();
});
