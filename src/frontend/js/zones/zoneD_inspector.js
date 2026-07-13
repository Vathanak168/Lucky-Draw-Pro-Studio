/**
 * zoneD_inspector.js - Bottom Center: Dashboard / Clip Inspector
 * Resolume Arena 7 tabbed inspector: Round Slot properties, Preset Dropdowns, Winner Re-Draw Table, and Stage FX.
 */
window.ZoneD = {
    activeTab: 'round', // 'round' or 'fx'
    vipOverrideExpanded: false,

    init() {
        this.render();
    },

    setTab(tabName) {
        this.activeTab = tabName;
        this.render();
    },

    toggleVipOverride() {
        this.vipOverrideExpanded = !this.vipOverrideExpanded;
        this.render();
    },

    render() {
        const S = EngineState;
        const el = document.getElementById('zoneD_dashboardInspector');
        if (!el) return;

        const rc = S.roundConfigs[S.currentRound] || S.getDefaultRoundConfig(S.currentRound);
        const roundResult = S.roundResults[S.currentRound];
        const winners = roundResult ? roundResult.winners : [];
        const ds = S.displaySettings;

        // Build Preset Rows with Dropdown / Search options
        let presetRows = '';
        const winnerCount = rc.winnerCount || 1;
        const currentPoolList = S.getParticipantList().filter(p => !p.hidden);

        for (let i = 0; i < winnerCount; i++) {
            const currentVal = (rc.presets && rc.presets[i]) ? rc.presets[i] : '';
            let dropdownOptions = `<option value="">-- Random --</option>`;
            if (rc.dataSource === 'list' || rc.dataSource === 'id') {
                currentPoolList.forEach(p => {
                    const displayVal = (rc.dataSource === 'id') ? (p.id || p.ticket || p.name) : p.name;
                    const sel = (displayVal === currentVal) ? 'selected' : '';
                    dropdownOptions += `<option value="${displayVal.replace(/"/g, '&quot;')}" ${sel}>${displayVal} ${rc.dataSource === 'id' && p.name ? `(${p.name})` : ''}</option>`;
                });
            }

            presetRows += `
                <div class="inspector-row">
                    <span class="inspector-label" style="font-size:10px; color:var(--text-secondary);">#${i + 1}:</span>
                    ${(rc.dataSource === 'list' || rc.dataSource === 'id') && currentPoolList.length > 0 && currentPoolList.length <= 500 ? `
                        <select onchange="ZoneD.updatePreset(${i}, this.value)" style="flex:1; font-size:11px; padding:4px;">
                            ${dropdownOptions}
                        </select>
                    ` : `
                        <input type="text" placeholder="${rc.dataSource === 'numeric' ? 'Number...' : (rc.dataSource === 'id' ? 'ID / Ticket...' : 'Name...')}" value="${currentVal.replace(/"/g, '&quot;')}" onchange="ZoneD.updatePreset(${i}, this.value)" style="flex:1; font-size:11px; padding:4px;">
                    `}
                </div>
            `;
        }

        // Build Live Winner Controls Table (with individual Re-draw!)
        let winnerTableHtml = '';
        if (winners && winners.length > 0) {
            let rowsHtml = '';
            winners.forEach((w, idx) => {
                if (!w) return;
                rowsHtml += `
                    <tr>
                        <td style="font-family:var(--font-mono); color:var(--text-secondary); width:50px;">#${idx + 1}</td>
                        <td style="font-weight:700; color:var(--accent-cyan);">${w.name}</td>
                        <td style="text-align:right; width:110px;">
                            <button class="btn-arena" onclick="Draw.replaceWinnerAt(${S.currentRound}, ${idx})" title="Replace this winner with a new spin" style="padding:2px 8px; font-size:10px;">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                Re-Spin
                            </button>
                        </td>
                    </tr>
                `;
            });
            winnerTableHtml = `
                <div class="inspector-section" style="border-color:var(--accent-cyan); background:rgba(0,229,163,0.03);">
                    <div class="inspector-section-title">
                        <span style="color:var(--accent-cyan);">Winners (${winners.length})</span>
                    </div>
                    <table class="winner-table">
                        <thead><tr><th>#</th><th>Winner</th><th style="text-align:right;">Action</th></tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
        }

        el.innerHTML = `
            <div class="arena-panel-header">
                <div class="arena-panel-title">
                    <svg class="svg-icon highlight" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                    Inspector · <span class="highlight">Col #${S.currentRound + 1}</span>
                </div>
            </div>

            <!-- Dashboard Tabs -->
            <div class="arena-tab-bar">
                <button class="arena-tab-btn ${this.activeTab === 'round' ? 'active' : ''}" onclick="ZoneD.setTab('round')">
                    Deck Settings
                </button>
                <button class="arena-tab-btn ${this.activeTab === 'fx' ? 'active' : ''}" onclick="ZoneD.setTab('fx')">
                    Effects & Rules
                </button>
                <button class="arena-tab-btn ${this.activeTab === 'pool' ? 'active' : ''}" onclick="ZoneD.setTab('pool')" style="color:var(--accent-cyan); font-weight:800; display:flex; align-items:center; gap:6px;">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Participants & Excel Pool
                </button>
            </div>

            <!-- Inspector Body -->
            <div class="inspector-body" style="${this.activeTab === 'pool' ? 'padding:0; overflow:hidden;' : ''}">
                ${this.activeTab === 'pool' ? `
                    <div id="zoneD_pool_container" style="height:100%; display:flex; flex-direction:column;"></div>
                ` : this.activeTab === 'round' ? `
                    ${winnerTableHtml}

                    <div class="inspector-section" style="border:1px solid var(--accent-cyan); background:rgba(0, 229, 163, 0.05);">
                        <div class="inspector-section-title" style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:var(--accent-cyan); font-size:11px; font-weight:800;">🏷️ DECK CATEGORY</span>
                            <button class="btn-arena" onclick="ZoneA.manageCategoriesPrompt()" style="padding:1px 6px; font-size:9px; border-color:var(--border-light); color:#ddd;">
                                ⚙️ Manage Decks
                            </button>
                        </div>
                        <div class="inspector-row" style="margin-top:6px;">
                            <span class="inspector-label" style="font-weight:700; color:#fff;">Category:</span>
                            <select onchange="ZoneD.updateField('category', this.value)" style="flex:1; font-weight:700; color:var(--accent-cyan); background:var(--bg-elevated); padding:6px; border:1px solid var(--accent-cyan);">
                                ${S.prizeCategories.map(cat => `<option value="${cat.replace(/"/g, '&quot;')}" ${rc.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                            </select>
                            <button class="btn-arena" onclick="ZoneD.addCategoryPrompt()" title="Create New Category Deck" style="padding:4px 8px; font-size:12px; font-weight:800; color:var(--accent-cyan);">
                                +
                            </button>
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>Draw Settings</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Source:</span>
                            <select onchange="ZoneD.updateField('dataSource', this.value)" style="flex:1;">
                                <option value="numeric" ${rc.dataSource === 'numeric' ? 'selected' : ''}>Number</option>
                                <option value="list" ${rc.dataSource === 'list' ? 'selected' : ''}>Name</option>
                                <option value="id" ${rc.dataSource === 'id' ? 'selected' : ''}>ID / Ticket #</option>
                            </select>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Winners:</span>
                            <div style="display:flex; gap:6px; flex:1;">
                                <input type="number" min="1" max="100" value="${rc.winnerCount || 1}" onchange="ZoneD.updateField('winnerCount', parseInt(this.value)||1)" style="flex:1;">
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 1)" style="padding:2px 8px;">1</button>
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 3)" style="padding:2px 8px;">3</button>
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 5)" style="padding:2px 8px;">5</button>
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 10)" style="padding:2px 8px;">10</button>
                            </div>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Layout:</span>
                            <select onchange="ZoneD.updateField('layoutMode', this.value)" style="flex:1; background: #1a1a24; color: #00e5a3;">
                                <option value="grid" selected>Grid Boxes</option>
                            </select>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Effect:</span>
                            <select onchange="ZoneD.updateField('animationStyle', this.value)" style="flex:1; background: #1a1a24; color: #00e5a3;">
                                <option value="simultaneous" selected>Simultaneous</option>
                            </select>
                        </div>
                    </div>

                    <div class="inspector-section" style="border: 1px dashed ${this.vipOverrideExpanded ? 'var(--warning-color)' : '#444'}; background: ${this.vipOverrideExpanded ? 'rgba(245, 158, 11, 0.04)' : 'transparent'};">
                        <div class="inspector-section-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:${this.vipOverrideExpanded ? '10px' : '0'};">
                            <span style="color:${this.vipOverrideExpanded ? 'var(--warning-color)' : '#888'}; font-weight:800; font-size:11px;">
                                👑 VIP OVERRIDES (FIXED WINNERS)
                            </span>
                            <button class="btn-arena" onclick="ZoneD.toggleVipOverride()" style="padding:4px 10px; font-size:10px; border-color:${this.vipOverrideExpanded ? 'var(--warning-color)' : '#555'}; color:${this.vipOverrideExpanded ? 'var(--warning-color)' : '#bbb'}; font-weight:700; cursor:pointer;">
                                ${this.vipOverrideExpanded ? '🔓 Hide Overrides' : '🔒 Unlock Overrides'}
                            </button>
                        </div>
                        ${this.vipOverrideExpanded ? `
                            <div style="margin-top:4px; font-size:11px; color:#aaa; margin-bottom:12px; line-height:1.4; padding:6px 8px; background:rgba(0,0,0,0.4); border-radius:4px; border-left:2px solid var(--warning-color);">
                                ⚠️ <b>Special Mode:</b> Guaranteed winner exact match. If left empty, that slot will draw randomly.
                            </div>
                            ${presetRows}
                        ` : ''}
                    </div>
                ` : `
                    <!-- Stage FX & Rules Tab -->
                    <div class="inspector-section" style="border-left: 3px solid var(--accent-cyan); background: rgba(0, 229, 163, 0.03);">
                        <div class="inspector-section-title"><span style="color:var(--accent-cyan);">Draw Rules</span></div>
                        <div class="inspector-row" style="justify-content: flex-start; gap: 16px;">
                            <span class="inspector-label" style="width:auto; color:#fff; font-weight:700;">Allow Duplicates (Repeat):</span>
                            <label class="ios-toggle-label" title="When turned on, the same winner can be picked multiple times across draws">
                                <input type="checkbox" class="ios-toggle-input" ${ds.allowDuplicates ? 'checked' : ''} onchange="ZoneD.updateGlobal('allowDuplicates', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                        </div>
                    </div>

                    <div class="inspector-section" style="border-left: 3px solid #ffaa00; background: rgba(255, 170, 0, 0.03);">
                        <div class="inspector-section-title"><span style="color:#ffaa00;">Stage Audio Rules (Col #${S.currentRound + 1})</span></div>
                        
                        <div class="inspector-row" style="justify-content: flex-start; gap: 12px;">
                            <span class="inspector-label" style="width:auto; color:#fff;">Spin Start Audio:</span>
                            <label class="ios-toggle-label" title="Auto play sound when spin starts for this column (Default: OFF)">
                                <input type="checkbox" class="ios-toggle-input" ${rc.audioSpinStart ? 'checked' : ''} onchange="ZoneD.updateRoundConfig('audioSpinStart', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                            <select onchange="ZoneD.updateRoundConfig('soundSpinStart', this.value)" style="background:#101018; border:1px solid var(--border-light); color:#fff; font-size:11px; border-radius:4px; padding:3px 6px; flex:1;">
                                <option value="drumroll" ${(rc.soundSpinStart || 'drumroll') === 'drumroll' ? 'selected' : ''}>🥁 Drumroll</option>
                                <option value="heartbeat" ${(rc.soundSpinStart) === 'heartbeat' ? 'selected' : ''}>💓 Heartbeat</option>
                                <option value="applause" ${(rc.soundSpinStart) === 'applause' ? 'selected' : ''}>👏 Applause</option>
                            </select>
                        </div>

                        <div class="inspector-row" style="justify-content: flex-start; gap: 12px;">
                            <span class="inspector-label" style="width:auto; color:#fff;">Win Reveal Audio:</span>
                            <label class="ios-toggle-label" title="Auto play sound when winner is revealed for this column (Default: OFF)">
                                <input type="checkbox" class="ios-toggle-input" ${rc.audioSpinStop ? 'checked' : ''} onchange="ZoneD.updateRoundConfig('audioSpinStop', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                            <select onchange="ZoneD.updateRoundConfig('soundSpinStop', this.value)" style="background:#101018; border:1px solid var(--border-light); color:#fff; font-size:11px; border-radius:4px; padding:3px 6px; flex:1;">
                                <option value="victory" ${(rc.soundSpinStop || 'victory') === 'victory' ? 'selected' : ''}>🎺 Victory Horn</option>
                                <option value="applause" ${(rc.soundSpinStop) === 'applause' ? 'selected' : ''}>👏 Applause</option>
                                <option value="drumroll" ${(rc.soundSpinStop) === 'drumroll' ? 'selected' : ''}>🥁 Drumroll</option>
                            </select>
                        </div>
                    </div>

                    <div class="inspector-section" style="border-left: 3px solid #00c3ff; background: rgba(0, 195, 255, 0.03);">
                        <div class="inspector-section-title" style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:#00c3ff;">Telegram Bot Rules (Col #${S.currentRound + 1})</span>
                            <span onclick="if(window.ZoneE && window.ZoneEStageControls) { ZoneE.setTab('pool'); ZoneEStageControls.setSubTab('telegram'); }" style="font-size:9px; color:#ffaa00; cursor:pointer; text-decoration:underline;">Configure Bot →</span>
                        </div>
                        
                        <div class="inspector-row" style="justify-content: flex-start; gap: 12px;">
                            <span class="inspector-label" style="width:auto; color:#fff;">Auto Send to Group:</span>
                            <label class="ios-toggle-label" title="Auto send announcement to Telegram Group when draw finishes (Default: OFF)">
                                <input type="checkbox" class="ios-toggle-input" ${rc.telegramAutoGroup ? 'checked' : ''} onchange="ZoneD.updateRoundConfig('telegramAutoGroup', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                            <span style="font-size:9px; color:var(--text-secondary); flex:1;">Sends announcement instantly to Group</span>
                        </div>

                        <div class="inspector-row" style="justify-content: flex-start; gap: 12px;">
                            <span class="inspector-label" style="width:auto; color:#fff;">Auto DM Winner:</span>
                            <label class="ios-toggle-label" title="Auto send direct DM/Chat to winner when draw finishes (Default: OFF)">
                                <input type="checkbox" class="ios-toggle-input" ${rc.telegramAutoDirect ? 'checked' : ''} onchange="ZoneD.updateRoundConfig('telegramAutoDirect', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                            <span style="font-size:9px; color:var(--text-secondary); flex:1;">Sends private DM to winner ID</span>
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>Glow Effect</span></div>
                        <div class="inspector-row" style="justify-content: flex-start; gap: 16px;">
                            <span class="inspector-label" style="width:auto;">Enable Glow:</span>
                            <label class="ios-toggle-label">
                                <input type="checkbox" class="ios-toggle-input" ${ds.winnerGlowEnabled ? 'checked' : ''} onchange="ZoneD.updateGlobal('winnerGlowEnabled', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                        </div>
                        <div class="inspector-row" style="justify-content: flex-start; gap: 16px;">
                            <span class="inspector-label" style="width:auto;">Color:</span>
                            <input type="color" value="${ds.winnerGlowColor || '#00e5a3'}" onchange="ZoneD.updateGlobal('winnerGlowColor', this.value)" style="height:26px; width:64px; padding:0; cursor:pointer; border-radius:13px; border:1px solid var(--border-light); background:var(--bg-elevated);">
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>Number Range</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Start:</span>
                            <input type="number" value="${ds.startNumber || 1}" onchange="ZoneD.updateGlobal('startNumber', this.value)">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">End:</span>
                            <input type="number" value="${ds.endNumber || 1000}" onchange="ZoneD.updateGlobal('endNumber', this.value)">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label" style="color:var(--accent-cyan); width:145px;" title="Sets leading zeros padding. E.g. setting 3 turns number 1 into 001">Leading Zeros (Padding):</span>
                            <input type="number" min="0" max="10" placeholder="0 = normal (e.g. 1)" value="${ds.numDigits || 0}" onchange="ZoneD.updateGlobal('numDigits', parseInt(this.value)||0)" style="flex:1; border: 1px solid var(--accent-cyan); color:var(--accent-cyan); font-weight:700;">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Exclude:</span>
                            <input type="text" placeholder="e.g. 13, 44, 101" value="${ds.excludeList || ''}" onchange="ZoneD.updateGlobal('excludeList', this.value)">
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>Background</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Image:</span>
                            <label class="btn-arena" style="flex:1; cursor:pointer;">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                                Upload Image
                                <input type="file" accept="image/*" style="display:none;" onchange="ZoneD.handleBgImageUpload(event)">
                            </label>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Video:</span>
                            <label class="btn-arena" style="flex:1; cursor:pointer;">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2" ry="2"/></svg>
                                Upload Video
                                <input type="file" accept="video/mp4,video/webm" style="display:none;" onchange="ZoneD.handleBgVideoUpload(event)">
                            </label>
                        </div>
                        ${S.settings.bgImage !== 'none' || S.settings.bgVideo ? `
                            <button class="btn-arena btn-arena-danger" onclick="ZoneD.clearBackground()" style="width:100%; margin-top:8px;">Reset Background</button>
                        ` : ''}
                    </div>
                `}
            </div>
        `;

        if (this.activeTab === 'pool' && window.ZoneDPoolManager) {
            ZoneDPoolManager.render(document.getElementById('zoneD_pool_container'));
        }
    },

    updateField(field, value) {
        const S = EngineState;
        if (!S.roundConfigs[S.currentRound]) S.roundConfigs[S.currentRound] = S.getDefaultRoundConfig(S.currentRound);
        S.roundConfigs[S.currentRound][field] = value;
        if (field === 'category') {
            const themeObj = S.getCategoryThemeObj(value);
            if (themeObj && themeObj.defaultPool) {
                S.roundConfigs[S.currentRound].dataSource = themeObj.defaultPool;
            }
        }
        S.syncSettingsFromConfigs();
        if (field === 'category' || field === 'dataSource') {
            Draw.initializePoolsSilently();
            if (window.Display) Display.resetDisplayForNewRound();
        }
        S.autoSaveAllSettings();

        if (window.ZoneA) ZoneA.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneC) ZoneC.render();
        this.render();
    },

    updatePreset(slotIndex, value) {
        const S = EngineState;
        if (!S.roundConfigs[S.currentRound]) S.roundConfigs[S.currentRound] = S.getDefaultRoundConfig(S.currentRound);
        if (!S.roundConfigs[S.currentRound].presets) S.roundConfigs[S.currentRound].presets = [];
        S.roundConfigs[S.currentRound].presets[slotIndex] = value ? value.trim() : null;
        S.syncSettingsFromConfigs();
        S.autoSaveAllSettings();
    },

    updateGlobal(field, value) {
        const S = EngineState;
        S.displaySettings[field] = value;
        if (field === 'numDigits') {
            S.settings.numDigits = parseInt(value) || 0;
        }
        S.syncSettingsFromConfigs();
        S.autoSaveAllSettings();

        if (window.Draw && ['startNumber', 'endNumber', 'numDigits', 'excludeList'].includes(field)) {
            Draw.initializePoolsSilently();
            if (window.Display) Display.resetDisplayForNewRound();
        }

        if (window.ZoneA) ZoneA.render();
        if (window.ZoneC) ZoneC.render();
        if (window.ZoneD) ZoneD.render();
    },

    addCategoryPrompt() {
        if (window.Studio) Studio.openCategoryManager();
    },

    handleBgImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            EngineState.tempBgFile = e.target.result;
            EngineState.displaySettings.bgType = 'image';
            EngineState.settings.bgImage = `url('${e.target.result}')`;
            EngineState.settings.bgVideo = null;
            if (window.ZoneC) ZoneC.applyBackground();
            this.render();
        };
        reader.readAsDataURL(file);
    },

    handleBgVideoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            EngineState.tempBgVideoFile = e.target.result;
            EngineState.displaySettings.bgType = 'video';
            EngineState.settings.bgVideo = e.target.result;
            EngineState.settings.bgImage = 'none';
            if (window.ZoneC) ZoneC.applyBackground();
            this.render();
        };
        reader.readAsDataURL(file);
    },

    clearBackground() {
        EngineState.tempBgFile = null;
        EngineState.tempBgVideoFile = null;
        EngineState.displaySettings.bgType = 'image';
        EngineState.settings.bgImage = 'none';
        EngineState.settings.bgVideo = null;
        if (window.ZoneC) ZoneC.applyBackground();
        this.render();
    }
};
