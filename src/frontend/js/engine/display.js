/**
 * display.js - Display Rendering inside 1920x1080 Virtual Canvas
 * Guarantees identical 1-to-1 video player scaling for Mini Screen and Full Screen Projector.
 */
window.Display = {
    ensureVirtualStageStructure() {
        const stageScreen = document.getElementById('stageOutputScreen');
        if (!stageScreen) return null;

        let virtualCanvas = document.getElementById('virtualCanvas');
        if (!virtualCanvas) {
            stageScreen.classList.add('stage-viewport');
            stageScreen.innerHTML = `
                <div class="virtual-canvas-shell">
                    <div id="virtualCanvas" class="virtual-canvas">
                        <div class="virtual-stage-bg" id="virtualStageBg"></div>
                        <div class="virtual-winner-grid" id="virtualWinnerGrid"></div>
                    </div>
                </div>
            `;
            const shell = stageScreen.querySelector('.virtual-canvas-shell');
            if (window.VirtualStageFitter) {
                VirtualStageFitter.attach(stageScreen, shell);
            }
            virtualCanvas = document.getElementById('virtualCanvas');
        }
        return virtualCanvas;
    },

    renderGridMode(winners, rc) {
        this.ensureVirtualStageStructure();
        const gridEl = document.getElementById('virtualWinnerGrid');
        if (!gridEl) return;

        const count = winners.length || 1;
        const layout = window.VirtualStageFitter ? VirtualStageFitter.calculateLayout(count) : { columns: 2, gap: 32, cardWidth: 600, cardHeight: 280, fontSize: 100, labelSize: 28 };

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
        winners.forEach((w, i) => {
            const isPlaceholder = !w || w.name === '???' || w.name === '' || w.type === 'dummy';
            const displayText = (w && w.name !== '???' && w.type !== 'dummy') ? w.name : '';
            html += `
                <div class="virtual-winner-card ${isPlaceholder ? '' : 'completed'}" id="item-${i}" style="min-height:${layout.cardHeight}px; width:${layout.cardWidth}px;">
                    <span class="virtual-winner-value" style="font-size:${layout.fontSize}px; font-family:var(--font-display, 'Chakra Petch', 'Koulen', 'JetBrains Mono', monospace); font-weight:900;">
                        ${displayText}
                    </span>
                </div>
            `;
        });

        gridEl.innerHTML = html;
        this.syncToProjectorMirror();
    },

    renderWideMode(winners, rc) {
        this.renderGridMode(winners, rc);
    },

    renderVerticalMode(winners, rc) {
        this.renderGridMode(winners, rc);
    },

    renderMultiColMode(winners, rc) {
        this.renderGridMode(winners, rc);
    },

    renderSimpleGridMode(winners, rc) {
        this.renderGridMode(winners, rc);
    },

    renderPlaceholder(rc) {
        this.resetDisplayForNewRound();
    },

    resetDisplayForNewRound() {
        const S = EngineState;
        const rc = S.roundConfigs[S.currentRound] || S.getDefaultRoundConfig(S.currentRound);
        const count = rc.winnerCount || 1;
        const placeholders = Array.from({ length: count }, (_, i) => ({ id: `dummy_${i}`, name: '', type: 'dummy' }));
        this.renderGridMode(placeholders, rc);
    },

    showWinnersInstantly(winners) {
        const S = EngineState;
        const rc = S.roundConfigs[S.currentRound] || S.getDefaultRoundConfig(S.currentRound);
        this.renderGridMode(winners, rc);

        setTimeout(() => {
            winners.forEach((w, i) => {
                const el = document.getElementById(`item-${i}`);
                if (el) {
                    el.classList.add('completed');
                    if (S.settings.winnerGlowEnabled) el.classList.add('has-glow');
                }
            });
            this.syncToProjectorMirror();
        }, 50);
    },

    syncToProjectorMirror() {
        try {
            const virtualCanvas = document.getElementById('virtualCanvas');
            if (virtualCanvas) {
                localStorage.setItem('vj_stage_mirror_html', virtualCanvas.innerHTML);
                localStorage.setItem('vj_stage_mirror_time', Date.now().toString());
            }
        } catch (e) {}
    },

    finalizeDraw(winners) {
        const S = EngineState;
        S.isDrawing = false;
        S.drawCompletedThisRound = true;
        S.saveDrawState();

        if (window.AudioSynth) AudioSynth.playFanfare();

        this.showWinnersInstantly(winners);

        if (window.ZoneA) ZoneA.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneD) ZoneD.render();
        if (window.ZoneE) ZoneE.render();
    },

    nextRound() {
        const S = EngineState;
        if (S.currentRound < S.totalRounds - 1) {
            S.currentRound++;
            S.drawCompletedThisRound = false;
            this.resetDisplayForNewRound();
            S.saveDrawState();

            if (window.ZoneA) ZoneA.selectSlot(S.currentRound);
            else if (window.ZoneB) ZoneB.render();
        } else {
            alert('All rounds completed! Check the Draw Reports tab to export Excel.');
        }
    }
};
