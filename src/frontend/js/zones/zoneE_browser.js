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
                    <svg class="svg-icon highlight" viewBox="0 0 24 24"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                    Pool · <span class="highlight">${activeCount} Active</span>
                </div>
            </div>

            <!-- Resolume Browser Tabs -->
            <div class="arena-tab-bar">
                <button class="arena-tab-btn ${this.activeTab === 'pool' ? 'active' : ''}" onclick="ZoneE.setTab('pool')">
                    Names (${participants.length})
                </button>
                <button class="arena-tab-btn ${this.activeTab === 'reports' ? 'active' : ''}" onclick="ZoneE.setTab('reports')">
                    Winners (${totalWinners})
                </button>
            </div>

            <div class="inspector-body" style="display:flex; flex-direction:column; gap:10px; padding:10px;">
                ${this.activeTab === 'pool' ? `
                    <!-- Pool Search & Actions -->
                    <div style="display:flex; gap:6px;">
                        <input type="text" placeholder="Search..." value="${this.searchQuery.replace(/"/g, '&quot;')}" oninput="ZoneE.searchQuery=this.value; ZoneE.renderGrid();" style="flex:1;">
                    </div>
                    <div style="display:flex; gap:6px;">
                        <input type="text" id="zoneE_addInput" placeholder="Add name..." onkeydown="if(event.key==='Enter') ZoneE.addParticipant()" style="flex:1;">
                        <button class="btn-arena btn-arena-primary" onclick="ZoneE.addParticipant()" style="padding:4px 10px; font-size:11px;">Add</button>
                    </div>

                    <div style="display:flex; gap:6px; justify-content:space-between; padding-top:4px; border-top:1px solid var(--border-light);">
                        <label class="btn-arena" style="flex:1; cursor:pointer; font-size:10px; padding:4px 6px;">
                            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                            Import
                            <input type="file" accept=".csv" style="display:none;" onchange="ZoneE.handleCsvImport(event)">
                        </label>
                        <button class="btn-arena" onclick="ZoneE.exportCsv()" style="font-size:10px; padding:4px 6px;">
                            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                            Export
                        </button>
                        ${participants.length > 0 ? `
                        <button class="btn-arena btn-arena-danger" onclick="ZoneE.clearAll()" style="font-size:10px; padding:4px 6px;">Clear</button>
                        ` : ''}
                    </div>

                    <!-- Grid of Participant Chips -->
                    <div id="zoneE_grid" class="participant-grid" style="overflow-y:auto; max-height:480px; margin-top:4px;"></div>
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
                                Export Excel
                            </button>
                            <button class="btn-arena" onclick="Studio.showReport()" style="flex:1;">View Table</button>
                        </div>

                        <div style="overflow-y:auto; max-height:420px; border:1px solid var(--border-light); border-radius:var(--radius-sm); background:var(--bg-surface);">
                            ${results.length === 0 ? `
                                <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:11px;">No winners yet.</div>
                            ` : results.map(r => `
                                <div style="padding:8px 10px; border-bottom:1px solid var(--border-light);">
                                    <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--accent-cyan);">
                                        <span>Col #${r.round} (${r.category})</span>
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

        if (this.activeTab === 'pool') this.renderGrid();
    },

    renderGrid() {
        const S = EngineState;
        const gridEl = document.getElementById('zoneE_grid');
        if (!gridEl) return;

        const participants = S.getParticipantList();
        const q = (this.searchQuery || '').toLowerCase().trim();

        const filtered = participants.filter((p, idx) => {
            if (!q) return true;
            return p.name.toLowerCase().includes(q) || `l_${idx + 1}`.includes(q);
        });

        if (filtered.length === 0) {
            gridEl.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:24px; color:var(--text-muted); font-size:11px;">No names found. Add or import above.</div>`;
            return;
        }

        let html = '';
        filtered.forEach(p => {
            const originalIndex = participants.findIndex(x => x === p);
            html += `
                <div class="participant-chip ${p.hidden ? 'hidden' : ''}">
                    <span class="participant-chip-name" title="${p.name.replace(/"/g, '&quot;')}">
                        <b style="color:var(--text-secondary); font-family:var(--font-mono); margin-right:4px;">#${originalIndex + 1}</b>
                        ${p.name}
                    </span>
                    <div style="display:flex; gap:2px; flex-shrink:0;">
                        <button onclick="ZoneE.toggleHide(${originalIndex})" title="${p.hidden ? 'Show' : 'Hide'}" style="background:none; border:none; color:${p.hidden ? '#888' : 'var(--accent-cyan)'}; cursor:pointer; padding:2px;">
                            <svg class="svg-icon" viewBox="0 0 24 24"><path d="${p.hidden ? 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' : 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z'}"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button onclick="ZoneE.deleteParticipant(${originalIndex})" title="Delete" style="background:none; border:none; color:var(--danger-color); cursor:pointer; padding:2px;">
                            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                    </div>
                </div>
            `;
        });
        gridEl.innerHTML = html;
    },

    addParticipant() {
        const S = EngineState;
        const input = document.getElementById('zoneE_addInput');
        if (!input) return;
        const val = input.value.trim();
        if (!val) return;

        const participants = S.getParticipantList();
        participants.push({ name: val, hidden: false });
        S.saveParticipantList(participants);
        input.value = '';
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
        if (!confirm('Clear all participants from the pool?')) return;
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
