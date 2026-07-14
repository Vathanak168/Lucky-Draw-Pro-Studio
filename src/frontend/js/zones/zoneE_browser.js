/**
 * zoneE_browser.js - Bottom Right: Files & Sources / Pool Browser
 * Resolume Arena 7 tabbed pool manager: Search, Add, Import/Export CSV, and Draw Reports tab.
 */
window.ZoneE = {
    activeTab: 'pool', // 'pool' or 'reports'
    searchQuery: '',

    init() {
        this.render();
    },

    setTab(tabName) {
        this.activeTab = tabName;
        this.render();
    },

    render() {
        const S = EngineState;
        const el = document.getElementById('zoneE_poolBrowser');
        if (!el) return;

        const participants = S.getParticipantList();
        const activeCount = participants.filter(p => !p.hidden).length;
        const results = S.roundResults.filter(r => r && r.winners && r.winners.length > 0);
        const totalWinners = results.reduce((acc, r) => acc + r.winners.length, 0);

        el.innerHTML = `
            <div class="arena-panel-header">
                <div class="arena-panel-title">
                    <i data-lucide="users" class="highlight"></i>
                    Participants · <span class="highlight">${activeCount} Eligible</span>
                </div>
            </div>

            <!-- Resolume Browser Tabs -->
            <div class="arena-tab-bar">
                <button class="arena-tab-btn ${this.activeTab === 'pool' ? 'active' : ''}" onclick="ZoneE.setTab('pool')">
                    Live Controls
                </button>
                <button class="arena-tab-btn ${this.activeTab === 'reports' ? 'active' : ''}" onclick="ZoneE.setTab('reports')">
                    Winners (${totalWinners})
                </button>
            </div>

            <div class="inspector-body" style="display:flex; flex-direction:column; gap:10px; padding:10px;">
                ${this.activeTab === 'pool' ? `
                    <div id="zoneE_stage_container"></div>
                ` : `
                    <!-- Reports & Exports Tab -->
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div style="background:var(--bg-surface); padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-light);">
                            <div style="font-size:12px; color:var(--accent-cyan); margin-bottom:4px;">Summary</div>
                            <div style="font-size:11px; color:var(--text-secondary);">Completed: <span style="color:#fff;">${results.length}</span> / ${S.totalRounds}</div>
                            <div style="font-size:11px; color:var(--text-secondary);">Total Winners: <span style="color:#fff;">${totalWinners}</span></div>
                        </div>

                        <div style="display:flex; gap:6px;">
                            <button class="btn-arena btn-arena-primary" onclick="Studio.exportReportToExcel()" style="flex:1;">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                Export
                            </button>
                            <button class="btn-arena" onclick="Studio.showReport()" style="flex:1;">Show Details</button>
                        </div>

                        <div style="overflow-y:auto; max-height:420px; border:1px solid var(--border-light); border-radius:var(--radius-sm); background:var(--bg-surface);">
                            ${results.length === 0 ? `
                                <div class="ui-empty-state" style="padding:20px;">No Winners</div>
                            ` : results.map(r => `
                                <div style="padding:8px 10px; border-bottom:1px solid var(--border-light);">
                                    <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--accent-cyan);">
                                        <span>Round #${r.round} (${r.category})</span>
                                        <span>${r.winners.length} Winners</span>
                                    </div>
                                    <div style="font-size:11px; color:#fff; margin-top:4px;">
                                        ${r.winners.map(w => w.name).join(', ')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `}
            </div>
        `;

        if (this.activeTab === 'pool' && window.ZoneEStageControls) {
            ZoneEStageControls.render(document.getElementById('zoneE_stage_container'));
        }
    },

    renderGrid() {
        // No-op since 'None' tab is clean
    },

    addParticipant() {
        const S = EngineState;
        const input = document.getElementById('zoneE_addInput');
        if (!input) return;
        const val = input.value.trim();
        if (!val) return;

        const participants = S.getParticipantList();
        let newId = (participants.length + 1).toString();
        let newName = val;
        if (val.includes('-')) {
            const parts = val.split('-');
            if (parts[0].trim().length <= 15 && parts.length >= 2) {
                newId = parts[0].trim();
                newName = parts.slice(1).join('-').trim();
            }
        }
        participants.push({ id: newId, name: newName, dept: '', phone: '', eligibility: 'All', status: 'ELIGIBLE', hidden: false });
        S.saveParticipantList(participants);
        input.value = '';
        Draw.initializePoolsSilently();
        this.render();
        if (window.ZoneC) ZoneC.render();
    },

    toggleHide(index) {
        const S = EngineState;
        const participants = S.getParticipantList();
        if (participants[index]) {
            participants[index].hidden = !participants[index].hidden;
            S.saveParticipantList(participants);
            this.render();
            if (window.ZoneC) ZoneC.render();
        }
    },

    deleteParticipant(index) {
        const S = EngineState;
        const participants = S.getParticipantList();
        if (participants[index]) {
            participants.splice(index, 1);
            S.saveParticipantList(participants);
            this.render();
            if (window.ZoneC) ZoneC.render();
        }
    },

    clearAll() {
        if (!confirm('Remove all participants? This cannot be undone.')) return;
        EngineState.saveParticipantList([]);
        this.render();
        if (window.ZoneC) ZoneC.render();
    },

    handleCsvImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l !== '');
            if (lines.length === 0) return;

            let startIndex = 0;
            if (lines[0].toLowerCase().includes('name') || lines[0].toLowerCase().includes('participant')) {
                startIndex = 1;
            }

            const participants = EngineState.getParticipantList();
            for (let i = startIndex; i < lines.length; i++) {
                let name = lines[i];
                if (name.includes(',')) name = name.split(',')[0].trim().replace(/^"|"$/g, '');
                if (name) participants.push({ name: name, hidden: false });
            }
            EngineState.saveParticipantList(participants);
            e.target.value = null;
            this.render();
            if (window.ZoneC) ZoneC.render();
            alert(`Imported ${lines.length - startIndex} participants successfully!`);
        };
        reader.readAsText(file);
    },

    exportCsv() {
        const participants = EngineState.getParticipantList().filter(p => !p.hidden);
        if (participants.length === 0) { alert('No active participants to export.'); return; }

        let csv = 'Name\n' + participants.map(p => `"${p.name.replace(/"/g, '""')}"`).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'lucky_draw_participants.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};
