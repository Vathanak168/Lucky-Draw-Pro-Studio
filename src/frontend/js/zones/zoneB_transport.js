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
        const currentCategory = S.roundConfigs[S.currentRound]?.category || `Round #${S.currentRound + 1}`;
        const currentSpeed = S.displaySettings.drawSpeed || 'normal';
        const projector = Studio.getProjectorUiState();
        const projectorTitle = projector.selectedDisplay
            ? projector.selectedDisplay.label
            : (projector.native ? 'External Display Not Found' : 'Desktop App Output');
        const projectorOptions = projector.externalDisplays.length
            ? projector.externalDisplays.map(display => `
                <button type="button" class="${display.id === projector.selectedDisplay?.id ? 'selected' : ''}" onclick="Studio.selectProjectorDisplay('${Studio.escapeHtml(display.id)}')">
                    <i data-lucide="monitor"></i>
                    <span>${Studio.escapeHtml(display.label)}</span>
                    ${display.id === projector.selectedDisplay?.id ? '<i data-lucide="check"></i>' : ''}
                </button>
            `).join('')
            : '<div class="projector-output-empty">No External Display</div>';

        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <div class="asta-app-brand" aria-label="Asta Studio">
                    <img class="asta-app-brand-mark" src="assets/asta-mark.svg" alt="">
                    <span class="asta-app-brand-name">Asta Studio</span>
                </div>

                <!-- Microsoft Word File & Save Controls -->
                <div style="display:flex; align-items:center; gap:6px; min-width:0;">
                    <button class="btn-arena" onclick="Studio.openProjectManager('recent')" style="background:#222; border-color:var(--accent-cyan); color:var(--accent-cyan); font-weight:800; padding:4px 10px;">
                        <i data-lucide="folder"></i> File
                    </button>
                    <button class="btn-arena" onclick="Studio.quickSaveProject()" title="Save Project (Ctrl+S)" style="background:#1f2937; border-color:#374151; color:#fff; font-weight:700; padding:4px 10px;">
                        <i data-lucide="save"></i> Save
                    </button>
                    <span style="font-size:12px; font-weight:700; color:#fff; margin-left:4px; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${S.currentProjectName || 'Untitled Project'}
                    </span>
                    <span id="topBarSaveStatusBadge" class="save-status-badge" style="${S.isDirty ? 'background:rgba(245, 158, 11, 0.2); color:var(--warning-color);' : 'background:rgba(16, 185, 129, 0.15); color:var(--success-color);'}">
                        ${S.isDirty ? 'Unsaved' : 'Saved'}
                    </span>
                </div>

                <!-- Timing / Speed Knob -->
                <div style="display:flex; align-items:center; gap:6px; background:var(--bg-panel); padding:4px 8px; border-radius:var(--radius-sm); border:1px solid var(--border-light);">
                    <i data-lucide="gauge" style="color:var(--accent-blue);"></i>
                    <span style="font-size:11px; color:var(--text-secondary);">Speed</span>
                    <select onchange="ZoneB.setSpeed(this.value)" style="width:80px; padding:2px 4px; font-size:11px; background:var(--bg-elevated); border:1px solid #3c3c3c; color:#fff;">
                        <option value="fast" ${currentSpeed === 'fast' ? 'selected' : ''}>Fast</option>
                        <option value="normal" ${currentSpeed === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="suspense" ${currentSpeed === 'suspense' ? 'selected' : ''}>Slow</option>
                    </select>
                </div>

                <div style="display:flex; align-items:center; gap:6px; min-width:0;">
                    <span style="font-size:11px; color:var(--text-secondary);">Round</span>
                    <span style="display:block; min-width:0; max-width:112px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:var(--font-mono); color:#fff; background:#111; padding:3px 8px; border-radius:3px; border:1px solid #333;">
                        #${S.currentRound + 1} &middot; ${currentCategory}
                    </span>
                </div>
            </div>

            <!-- Main Transport Center Console -->
            <div style="display:flex; align-items:center; gap:10px;">
                ${isDrawing ? `
                    <button class="btn-arena" style="padding:8px 24px; font-size:13px; background:var(--accent-blue); color:#fff; border-color:var(--accent-blue);" disabled>
                        <i data-lucide="loader-circle"></i>
                        Drawing
                    </button>
                ` : !hasWinners ? `
                    <button class="btn-arena btn-arena-primary btn-draw-primary" onclick="Draw.startDraw()" style="padding:8px 30px; font-size:13px; letter-spacing:1px; box-shadow:var(--shadow-glow);">
                        <i data-lucide="play"></i>
                        Draw
                    </button>
                ` : `
                    <button class="btn-arena btn-arena-primary" onclick="Display.nextRound()" style="padding:8px 24px; font-size:13px;">
                        <i data-lucide="skip-forward"></i>
                        Next Round
                    </button>
                    <button class="btn-arena" onclick="ZoneB.reDrawEntireColumn()" style="padding:8px 14px;">
                        <i data-lucide="rotate-ccw"></i>
                        Redraw Round
                    </button>
                `}
            </div>

            <!-- Right Controls: Pop-Out, Reports, Hotkeys -->
            <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn-arena" onclick="Studio.openHotkeysHelp()" title="Shortcuts">
                    <i data-lucide="keyboard"></i>
                    Shortcuts
                </button>
                <div class="projector-output-wrap">
                    <div class="projector-split-control" data-active="${!!projector.active}">
                        <button class="btn-arena projector-output-toggle" onclick="Studio.toggleProjectorOutput()" title="${Studio.escapeHtml(projectorTitle)}" ${Studio.projectorBusy ? 'disabled' : ''}>
                            <span class="projector-live-dot"></span>
                            <i data-lucide="airplay"></i>
                            <span>${projector.active ? 'On Air' : 'Projector'}</span>
                        </button>
                        <button class="btn-arena projector-output-menu-trigger" onclick="Studio.toggleProjectorMenu(event)" title="Output Display" aria-label="Output Display" ${Studio.projectorBusy ? 'disabled' : ''}>
                            <i data-lucide="chevron-down"></i>
                        </button>
                    </div>
                    ${Studio.projectorMenuOpen ? `<div class="projector-output-menu">${projectorOptions}</div>` : ''}
                </div>
                <button class="btn-arena" onclick="Studio.showReport()">
                    <i data-lucide="history"></i>
                    Draw History
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
        if (!confirm(`Redraw Round #${S.currentRound + 1}? ${(S.roundResults[S.currentRound]?.winners || []).length} winner(s) will be replaced.`)) return;

        const rc = S.roundConfigs[S.currentRound] || S.getDefaultRoundConfig(S.currentRound);
        S.syncSettingsFromConfigs();

        const roundResult = S.roundResults[S.currentRound];
        const previousWinners = roundResult && Array.isArray(roundResult.winners) ? [...roundResult.winners] : [];
        if (roundResult && roundResult.winners) {
            // Return to pool if duplicates disabled
            if (!S.settings.allowDuplicates) {
                const currentDataSource = rc.dataSource || roundResult.type || S.settings.roundDataSources[S.currentRound] || 'numeric';
                let currentPool = (currentDataSource === 'list') ? S.drawListPool : ((currentDataSource === 'id') ? S.drawIdPool : S.drawNumericPool);
                let currentMasterPool = (currentDataSource === 'list') ? S.masterListPool : ((currentDataSource === 'id') ? S.masterIdPool : S.masterNumericPool);
                roundResult.winners.forEach(w => {
                    if (w && w.id) {
                        const masterObj = currentMasterPool.find(p => p.id === w.id);
                        if (masterObj && currentPool) currentPool.push(masterObj);
                        const allIdx = S.allWinners.findIndex(aw => aw.id === w.id);
                        if (allIdx !== -1) S.allWinners.splice(allIdx, 1);
                    }
                });
            }
        }

        S.roundResults[S.currentRound] = null;
        S.drawCompletedThisRound = false;
        if (typeof Draw !== 'undefined' && typeof Draw.initializePoolsSilently === 'function') {
            Draw.initializePoolsSilently();
        }
        Display.resetDisplayForNewRound();
        Draw.startDraw({ historyType: 'redraw_round', previousWinners });
    }
};
