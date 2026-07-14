/**
 * zoneD_poolManager.js - Standalone Participant Pool & Excel Suite Manager for Zone D Inspector
 * Renders directly inside the wide Zone D Inspector to avoid opening extra overlay popup modals.
 * Follows the principle: new feature created in a new file, then called in the main controller (zoneD_inspector.js).
 */
window.ZoneDPoolManager = {
    searchQuery: '',
    filterStatus: 'all', // 'all', 'active', 'hidden'
    filterCategory: 'all',
    ribbonMode: 'all',

    render(containerEl) {
        if (!containerEl) return;
        const S = EngineState;
        const list = S.getParticipantList();

        // Filter list based on search and status
        let filteredList = list.filter(p => {
            if (!p) return false;
            const matchQuery = !this.searchQuery || 
                (p.name && p.name.toLowerCase().includes(this.searchQuery.toLowerCase())) ||
                (p.id && p.id.toLowerCase().includes(this.searchQuery.toLowerCase())) ||
                (p.department && p.department.toLowerCase().includes(this.searchQuery.toLowerCase())) ||
                (p.ticket && p.ticket.toLowerCase().includes(this.searchQuery.toLowerCase()));
            
            const matchStatus = this.filterStatus === 'all' ||
                (this.filterStatus === 'active' && !p.hidden) ||
                (this.filterStatus === 'hidden' && p.hidden);

            const matchCat = this.filterCategory === 'all' || p.category === this.filterCategory;

            return matchQuery && matchStatus && matchCat;
        });

        const activeCount = list.filter(p => !p.hidden).length;
        const totalCount = list.length;

        // Build Category Filter Options
        let catOptionsHtml = `<option value="all" ${this.filterCategory === 'all' ? 'selected' : ''}>All Categories (${totalRoundsCount(list, 'all')})</option>`;
        S.prizeCategories.forEach(cat => {
            const count = list.filter(p => p.category === cat).length;
            catOptionsHtml += `<option value="${cat.replace(/"/g, '&quot;')}" ${this.filterCategory === cat ? 'selected' : ''}>${cat} (${count})</option>`;
        });

        function totalRoundsCount(l, c) {
            return c === 'all' ? l.length : l.filter(p => p.category === c).length;
        }

        // Build Table Rows
        let tableRowsHtml = '';
        if (filteredList.length === 0) {
            tableRowsHtml = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted); font-size:12px;">
                         No Participants
                    </td>
                </tr>
            `;
        } else {
            filteredList.forEach((p, idx) => {
                const originalIdx = list.indexOf(p);
                const isActive = !p.hidden;
                tableRowsHtml += `
                    <tr style="${!isActive ? 'opacity:0.45; background:rgba(0,0,0,0.25);' : ''}">
                        <td style="font-family:var(--font-mono); color:var(--text-secondary); width:40px; text-align:center;">
                            ${originalIdx + 1}
                        </td>
                        <td style="width:120px;">
                            <input type="text" value="${(p.id || p.ticket || '').replace(/"/g, '&quot;')}" placeholder="ID / Ticket"
                                   onchange="ZoneDPoolManager.updateField(${originalIdx}, 'id', this.value)"
                                   style="width:100%; background:transparent; border:1px solid transparent; font-family:var(--font-mono); color:var(--accent-cyan); font-weight:700; padding:4px 6px;"
                                   onfocus="this.style.borderColor='var(--border-light)'; this.style.background='var(--bg-input)';"
                                   onblur="this.style.borderColor='transparent'; this.style.background='transparent';">
                        </td>
                        <td style="min-width:160px;">
                            <input type="text" value="${(p.name || '').replace(/"/g, '&quot;')}" placeholder="Full Name"
                                   onchange="ZoneDPoolManager.updateField(${originalIdx}, 'name', this.value)"
                                   style="width:100%; background:transparent; border:1px solid transparent; font-weight:700; color:#fff; padding:4px 6px;"
                                   onfocus="this.style.borderColor='var(--border-light)'; this.style.background='var(--bg-input)';"
                                   onblur="this.style.borderColor='transparent'; this.style.background='transparent';">
                        </td>
                        <td style="width:130px;">
                            <input type="text" value="${(p.department || '').replace(/"/g, '&quot;')}" placeholder="Department"
                                   onchange="ZoneDPoolManager.updateField(${originalIdx}, 'department', this.value)"
                                   style="width:100%; background:transparent; border:1px solid transparent; color:var(--text-secondary); font-size:11px; padding:4px 6px;"
                                   onfocus="this.style.borderColor='var(--border-light)'; this.style.background='var(--bg-input)';"
                                   onblur="this.style.borderColor='transparent'; this.style.background='transparent';">
                        </td>
                        <td style="width:130px;">
                            <select onchange="ZoneDPoolManager.updateField(${originalIdx}, 'category', this.value)"
                                    style="width:100%; background:var(--bg-panel); border:1px solid var(--border-light); color:var(--accent-cyan); font-size:11px; padding:3px 6px; border-radius:3px;">
                                <option value="General" ${!p.category || p.category === 'General' ? 'selected' : ''}>General</option>
                                ${S.prizeCategories.map(cat => `<option value="${cat.replace(/"/g, '&quot;')}" ${p.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                            </select>
                        </td>
                        <td style="width:90px; text-align:center;">
                            <label class="ios-toggle-label" title="${isActive ? 'Eligible' : 'Excluded'}" style="justify-content:center;">
                                <input type="checkbox" class="ios-toggle-input" ${isActive ? 'checked' : ''} onchange="ZoneDPoolManager.toggleStatus(${originalIdx})">
                                <span class="ios-toggle-switch"></span>
                            </label>
                        </td>
                        <td style="width:60px; text-align:right;">
                            <button class="btn-arena btn-arena-danger" onclick="ZoneDPoolManager.deleteParticipant(${originalIdx})" title="Delete Participant" style="padding:3px 8px; font-size:11px;">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        const currentRibbonMode = this.ribbonMode || 'all';

        let headerControlsHtml = '';

        if (currentRibbonMode === 'autohide') {
            // Mode 1: Auto-hide (`Full Table Mode` - 100% table height)
            headerControlsHtml = `
                <div onclick="ZoneDPoolManager.setRibbonMode('all')" title="Show Controls" style="display:flex; align-items:center; justify-content:center; background:#101018; border:1px dashed #28283c; border-radius:4px; padding:5px; font-size:11px; color:var(--accent-cyan); font-weight:700; cursor:pointer; transition:all 0.2s; flex-shrink:0;">
                    Show Controls · ${activeCount}/${totalCount} Eligible
                </div>
            `;
        } else if (currentRibbonMode === 'tabs') {
            // Mode 2: Show Tabs (`Compact 1-Tier Strip` - single 34px bar to maximize table height)
            headerControlsHtml = `
                <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-surface); padding:6px 10px; border-radius:6px; border:1px solid var(--border-light); gap:8px; flex-wrap:wrap; flex-shrink:0;">
                    <!-- Left: Search input -->
                    <div style="position:relative; flex:1; display:flex; align-items:center; min-width:200px;">
                        <svg class="svg-icon" viewBox="0 0 24 24" style="position:absolute; left:8px; width:13px; height:13px; color:var(--accent-cyan); pointer-events:none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input type="text" placeholder="Search" value="${this.searchQuery.replace(/"/g, '&quot;')}" oninput="ZoneDPoolManager.setSearch(this.value)" style="width:100%; height:26px; background:#161622; border:1px solid #303044; padding:0 22px 0 26px; font-size:11px; border-radius:4px; color:#fff;">
                        ${this.searchQuery ? `<button onclick="ZoneDPoolManager.setSearch('')" style="position:absolute; right:6px; background:transparent; border:none; color:#888; cursor:pointer; font-size:11px;">✕</button>` : ''}
                    </div>

                    <!-- Center: Category Dropdown -->
                    <select onchange="ZoneDPoolManager.setFilterCategory(this.value)" style="height:26px; background:#161622; border:1px solid #303044; padding:0 8px; font-size:10px; color:var(--accent-cyan); border-radius:4px; font-weight:600; outline:none;">
                        ${catOptionsHtml}
                    </select>

                    <!-- Right: Status Segmented Control & Action Buttons -->
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <div style="display:flex; background:#0b0b10; border:1px solid #282836; border-radius:4px; padding:1px; height:24px; align-items:center;">
                            <button onclick="ZoneDPoolManager.setFilterStatus('all')" style="border:none; border-radius:3px; height:20px; padding:0 6px; font-size:10px; font-weight:700; cursor:pointer; ${this.filterStatus === 'all' ? 'background:#242434; color:#fff;' : 'background:transparent; color:#888;'}">All</button>
                            <button onclick="ZoneDPoolManager.setFilterStatus('active')" style="border:none; border-radius:3px; height:20px; padding:0 6px; font-size:10px; font-weight:700; cursor:pointer; ${this.filterStatus === 'active' ? 'background:var(--accent-cyan); color:#0c0c0c;' : 'background:transparent; color:#888;'}">Eligible</button>
                            <button onclick="ZoneDPoolManager.setFilterStatus('hidden')" style="border:none; border-radius:3px; height:20px; padding:0 6px; font-size:10px; font-weight:700; cursor:pointer; ${this.filterStatus === 'hidden' ? 'background:#3f2020; color:#ff6b6b;' : 'background:transparent; color:#888;'}">Excluded</button>
                        </div>

                        <button class="pool-action-btn secondary ribbon-display-trigger" onclick="Studio.openRibbonDisplayMenu(event)" title="View Options" style="height:24px; padding:0 8px; font-size:10px; background:#181826; border-color:#36364c; color:var(--accent-cyan);">
                            <svg class="svg-icon" viewBox="0 0 24 24" style="width:12px; height:12px;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M12 19V9"/></svg>
                            <span>View Options</span>
                        </button>

                        <button class="pool-action-btn accent" onclick="ZoneDPoolManager.addNewParticipant()" title="Add Participant" style="height:24px; padding:0 8px; font-size:10px;">
                            <svg class="svg-icon" viewBox="0 0 24 24" style="width:12px; height:12px;"><path d="M5 12h14M12 5v14"/></svg>
                            <span>Add Participant</span>
                        </button>

                        <label class="pool-action-btn primary" title="Import Participants" style="height:24px; padding:0 8px; font-size:10px;">
                            <span>Import</span>
                            <input type="file" accept=".xls,.xlsx,.csv" style="display:none;" onchange="ZoneDPoolManager.handleExcelImport(event)">
                        </label>
                    </div>
                </div>
            `;
        } else {
            // Mode 3: Show Tabs and Commands (`Full 2-Tier Header Mode` - default)
            headerControlsHtml = `
                <!-- Top Pro Workstation Action Header -->
                <div class="pool-unified-header" style="flex-shrink:0;">
                    <!-- Left: Pool Health & Live Count Badge -->
                    <div style="display:flex; align-items:center; gap: 12px;">
                        <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(18, 207, 255, 0.07); border: 1px solid rgba(18, 207, 255, 0.28); display: flex; align-items: center; justify-content: center; color: var(--accent-cyan); flex-shrink: 0;">
                            <svg class="svg-icon" viewBox="0 0 24 24" style="width:18px; height:18px;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                        <div>
                            <div style="font-size: 11px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 6px;">
                                 Participants
                                 <span style="background: rgba(48, 209, 88, 0.12); color: var(--success-color); font-family: var(--font-mono); font-size: 10px; padding: 1px 6px; border-radius: 10px; border: 1px solid rgba(48, 209, 88, 0.25); font-weight:700;">${activeCount} Eligible</span>
                            </div>
                             <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px;">${totalCount} Total · ${totalCount - activeCount} Excluded</div>
                        </div>
                    </div>

                    <!-- Right: Segmented Status Filter & Action Strip -->
                    <div style="display:flex; align-items:center; gap: 12px; flex-wrap:wrap;">
                        <!-- Status Filter Segmented Control -->
                        <div style="display:flex; background: #0b0b10; border: 1px solid #282836; border-radius: 6px; padding: 2px; height:28px; align-items:center;">
                            <button onclick="ZoneDPoolManager.setFilterStatus('all')" style="border:none; border-radius:4px; height:22px; padding:0 10px; font-size:10px; font-weight:700; cursor:pointer; transition:all 0.2s; ${this.filterStatus === 'all' ? 'background:#242434; color:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.5);' : 'background:transparent; color:#888;'}">All</button>
                            <button onclick="ZoneDPoolManager.setFilterStatus('active')" style="border:none; border-radius:4px; height:22px; padding:0 10px; font-size:10px; font-weight:700; cursor:pointer; transition:all 0.2s; ${this.filterStatus === 'active' ? 'background:var(--accent-cyan); color:#031016;' : 'background:transparent; color:#888;'}">Eligible</button>
                            <button onclick="ZoneDPoolManager.setFilterStatus('hidden')" style="border:none; border-radius:4px; height:22px; padding:0 10px; font-size:10px; font-weight:700; cursor:pointer; transition:all 0.2s; ${this.filterStatus === 'hidden' ? 'background:#3f2020; color:#ff6b6b; box-shadow:0 1px 3px rgba(0,0,0,0.5);' : 'background:transparent; color:#888;'}">Excluded</button>
                        </div>

                        <!-- Action Tools Group -->
                        <div style="display:flex; gap: 6px; align-items:center;">
                            <button class="pool-action-btn secondary ribbon-display-trigger" onclick="Studio.openRibbonDisplayMenu(event)" title="View Options" style="background:#181826; border-color:#36364c; color:var(--accent-cyan);">
                                <svg class="svg-icon" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M12 19V9"/></svg>
                                <span>View Options</span>
                            </button>

                            <label class="pool-action-btn primary" title="Import Participants">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                <span>Import</span>
                                <input type="file" accept=".xls,.xlsx,.csv" style="display:none;" onchange="ZoneDPoolManager.handleExcelImport(event)">
                            </label>

                            <button class="pool-action-btn secondary" onclick="Studio.openTemplateOptionsModal()" title="Export Template">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                                <span>Export Template</span>
                            </button>

                            <button class="pool-action-btn accent" onclick="ZoneDPoolManager.addNewParticipant()" title="Add Participant">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>
                                <span>Add Participant</span>
                            </button>

                            ${totalCount > 0 ? `
                            <button class="pool-action-btn danger" onclick="ZoneDPoolManager.clearAll()" title="Remove All">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Dedicated Search & Filter Strip Underneath Header -->
                <div style="display:flex; align-items:center; justify-content:space-between; background: #0e0e14; padding: 8px 12px; border-radius: 6px; border: 1px solid #222230; gap: 10px; flex-wrap: wrap; flex-shrink:0;">
                    <div style="position:relative; flex: 1; display:flex; align-items:center; min-width: 260px;">
                        <svg class="svg-icon" viewBox="0 0 24 24" style="position:absolute; left:10px; width:14px; height:14px; color:var(--accent-cyan); pointer-events:none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input type="text" placeholder="Search"
                               value="${this.searchQuery.replace(/"/g, '&quot;')}" 
                               oninput="ZoneDPoolManager.setSearch(this.value)"
                               style="width: 100%; height:30px; background: #161622; border: 1px solid #303044; padding: 0 28px 0 32px; font-size: 12px; border-radius: 6px; color: #fff; transition: all 0.2s;"
                               onfocus="this.style.borderColor='var(--accent-cyan)'; this.style.background='#1c1c2b';" onblur="this.style.borderColor='#303044'; this.style.background='#161622';">
                        ${this.searchQuery ? `<button onclick="ZoneDPoolManager.setSearch('')" style="position:absolute; right:8px; background:transparent; border:none; color:#888; cursor:pointer; font-size:12px; display:flex; align-items:center; padding:4px;">✕</button>` : ''}
                    </div>

                    <div style="display:flex; align-items:center; gap: 8px;">
                        <span style="font-size:10px; color:var(--text-secondary); font-weight:700;">Prize Category</span>
                        <select onchange="ZoneDPoolManager.setFilterCategory(this.value)" style="height:30px; background: #161622; border: 1px solid #303044; padding: 0 10px; font-size: 11px; color: var(--accent-cyan); border-radius: 6px; cursor: pointer; font-weight: 600; outline: none;">
                            ${catOptionsHtml}
                        </select>
                    </div>
                </div>
            `;
        }

        containerEl.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; gap:10px; padding:10px; overflow:hidden;">
                ${headerControlsHtml}

                <!-- Scrollable Table -->
                <div style="flex:1; overflow-y:auto; border:1px solid var(--border-light); border-radius:var(--radius-sm); background:var(--bg-surface);">
                    <table class="winner-table" style="width:100%; border-collapse:collapse;">
                        <thead style="position:sticky; top:0; background:var(--bg-elevated); z-index:5; border-bottom:1px solid var(--border-light);">
                            <tr>
                                <th style="width:40px; text-align:center; padding:8px 6px; color:var(--text-secondary); font-size:10px;">#</th>
                                <th style="width:120px; padding:8px 6px; color:var(--text-secondary); font-size:10px;">ID / Ticket #</th>
                                <th style="min-width:160px; padding:8px 6px; color:var(--text-secondary); font-size:10px;">Full Name</th>
                                <th style="width:130px; padding:8px 6px; color:var(--text-secondary); font-size:10px;">Department</th>
                                 <th style="width:130px; padding:8px 6px; color:var(--text-secondary); font-size:10px;">Prize Category</th>
                                 <th style="width:90px; text-align:center; padding:8px 6px; color:var(--text-secondary); font-size:10px;">Status</th>
                                 <th style="width:60px; text-align:right; padding:8px 6px; color:var(--text-secondary); font-size:10px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    setSearch(query) {
        this.searchQuery = query;
        if (window.ZoneD && ZoneD.activeTab === 'pool') {
            this.render(document.getElementById('zoneD_pool_container'));
        }
    },

    setFilterStatus(status) {
        this.filterStatus = status;
        if (window.ZoneD && ZoneD.activeTab === 'pool') {
            this.render(document.getElementById('zoneD_pool_container'));
        }
    },

    setFilterCategory(cat) {
        this.filterCategory = cat;
        if (window.ZoneD && ZoneD.activeTab === 'pool') {
            this.render(document.getElementById('zoneD_pool_container'));
        }
    },

    updateField(idx, field, val) {
        const S = EngineState;
        const list = S.getParticipantList();
        if (!list[idx]) return;
        list[idx][field] = val;
        if (field === 'category' && val && !S.prizeCategories.includes(val)) {
            S.prizeCategories.push(val);
            if (typeof S.saveSettingsToStorage === 'function') S.saveSettingsToStorage();
        }
        S.setParticipantList(list);
        if (window.ZoneD && ZoneD.activeTab === 'pool') {
            this.render(document.getElementById('zoneD_pool_container'));
        }
        if (window.ZoneE) ZoneE.render();
    },

    toggleStatus(idx) {
        const S = EngineState;
        const list = S.getParticipantList();
        if (!list[idx]) return;
        list[idx].hidden = !list[idx].hidden;
        S.setParticipantList(list);
        if (window.ZoneD && ZoneD.activeTab === 'pool') {
            this.render(document.getElementById('zoneD_pool_container'));
        }
        if (window.ZoneE) ZoneE.render();
    },

    deleteParticipant(idx) {
        if (!confirm("Are you sure you want to delete this participant?")) return;
        const S = EngineState;
        const list = S.getParticipantList();
        if (!list[idx]) return;
        list.splice(idx, 1);
        S.setParticipantList(list);
        if (window.ZoneD && ZoneD.activeTab === 'pool') {
            this.render(document.getElementById('zoneD_pool_container'));
        }
        if (window.ZoneE) ZoneE.render();
    },

    addNewParticipant() {
        const S = EngineState;
        const list = S.getParticipantList();
        const nextId = `EMP-${String(list.length + 1).padStart(3, '0')}`;
        list.unshift({
            id: nextId,
            ticket: nextId,
            name: `New Participant ${list.length + 1}`,
            department: 'General',
            category: S.prizeCategories[0] || 'General',
            hidden: false
        });
        S.setParticipantList(list);
        if (window.ZoneD && ZoneD.activeTab === 'pool') {
            this.render(document.getElementById('zoneD_pool_container'));
        }
        if (window.ZoneE) ZoneE.render();
    },

    clearAll() {
        if (!confirm("Remove all participants? This cannot be undone.")) return;
        EngineState.setParticipantList([]);
        if (window.ZoneD && ZoneD.activeTab === 'pool') {
            this.render(document.getElementById('zoneD_pool_container'));
        }
        if (window.ZoneE) ZoneE.render();
    },

    handleExcelImport(event) {
        if (window.Studio) {
            Studio.handleMasterExcelImport(event);
            setTimeout(() => {
                if (window.ZoneD && ZoneD.activeTab === 'pool') {
                    this.render(document.getElementById('zoneD_pool_container'));
                }
            }, 300);
        }
    },

    setRibbonMode(mode) {
        this.ribbonMode = mode;
        if (window.DesktopStorage) DesktopStorage.updateSettings({ poolRibbonMode: mode }).catch(error => console.error('Pool preference save failed:', error));
        if (window.ZoneD && ZoneD.activeTab === 'pool') {
            this.render(document.getElementById('zoneD_pool_container'));
        }
    }
};
