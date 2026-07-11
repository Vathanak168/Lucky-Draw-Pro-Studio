/**
 * zoneC_monitors.js - Bottom Left: Dual Stage Monitors
 * Top: Output Monitor (Stage Live drawArea with animations).
 * Bottom: Preview Monitor (Live odds, pool stats, target column preview).
 */
window.ZoneC = {
    init() {
        this.render();
        this.applyBackground();
    },

    render() {
        const S = EngineState;
        const el = document.getElementById('zoneC_dualMonitors');
        if (!el) return;

        const rc = S.roundConfigs[S.currentRound] || S.getDefaultRoundConfig(S.currentRound);
        const category = rc.category || `Column #${S.currentRound + 1}`;
        const targetWinners = rc.winnerCount || 1;
        const dataSource = rc.dataSource || 'list';

        // Calculate pool stats for Preview Monitor
        let activePoolCount = 0;
        if (dataSource === 'list') {
            activePoolCount = S.drawListPool.length || S.getParticipantList().filter(p => !p.hidden).length;
        } else {
            const startNum = parseInt(S.displaySettings.startNumber) || 1;
            const endNum = parseInt(S.displaySettings.endNumber) || 1000;
            activePoolCount = Math.max(0, endNum - startNum + 1);
        }
        const oddsText = activePoolCount > 0 ? `1 in ${Math.round(activePoolCount / targetWinners)} (${((targetWinners / activePoolCount) * 100).toFixed(1)}%)` : 'N/A';

        // Check if drawArea already exists in DOM so we preserve active animation nodes during non-disruptive renders
        const existingDrawArea = document.getElementById('drawArea');
        const existingDrawAreaHTML = existingDrawArea ? existingDrawArea.innerHTML : `
            <div style="text-align:center;">
                <div style="font-size:11px; font-weight:800; color:var(--accent-cyan); letter-spacing:3px; text-transform:uppercase; margin-bottom:8px;">
                    ✨ READY FOR LAUNCH ✨
                </div>
                <div style="font-size:20px; font-weight:800; color:#fff;">
                    ${category}
                </div>
                <div style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
                    Target: ${targetWinners} ${targetWinners > 1 ? 'Winners' : 'Winner'}
                </div>
            </div>
        `;

        el.innerHTML = `
            <div class="dual-monitors-container">
                <!-- Top Box: Output Monitor (Stage Live) -->
                <div class="monitor-box" id="outputMonitorBox" style="flex:1.4;">
                    <div class="arena-panel-header">
                        <div class="arena-panel-title">
                            <svg class="svg-icon highlight" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                            OUTPUT MONITOR · <span class="highlight">STAGE LIVE</span>
                        </div>
                        <div style="display:flex; gap:4px;">
                            <button class="btn-arena" onclick="ZoneC.zoomManual(2)" title="Increase Font Zoom" style="padding:1px 6px; font-size:10px;">A+</button>
                            <button class="btn-arena" onclick="ZoneC.zoomManual(-2)" title="Decrease Font Zoom" style="padding:1px 6px; font-size:10px;">A−</button>
                        </div>
                    </div>
                    <div class="monitor-screen" id="stageOutputScreen">
                        <div id="drawArea" class="draw-area">${existingDrawAreaHTML}</div>
                    </div>
                </div>

                <!-- Bottom Box: Preview Monitor (Pool & Odds Stats) -->
                <div class="monitor-box" id="previewMonitorBox" style="flex:0.8; border-bottom:none;">
                    <div class="arena-panel-header">
                        <div class="arena-panel-title">
                            <svg class="svg-icon" style="color:var(--accent-blue);" viewBox="0 0 24 24"><path d="M2 12h20M2 12l4-4m-4 4 4 4"/></svg>
                            PREVIEW MONITOR · <span style="color:var(--accent-blue);">COLUMN STATS</span>
                        </div>
                    </div>
                    <div style="padding:12px; font-size:11px; display:flex; flex-direction:column; justify-content:center; gap:8px; background:var(--bg-panel); flex:1;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-light); padding-bottom:6px;">
                            <span style="color:var(--text-secondary);">Target Column:</span>
                            <span style="font-weight:700; color:#fff;">Column #${S.currentRound + 1} (${category})</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-light); padding-bottom:6px;">
                            <span style="color:var(--text-secondary);">Pool Source:</span>
                            <span style="font-weight:700; color:var(--accent-cyan);">
                                ${dataSource === 'numeric' ? '🔢 Numeric Range' : '👥 Name List'} (${activePoolCount} active)
                            </span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-light); padding-bottom:6px;">
                            <span style="color:var(--text-secondary);">Winner Odds:</span>
                            <span style="font-family:var(--font-mono); font-weight:700; color:var(--warning-color);">${oddsText}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:var(--text-secondary);">Animation Mode:</span>
                            <span style="font-weight:600; color:#ccc; text-transform:uppercase;">${rc.animationStyle} (${S.displaySettings.drawSpeed || 'normal'})</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.applyBackground();
    },

    zoomManual(delta) {
        const S = EngineState;
        const drawArea = document.getElementById('drawArea');
        if (!drawArea) return;

        const targetElements = drawArea.querySelectorAll('.winner-item, .number-display');
        if (targetElements.length === 0) return;

        targetElements.forEach(el => {
            const currentSize = parseFloat(window.getComputedStyle(el).fontSize) || 24;
            const newSize = Math.max(12, Math.min(100, currentSize + delta));
            el.style.fontSize = `${newSize}px`;
            S.manualFontSize = `${newSize}px`;
        });
    },

    applyBackground() {
        const S = EngineState;
        const screen = document.getElementById('stageOutputScreen');
        if (!screen) return;

        // Remove any old video element
        const oldVid = screen.querySelector('video');
        if (oldVid) oldVid.remove();

        if (S.displaySettings.bgType === 'video' && S.settings.bgVideo) {
            screen.style.backgroundImage = 'none';
            const vid = document.createElement('video');
            vid.src = S.settings.bgVideo;
            vid.autoplay = true;
            vid.loop = true;
            vid.muted = true;
            vid.setAttribute('playsinline', '');
            screen.insertBefore(vid, screen.firstChild);
        } else if (S.settings.bgImage && S.settings.bgImage !== 'none') {
            screen.style.backgroundImage = S.settings.bgImage;
        } else {
            screen.style.backgroundImage = 'radial-gradient(circle at 50% 50%, #1c1c1c 0%, #0a0a0a 80%)';
        }
    }
};
