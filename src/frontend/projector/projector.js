// src/frontend/projector/projector.js
class StageProjectorSync {
    constructor() {
        this.viewportEl = null;
        this.shellEl = null;
        this.canvasEl = null;
        this.lastWinnerId = null;
        this.isCurrentlyDrawing = false;
        this.lastMirrorTime = '';
    }

    init() {
        this.viewportEl = document.getElementById("stageOutputScreen");
        this.shellEl = document.querySelector(".virtual-canvas-shell");
        this.canvasEl = document.getElementById("virtualCanvas");

        if (window.VirtualStageFitter && this.viewportEl && this.shellEl) {
            VirtualStageFitter.attach(this.viewportEl, this.shellEl);
        }

        setInterval(() => this.syncFromStorage(), 120);
        window.addEventListener("storage", (e) => {
            if (["vj_stage_mirror_html", "vj_stage_mirror_time", "ldp_is_drawing", "ldp_last_winner", "luckyDrawState"].includes(e.key)) {
                this.syncFromStorage();
            }
        });
        console.log("Projector 1920x1080 Stage Sync Active!");
        this.syncFromStorage();
    }

    syncFromStorage() {
        if (!this.canvasEl) return;
        try {
            // 1. Direct HTML Mirroring from Display Engine (Fastest & 100% Identical to Mini Screen)
            const mirrorTime = localStorage.getItem("vj_stage_mirror_time") || '';
            const mirrorHtml = localStorage.getItem("vj_stage_mirror_html");
            if (mirrorHtml && mirrorTime !== this.lastMirrorTime) {
                this.lastMirrorTime = mirrorTime;
                this.canvasEl.innerHTML = mirrorHtml;
                return;
            }

            // 2. Fallback State Reconstruction
            const isDrawing = localStorage.getItem("ldp_is_drawing") === "true";
            const tickerText = localStorage.getItem("ldp_ticker_text") || "SPINNING...";
            const lastWinnerJson = localStorage.getItem("ldp_last_winner");
            const lastWinner = lastWinnerJson ? JSON.parse(lastWinnerJson) : null;

            let roundTitle = "Column #1";
            let prizeName = "Lucky Prize";
            let winners = [];

            const stateJson = localStorage.getItem("luckyDrawState");
            if (stateJson) {
                const stateData = JSON.parse(stateJson);
                const currentRound = stateData.currentRound || 0;
                if (stateData.roundResults && stateData.roundResults[currentRound]) {
                    winners = stateData.roundResults[currentRound].winners || [];
                }
                if (stateData.settings) {
                    roundTitle = stateData.settings.roundCategories?.[currentRound] || `Column #${currentRound + 1}`;
                    prizeName = `${roundTitle}`;
                }
            }

            if (isDrawing) {
                if (!this.isCurrentlyDrawing) {
                    this.isCurrentlyDrawing = true;
                    this.renderDrawing({ title: roundTitle, prize_name: prizeName }, tickerText);
                } else {
                    const tickerEl = document.querySelector(".ticker-text");
                    if (tickerEl) tickerEl.textContent = tickerText;
                }
            } else if (winners && winners.length > 0) {
                this.isCurrentlyDrawing = false;
                const topWinner = winners[0];
                if (topWinner && this.lastWinnerId !== topWinner.id) {
                    this.lastWinnerId = topWinner.id;
                }
                this.renderStageWinners(roundTitle, winners);
            } else if (lastWinner) {
                this.isCurrentlyDrawing = false;
                if (this.lastWinnerId !== lastWinner.id) {
                    this.lastWinnerId = lastWinner.id;
                }
                this.renderStageWinners(roundTitle, [lastWinner]);
            } else {
                this.isCurrentlyDrawing = false;
                this.renderReady({ title: roundTitle, prize_name: prizeName });
            }
        } catch (e) {}
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
                    ✨ READY FOR LAUNCH ✨
                </div>
                <div style="font-size: 72px; font-weight: 900; color: #fff; line-height: 1.1; margin-bottom: 24px;">
                    ${slot.title}
                </div>
                <div style="font-size: 36px; color: #ccc; font-family: var(--font-mono, monospace);">
                    [ AWAITING STAGE CREW LAUNCH ]
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
                    💫 DRAWING ON STAGE... 💫
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
        gridEl.style.display = 'grid';
        gridEl.style.gridTemplateColumns = `repeat(${layout.columns}, ${layout.cardWidth}px)`;
        gridEl.style.gap = `${layout.gap}px`;
        gridEl.style.justifyContent = 'center';
        gridEl.style.alignContent = 'center';

        let html = '';
        winners.forEach((w, idx) => {
            html += `
                <div class="virtual-winner-card completed has-glow" style="min-height:${layout.cardHeight}px; width:${layout.cardWidth}px;">
                    <span class="virtual-winner-value" style="font-size:${layout.fontSize}px; font-family:var(--font-mono, 'JetBrains Mono', monospace); font-weight:900;">
                        ${w ? w.name : '???'}
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
