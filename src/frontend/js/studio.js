/**
 * studio.js - Master Orchestrator & Controller
 * Connects all 5 Resolume Arena 7 zones to EngineState and DOM.
 */

window.AudioSynth = {
    playTick() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(850, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.04);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.04);
        } catch(e) {}
    },
    playFanfare() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
                gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.45);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.12);
                osc.stop(ctx.currentTime + i * 0.12 + 0.45);
            });
        } catch(e) {}
    },
    triggerConfetti() {
        if (window.confetti) {
            window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        }
    }
};

window.Studio = {
    init() {
        console.log("Initializing Resolume Arena 7 Workstation v6.0...");

        // 1. Load data from localStorage
        EngineState.loadParticipantsFromStorage();
        const loaded = EngineState.loadAllSavedData();
        if (!loaded) {
            EngineState.ensureRoundConfigs(1);
        }
        EngineState.syncSettingsFromConfigs();

        // 2. Init all 5 Resolume Arena zones
        if (window.ZoneA) ZoneA.init();
        if (window.ZoneB) ZoneB.init();
        if (window.ZoneC) ZoneC.init();
        if (window.ZoneD) ZoneD.init();
        if (window.ZoneE) ZoneE.init();

        // 3. Check for saved active draw state
        const hasSavedState = localStorage.getItem('luckyDrawState');
        if (hasSavedState && confirm('A previous draw session was found. Would you like to resume right where you left off?')) {
            Draw.initializeDisplayMode(false);
        }

        // 4. Keyboard Shortcuts (Spacebar / Enter triggers Launch or Next Column)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) return;
                e.preventDefault();
                if (!EngineState.isDrawing && !EngineState.drawCompletedThisRound) {
                    Draw.startDraw();
                } else if (EngineState.drawCompletedThisRound) {
                    Display.nextRound();
                }
            }
        });

        console.log("Resolume Arena 7 Workstation ready!");
    },

    openProjector() {
        const width = 1280;
        const height = 720;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        window.open(
            'projector/projector.html',
            'LuckyDrawProjector',
            `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
        );
    },

    showReport() {
        const modal = document.getElementById('reportModal');
        const body = document.getElementById('report-body');
        if (!modal || !body) return;

        const results = EngineState.roundResults;
        if (results.length === 0 || !results.some(r => r)) {
            body.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:24px;">No draw results yet. Launch a column draw to generate a live report.</p>';
        } else {
            let tableHTML = '<table class="winner-table"><thead><tr><th>Column</th><th>Category</th><th>Type</th><th>Winner Name / Number</th></tr></thead><tbody>';
            results.forEach((r, idx) => {
                if (!r) return;
                const roundType = r.type === 'list' ? '👥 Name' : '🔢 Number';
                const categoryName = r.category || '<i>Regular Draw</i>';
                r.winners.forEach((w, i) => {
                    const winnerName = w ? (w.name.replace(/</g, '&lt;').replace(/>/g, '&gt;')) : '<i>N/A</i>';
                    tableHTML += `
                        <tr>
                            <td>${i === 0 ? `Column #${r.round}` : ''}</td>
                            <td>${i === 0 ? categoryName : ''}</td>
                            <td>${roundType}</td>
                            <td style="font-weight:700; color:var(--accent-cyan);">${winnerName}</td>
                        </tr>
                    `;
                });
            });
            tableHTML += '</tbody></table>';
            body.innerHTML = tableHTML;
        }
        modal.style.display = 'flex';
    },

    closeReport() {
        const modal = document.getElementById('reportModal');
        if (modal) modal.style.display = 'none';
    },

    clearReport() {
        if (!confirm('Clear all report history and reset draw progress? This cannot be undone.')) return;
        EngineState.roundResults = [];
        EngineState.allWinners = [];
        if (EngineState.masterListPool.length > 0 || EngineState.masterNumericPool.length > 0) {
            EngineState.drawListPool = [...EngineState.masterListPool];
            EngineState.drawNumericPool = [...EngineState.masterNumericPool];
        }
        EngineState.clearDrawState();
        this.showReport();
        if (window.ZoneA) ZoneA.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneD) ZoneD.render();
        if (window.ZoneE) ZoneE.render();
    },

    printReport() {
        window.print();
    },

    exportReportToExcel() {
        const results = EngineState.roundResults.filter(r => r);
        if (results.length === 0) { alert('No report data to export.'); return; }

        const totalWinners = results.reduce((acc, r) => acc + (r.winners?.length || 0), 0);
        const reportDate = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'medium' });

        const summaryHTML = `
            <table style="width:100%;">
                <thead>
                    <tr><th colspan="2" style="background-color:#00e5a3; color:#000000; padding:10px; font-size:1.2em;">Resolume Arena 7 Workstation - Draw Report</th></tr>
                </thead>
                <tbody>
                    <tr><td style="padding:8px; border:1px solid #999; font-weight:bold;">Program Name</td><td style="padding:8px; border:1px solid #999;">Lucky Draw Pro Studio v6.0</td></tr>
                    <tr><td style="padding:8px; border:1px solid #999; font-weight:bold;">Report Date</td><td style="padding:8px; border:1px solid #999;">${reportDate}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #999; font-weight:bold;">Total Columns Drawn</td><td style="padding:8px; border:1px solid #999;">${results.length}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #999; font-weight:bold;">Total Winners</td><td style="padding:8px; border:1px solid #999;">${totalWinners}</td></tr>
                </tbody>
            </table>
        `;

        let tableHTML = '<table style="width:100%; margin-top:20px;"><thead><tr><th>Column</th><th>Category</th><th>Type</th><th>Winner Name / Number</th></tr></thead><tbody>';
        results.forEach(r => {
            const roundType = r.type === 'list' ? 'Name' : 'Number';
            const categoryName = r.category || '(None)';
            r.winners.forEach((w, i) => {
                const name = w && w.name ? w.name.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'N/A';
                const roundCell = i === 0 ? `<td rowspan="${r.winners.length}" style="vertical-align:middle; text-align:center;">${r.round}</td>` : '';
                const categoryCell = i === 0 ? `<td rowspan="${r.winners.length}" style="vertical-align:middle;">${categoryName}</td>` : '';
                tableHTML += `<tr>${roundCell}${categoryCell}<td>${roundType}</td><td>${name}</td></tr>`;
            });
        });
        tableHTML += '</tbody></table>';

        const template = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;} table{border-collapse:collapse;} th,td{border:1px solid #999; padding:8px 12px;} th{background-color:#f0f0f0; font-weight:bold; color:#333;}</style></head>
            <body>${summaryHTML}${tableHTML}</body>
            </html>
        `;

        const blob = new Blob([template], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "resolume_lucky_draw_report.xls");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Studio.init();
});
