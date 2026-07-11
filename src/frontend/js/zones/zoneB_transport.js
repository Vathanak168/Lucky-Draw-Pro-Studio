/**
 * zoneB_transport.js - Middle Strip: Master Transport & Beat Bar
 * Resolume Arena 7 exact transport controls: Speed knob, Launch Draw, Next Column, Re-Draw, Projector, and Reports.
 */
window.ZoneB = {
    init() {
        this.render();
    },

    render() {
        const S = EngineState;
        const el = document.getElementById('zoneB_transportBar');
        if (!el) return;

        const isDrawing = S.isDrawing;
        const roundResult = S.roundResults[S.currentRound];
        const hasWinners = !!roundResult;
        const currentCategory = S.roundConfigs[S.currentRound]?.category || `Column #${S.currentRound + 1}`;
        const currentSpeed = S.displaySettings.drawSpeed || 'normal';

        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:16px;">
                <!-- Timing / Speed Knob -->
                <div style="display:flex; align-items:center; gap:8px; background:var(--bg-panel); padding:4px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-light);">
                    <svg class="svg-icon" style="color:var(--accent-cyan);" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span style="font-size:10px; font-weight:800; color:var(--text-secondary); text-transform:uppercase;">SPEED:</span>
                    <select onchange="ZoneB.setSpeed(this.value)" style="width:110px; padding:2px 6px; font-size:11px; background:var(--bg-elevated); border:1px solid #3c3c3c; color:#fff;">
                        <option value="fast" ${currentSpeed === 'fast' ? 'selected' : ''}>⚡ Fast (1s)</option>
                        <option value="normal" ${currentSpeed === 'normal' ? 'selected' : ''}>⏱️ Normal (3s)</option>
                        <option value="suspense" ${currentSpeed === 'suspense' ? 'selected' : ''}>🔥 Suspense (6s)</option>
                    </select>
                </div>

                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:11px; color:var(--text-secondary);">ACTIVE COLUMN:</span>
                    <span style="font-family:var(--font-mono); font-weight:800; color:#fff; background:#111; padding:3px 8px; border-radius:3px; border:1px solid #333;">
                        #${S.currentRound + 1} · ${currentCategory}
                    </span>
                </div>
            </div>

            <!-- Main Transport Center Console -->
            <div style="display:flex; align-items:center; gap:10px;">
                ${isDrawing ? `
                    <button class="btn-arena" style="padding:8px 24px; font-size:13px; font-weight:800; background:var(--accent-blue); color:#fff; border-color:var(--accent-blue);" disabled>
                        <svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M10 15V9l5 3-5 3z"/></svg>
                        DRAWING ON STAGE...
                    </button>
                ` : !hasWinners ? `
                    <button class="btn-arena btn-arena-primary" onclick="Draw.startDraw()" title="Press Spacebar to Launch" style="padding:8px 30px; font-size:13px; letter-spacing:1px; box-shadow:var(--shadow-glow);">
                        <svg class="svg-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        LAUNCH DRAW (SPACEBAR)
                    </button>
                ` : `
                    <button class="btn-arena btn-arena-primary" onclick="Display.nextRound()" title="Proceed to Next Column" style="padding:8px 24px; font-size:13px;">
                        <svg class="svg-icon" viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                        NEXT COLUMN
                    </button>
                    <button class="btn-arena" onclick="ZoneB.reDrawEntireColumn()" title="Clear and re-spin this column" style="padding:8px 14px;">
                        <svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        RE-SPIN COLUMN
                    </button>
                `}
            </div>

            <!-- Right Controls: Pop-Out, Reports -->
            <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn-arena" onclick="Studio.openProjector()" title="Open Stage Screen for LED/Projector">
                    <svg class="svg-icon" viewBox="0 0 24 24"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                    PROJECTOR POP-OUT
                </button>
                <button class="btn-arena" onclick="Studio.showReport()" title="View Winners Report & Export Excel">
                    <svg class="svg-icon" style="color:var(--accent-cyan);" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    RECORD / REPORTS
                </button>
            </div>
        `;
    },

    setSpeed(speedValue) {
        EngineState.displaySettings.drawSpeed = speedValue;
        EngineState.autoSaveAllSettings();
        this.render();
    },

    reDrawEntireColumn() {
        const S = EngineState;
        if (!confirm(`Are you sure you want to clear all winners for Column #${S.currentRound + 1} and re-spin the entire slot?`)) return;

        const roundResult = S.roundResults[S.currentRound];
        if (roundResult && roundResult.winners) {
            // Return to pool if duplicates disabled
            if (!S.settings.allowDuplicates) {
                const currentDataSource = S.settings.roundDataSources[S.currentRound];
                let currentPool = (currentDataSource === 'list') ? S.drawListPool : S.drawNumericPool;
                let currentMasterPool = (currentDataSource === 'list') ? S.masterListPool : S.masterNumericPool;
                roundResult.winners.forEach(w => {
                    if (w && w.id) {
                        const masterObj = currentMasterPool.find(p => p.id === w.id);
                        if (masterObj) currentPool.push(masterObj);
                        const allIdx = S.allWinners.findIndex(aw => aw.id === w.id);
                        if (allIdx !== -1) S.allWinners.splice(allIdx, 1);
                    }
                });
            }
        }

        S.roundResults[S.currentRound] = null;
        S.drawCompletedThisRound = false;
        Display.resetDisplayForNewRound();
        Draw.startDraw();
    }
};
