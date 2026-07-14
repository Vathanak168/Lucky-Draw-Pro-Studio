/**
 * zoneD_inspector.js - Bottom Center: Dashboard / Clip Inspector
 * Resolume Arena 7 tabbed inspector: Round Slot properties, Preset Dropdowns, Winner Table, and Stage FX.
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
            let dropdownOptions = `<option value="">Random</option>`;
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
                        <input type="text" placeholder="${rc.dataSource === 'numeric' ? 'Number' : (rc.dataSource === 'id' ? 'ID / Ticket' : 'Participant Name')}" value="${currentVal.replace(/"/g, '&quot;')}" onchange="ZoneD.updatePreset(${i}, this.value)" style="flex:1; font-size:11px; padding:4px;">
                    `}
                </div>
            `;
        }

        // Build the read-only winner table. Redraw controls live in Zone E.
        let winnerTableHtml = '';
        if (winners && winners.length > 0) {
            let rowsHtml = '';
            winners.forEach((w, idx) => {
                if (!w) return;
                rowsHtml += `
                    <tr>
                        <td style="font-family:var(--font-mono); color:var(--text-secondary); width:50px;">#${idx + 1}</td>
                        <td style="font-weight:700; color:var(--accent-cyan);">${w.name}</td>
                    </tr>
                `;
            });
            winnerTableHtml = `
                <div class="inspector-section" style="border-color:var(--accent-cyan); background:rgba(18,207,255,0.035);">
                    <div class="inspector-section-title">
                        <span style="color:var(--accent-cyan);">Winners (${winners.length})</span>
                    </div>
                    <table class="winner-table">
                        <thead><tr><th>#</th><th>Winner</th></tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
        }

        el.innerHTML = `
            <div class="arena-panel-header">
                <div class="arena-panel-title">
                    <i data-lucide="panel-right" class="highlight"></i>
                    Inspector · <span class="highlight">Round #${S.currentRound + 1}</span>
                </div>
            </div>

            <!-- Dashboard Tabs -->
            <div class="arena-tab-bar">
                <button class="arena-tab-btn ${this.activeTab === 'round' ? 'active' : ''}" onclick="ZoneD.setTab('round')">
                    Round Settings
                </button>
                <button class="arena-tab-btn ${this.activeTab === 'fx' ? 'active' : ''}" onclick="ZoneD.setTab('fx')">
                    Rules & Automation
                </button>
                <button class="arena-tab-btn ${this.activeTab === 'pool' ? 'active' : ''}" onclick="ZoneD.setTab('pool')" style="color:var(--accent-cyan); font-weight:800; display:flex; align-items:center; gap:6px;">
                    <i data-lucide="users" style="width:14px; height:14px;"></i>
                    Participants
                </button>
            </div>

            <!-- Inspector Body -->
            <div class="inspector-body" style="${this.activeTab === 'pool' ? 'padding:0; overflow:hidden;' : ''}">
                ${this.activeTab === 'pool' ? `
                    <div id="zoneD_pool_container" style="height:100%; display:flex; flex-direction:column;"></div>
                ` : this.activeTab === 'round' ? `
                    ${winnerTableHtml}

                    <div class="inspector-section" style="border:1px solid var(--accent-cyan); background:rgba(18, 207, 255, 0.04);">
                        <div class="inspector-section-title" style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:var(--accent-cyan); font-size:11px; font-weight:800;">Prize Category</span>
                            <button class="btn-arena" onclick="ZoneA.manageCategoriesPrompt()" style="padding:1px 6px; font-size:9px; border-color:var(--border-light); color:#ddd;">
                                <i data-lucide="tags"></i> Categories
                            </button>
                        </div>
                        <div class="inspector-row" style="margin-top:6px;">
                            <span class="inspector-label" style="font-weight:700; color:#fff;">Prize Category</span>
                            <select onchange="ZoneD.updateField('category', this.value)" style="flex:1; font-weight:700; color:var(--accent-cyan); background:var(--bg-elevated); padding:6px; border:1px solid var(--accent-cyan);">
                                ${S.prizeCategories.map(cat => `<option value="${cat.replace(/"/g, '&quot;')}" ${rc.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                            </select>
                            <button class="btn-arena" onclick="ZoneD.addCategoryPrompt()" title="Add Prize Category" style="padding:4px 8px; font-size:12px; font-weight:800; color:var(--accent-cyan);">
                                <i data-lucide="plus"></i>
                            </button>
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>Draw Setup</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Draw Source</span>
                            <select onchange="ZoneD.updateField('dataSource', this.value)" style="flex:1;">
                                <option value="numeric" ${rc.dataSource === 'numeric' ? 'selected' : ''}>Number Range</option>
                                <option value="list" ${rc.dataSource === 'list' ? 'selected' : ''}>Participant Name</option>
                                <option value="id" ${rc.dataSource === 'id' ? 'selected' : ''}>ID Ticket</option>
                            </select>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Winner Count</span>
                            <div style="display:flex; gap:6px; flex:1;">
                                <input type="number" min="1" max="100" value="${rc.winnerCount || 1}" onchange="ZoneD.updateField('winnerCount', parseInt(this.value)||1)" style="flex:1;">
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 1)" style="padding:2px 8px;">1</button>
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 3)" style="padding:2px 8px;">3</button>
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 5)" style="padding:2px 8px;">5</button>
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 10)" style="padding:2px 8px;">10</button>
                            </div>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Winner Layout</span>
                            <select onchange="ZoneD.updateField('layoutMode', this.value)" style="flex:1; background: #1a1a24; color: var(--accent-blue);">
                                <option value="grid" selected>Grid Boxes</option>
                            </select>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Reveal Style</span>
                            <select onchange="ZoneD.updateField('animationStyle', this.value)" style="flex:1; background: #1a1a24; color: var(--accent-blue);">
                                <option value="simultaneous" selected>Simultaneous</option>
                            </select>
                        </div>
                    </div>

                    <div class="inspector-section" style="border: 1px dashed ${this.vipOverrideExpanded ? 'var(--warning-color)' : '#444'}; background: ${this.vipOverrideExpanded ? 'rgba(245, 158, 11, 0.04)' : 'transparent'};">
                        <div class="inspector-section-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:${this.vipOverrideExpanded ? '10px' : '0'};">
                            <span style="color:${this.vipOverrideExpanded ? 'var(--warning-color)' : '#888'}; font-weight:800; font-size:11px;">
                                Preset Winners
                            </span>
                            <button class="btn-arena" onclick="ZoneD.toggleVipOverride()" style="padding:4px 10px; font-size:10px; border-color:${this.vipOverrideExpanded ? 'var(--warning-color)' : '#555'}; color:${this.vipOverrideExpanded ? 'var(--warning-color)' : '#bbb'}; font-weight:700; cursor:pointer;">
                                ${this.vipOverrideExpanded ? '<i data-lucide="check"></i> Done' : '<i data-lucide="pencil"></i> Edit'}
                            </button>
                        </div>
                        ${this.vipOverrideExpanded ? `
                            ${presetRows}
                        ` : ''}
                    </div>
                ` : `
                    <!-- Stage FX & Rules Tab -->
                    <div class="inspector-section" style="border-left: 3px solid var(--accent-purple); background: rgba(165, 92, 255, 0.035);">
                        <div class="inspector-section-title"><span style="color:var(--accent-purple);">Draw Rules</span></div>
                        <div class="inspector-row" style="justify-content: flex-start; gap: 16px;">
                            <span class="inspector-label" style="width:auto; color:#fff; font-weight:700;">Allow Repeat Winners</span>
                            <label class="ios-toggle-label" title="Allow Repeat Winners">
                                <input type="checkbox" class="ios-toggle-input" ${ds.allowDuplicates ? 'checked' : ''} onchange="ZoneD.updateGlobal('allowDuplicates', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                        </div>
                    </div>

                    <div class="inspector-section" style="border-left: 3px solid var(--warning-color); background: rgba(255, 179, 64, 0.035);">
                        <div class="inspector-section-title"><span style="color:var(--warning-color);">Sounds · Round #${S.currentRound + 1}</span></div>
                        
                        <div class="inspector-row" style="justify-content: flex-start; gap: 12px;">
                            <span class="inspector-label" style="width:auto; color:#fff;">Draw Start Sound</span>
                            <label class="ios-toggle-label" title="Draw Start Sound">
                                <input type="checkbox" class="ios-toggle-input" ${rc.audioSpinStart ? 'checked' : ''} onchange="ZoneD.updateRoundConfig('audioSpinStart', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                            <select onchange="ZoneD.updateRoundConfig('soundSpinStart', this.value)" style="background:#101018; border:1px solid var(--border-light); color:#fff; font-size:11px; border-radius:4px; padding:3px 6px; flex:1;">
                                <option value="drumroll" ${(rc.soundSpinStart || 'drumroll') === 'drumroll' ? 'selected' : ''}>Drumroll</option>
                                <option value="heartbeat" ${(rc.soundSpinStart) === 'heartbeat' ? 'selected' : ''}>Heartbeat</option>
                                <option value="applause" ${(rc.soundSpinStart) === 'applause' ? 'selected' : ''}>Applause</option>
                            </select>
                        </div>

                        <div class="inspector-row" style="justify-content: flex-start; gap: 12px;">
                            <span class="inspector-label" style="width:auto; color:#fff;">Winner Sound</span>
                            <label class="ios-toggle-label" title="Winner Sound">
                                <input type="checkbox" class="ios-toggle-input" ${rc.audioSpinStop ? 'checked' : ''} onchange="ZoneD.updateRoundConfig('audioSpinStop', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                            <select onchange="ZoneD.updateRoundConfig('soundSpinStop', this.value)" style="background:#101018; border:1px solid var(--border-light); color:#fff; font-size:11px; border-radius:4px; padding:3px 6px; flex:1;">
                                <option value="victory" ${(rc.soundSpinStop || 'victory') === 'victory' ? 'selected' : ''}>Fanfare</option>
                                <option value="applause" ${(rc.soundSpinStop) === 'applause' ? 'selected' : ''}>Applause</option>
                                <option value="drumroll" ${(rc.soundSpinStop) === 'drumroll' ? 'selected' : ''}>Drumroll</option>
                            </select>
                        </div>
                    </div>

                    <div class="inspector-section" style="border-left: 3px solid var(--accent-cyan); background: rgba(18, 207, 255, 0.035);">
                        <div class="inspector-section-title" style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:var(--accent-cyan);">Telegram · Round #${S.currentRound + 1}</span>
                            <button class="btn-arena" onclick="if(window.ZoneE) { ZoneEStageControls.activeSubTab = 'telegram'; ZoneE.setTab('pool'); }" style="padding:2px 7px; font-size:10px;">Settings</button>
                        </div>
                        
                        <div class="inspector-row" style="justify-content: flex-start; gap: 12px;">
                            <span class="inspector-label" style="width:auto; color:#fff;">Send to Group</span>
                            <label class="ios-toggle-label" title="Send to Group">
                                <input type="checkbox" class="ios-toggle-input" ${rc.telegramAutoGroup ? 'checked' : ''} onchange="ZoneD.updateRoundConfig('telegramAutoGroup', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                        </div>

                        <div class="inspector-row" style="justify-content: flex-start; gap: 12px;">
                            <span class="inspector-label" style="width:auto; color:#fff;">Message Winner</span>
                            <label class="ios-toggle-label" title="Message Winner">
                                <input type="checkbox" class="ios-toggle-input" ${rc.telegramAutoDirect ? 'checked' : ''} onchange="ZoneD.updateRoundConfig('telegramAutoDirect', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>Winner Glow</span></div>
                        <div class="inspector-row" style="justify-content: flex-start; gap: 16px;">
                            <span class="inspector-label" style="width:auto;">Glow</span>
                            <label class="ios-toggle-label">
                                <input type="checkbox" class="ios-toggle-input" ${ds.winnerGlowEnabled ? 'checked' : ''} onchange="ZoneD.updateGlobal('winnerGlowEnabled', this.checked)">
                                <span class="ios-toggle-switch"></span>
                            </label>
                        </div>
                        <div class="inspector-row" style="justify-content: flex-start; gap: 16px;">
                            <span class="inspector-label" style="width:auto;">Color</span>
                            <input type="color" value="${ds.winnerGlowColor || '#00e5a3'}" onchange="ZoneD.updateGlobal('winnerGlowColor', this.value)" style="height:26px; width:64px; padding:0; cursor:pointer; border-radius:13px; border:1px solid var(--border-light); background:var(--bg-elevated);">
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>Number Range</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Start</span>
                            <input type="number" value="${ds.startNumber || 1}" onchange="ZoneD.updateGlobal('startNumber', this.value)">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">End</span>
                            <input type="number" value="${ds.endNumber || 1000}" onchange="ZoneD.updateGlobal('endNumber', this.value)">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label" style="color:var(--accent-cyan); width:145px;">Leading Zeros</span>
                            <input type="number" min="0" max="10" value="${ds.numDigits || 0}" onchange="ZoneD.updateGlobal('numDigits', parseInt(this.value)||0)" style="flex:1; border: 1px solid var(--accent-cyan); color:var(--accent-cyan); font-weight:700;">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Excluded Numbers</span>
                            <input type="text" value="${ds.excludeList || ''}" onchange="ZoneD.updateGlobal('excludeList', this.value)">
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>Background</span></div>
                        <div class="inspector-row">
                             <span class="inspector-label">Image</span>
                            <label class="btn-arena" style="flex:1; cursor:pointer;">
                                <i data-lucide="image-up" aria-hidden="true"></i>
                                 Choose Image
                                <input type="file" accept="image/*" style="display:none;" onchange="ZoneD.handleBgImageUpload(event)">
                            </label>
                        </div>
                        <div class="inspector-row">
                             <span class="inspector-label">Video</span>
                            <label class="btn-arena" style="flex:1; cursor:pointer;">
                                <i data-lucide="video" aria-hidden="true"></i>
                                 Choose Video
                                <input type="file" accept="video/mp4,video/webm" style="display:none;" onchange="ZoneD.handleBgVideoUpload(event)">
                            </label>
                        </div>
                        ${S.settings.bgImage !== 'none' || S.settings.bgVideo ? `
                             <button class="btn-arena btn-arena-danger" onclick="ZoneD.clearBackground()" style="width:100%; margin-top:8px;">Remove Background</button>
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

    updateRoundConfig(field, value) {
        const S = EngineState;
        if (!S.roundConfigs[S.currentRound]) S.roundConfigs[S.currentRound] = S.getDefaultRoundConfig(S.currentRound);
        S.roundConfigs[S.currentRound][field] = value;
        S.syncSettingsFromConfigs();
        S.autoSaveAllSettings();
        this.render();
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

    async handleBgImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const asset = await DesktopStorage.uploadBackgroundAsset(file, 'image');
            EngineState.setBackgroundAsset(asset);
            if (window.ZoneC) ZoneC.applyBackground();
            this.render();
        } catch (error) {
            console.error('Background image import failed:', error);
            alert(`Background image could not be loaded: ${error.message}`);
        } finally {
            event.target.value = '';
        }
    },

    async handleBgVideoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const asset = await DesktopStorage.uploadBackgroundAsset(file, 'video');
            EngineState.setBackgroundAsset(asset);
            if (window.ZoneC) ZoneC.applyBackground();
            this.render();
        } catch (error) {
            console.error('Background video import failed:', error);
            alert(`Background video could not be loaded: ${error.message}`);
        } finally {
            event.target.value = '';
        }
    },

    clearBackground() {
        EngineState.clearBackgroundAsset();
        if (window.ZoneC) ZoneC.applyBackground();
        this.render();
    }
};
