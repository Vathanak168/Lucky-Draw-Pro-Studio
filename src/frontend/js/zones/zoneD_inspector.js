/**
 * zoneD_inspector.js - Bottom Center: Dashboard / Clip Inspector
 * Resolume Arena 7 tabbed inspector: Round Slot properties, Preset Dropdowns, Winner Re-Draw Table, and Stage FX.
 */
window.ZoneD = {
    activeTab: 'round', // 'round' or 'fx'

    init() {
        this.render();
    },

    setTab(tabName) {
        this.activeTab = tabName;
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
            let dropdownOptions = `<option value="">-- Random Draw --</option>`;
            if (rc.dataSource === 'list') {
                currentPoolList.forEach(p => {
                    const sel = (p.name === currentVal) ? 'selected' : '';
                    dropdownOptions += `<option value="${p.name.replace(/"/g, '&quot;')}" ${sel}>${p.name}</option>`;
                });
            }

            presetRows += `
                <div class="inspector-row">
                    <span class="inspector-label" style="font-size:10px; color:var(--text-secondary);">Slot #${i + 1} Override:</span>
                    ${rc.dataSource === 'list' && currentPoolList.length > 0 && currentPoolList.length <= 500 ? `
                        <select onchange="ZoneD.updatePreset(${i}, this.value)" style="flex:1; font-size:11px; padding:4px;">
                            ${dropdownOptions}
                        </select>
                    ` : `
                        <input type="text" placeholder="${rc.dataSource === 'numeric' ? 'Enter VIP Number...' : 'Type exact name...'}" value="${currentVal.replace(/"/g, '&quot;')}" onchange="ZoneD.updatePreset(${i}, this.value)" style="flex:1; font-size:11px; padding:4px;">
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
                                RE-DRAW
                            </button>
                        </td>
                    </tr>
                `;
            });
            winnerTableHtml = `
                <div class="inspector-section" style="border-color:var(--accent-cyan); background:rgba(0,229,163,0.03);">
                    <div class="inspector-section-title">
                        <span style="color:var(--accent-cyan);">🎯 DRAWN WINNERS FOR THIS COLUMN (${winners.length})</span>
                    </div>
                    <table class="winner-table">
                        <thead><tr><th>Slot</th><th>Winner Name / Number</th><th style="text-align:right;">Granular Control</th></tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
        }

        el.innerHTML = `
            <div class="arena-panel-header">
                <div class="arena-panel-title">
                    <svg class="svg-icon highlight" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                    DASHBOARD INSPECTOR · <span class="highlight">COLUMN #${S.currentRound + 1} PROPERTIES</span>
                </div>
            </div>

            <!-- Dashboard Tabs -->
            <div class="arena-tab-bar">
                <button class="arena-tab-btn ${this.activeTab === 'round' ? 'active' : ''}" onclick="ZoneD.setTab('round')">
                    ROUND SLOT PROPERTIES
                </button>
                <button class="arena-tab-btn ${this.activeTab === 'fx' ? 'active' : ''}" onclick="ZoneD.setTab('fx')">
                    STAGE FX & DASHBOARD RULES
                </button>
            </div>

            <!-- Inspector Body -->
            <div class="inspector-body">
                ${this.activeTab === 'round' ? `
                    ${winnerTableHtml}

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>📝 COLUMN IDENTIFICATION</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Category Deck:</span>
                            <select onchange="ZoneD.updateField('category', this.value)" style="flex:1;">
                                ${S.prizeCategories.map(cat => `<option value="${cat.replace(/"/g, '&quot;')}" ${rc.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>🎯 DRAW CONFIGURATION KNOBS</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Data Source:</span>
                            <select onchange="ZoneD.updateField('dataSource', this.value)" style="flex:1;">
                                <option value="list" ${rc.dataSource === 'list' ? 'selected' : ''}>Name</option>
                                <option value="numeric" ${rc.dataSource === 'numeric' ? 'selected' : ''}>Number</option>
                            </select>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Winner Count:</span>
                            <div style="display:flex; gap:6px; flex:1;">
                                <input type="number" min="1" max="100" value="${rc.winnerCount || 1}" onchange="ZoneD.updateField('winnerCount', parseInt(this.value)||1)" style="flex:1;">
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 1)" style="padding:2px 8px;">1</button>
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 3)" style="padding:2px 8px;">3</button>
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 5)" style="padding:2px 8px;">5</button>
                                <button class="btn-arena" onclick="ZoneD.updateField('winnerCount', 10)" style="padding:2px 8px;">10</button>
                            </div>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Stage Layout:</span>
                            <select onchange="ZoneD.updateField('layoutMode', this.value)" style="flex:1; background: #1a1a24; color: #00e5a3;">
                                <option value="grid" selected>Grid Boxes (Multi-Box Stage)</option>
                            </select>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Animation Mode:</span>
                            <select onchange="ZoneD.updateField('animationStyle', this.value)" style="flex:1; background: #1a1a24; color: #00e5a3;">
                                <option value="simultaneous" selected>Simultaneous All-Box Draw</option>
                            </select>
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>⭐ PRESET WINNERS (VIP OVERRIDES)</span></div>
                        ${presetRows}
                    </div>
                ` : `
                    <!-- Stage FX & Rules Tab -->
                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>✨ NEON GLOW & STAGE AESTHETICS</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Enable Neon Glow:</span>
                            <input type="checkbox" ${ds.winnerGlowEnabled ? 'checked' : ''} onchange="ZoneD.updateGlobal('winnerGlowEnabled', this.checked)">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Winner Glow Color:</span>
                            <input type="color" value="${ds.winnerGlowColor || '#00e5a3'}" onchange="ZoneD.updateGlobal('winnerGlowColor', this.value)" style="height:28px; width:60px; padding:0; cursor:pointer;">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Allow Duplicates:</span>
                            <input type="checkbox" ${ds.allowDuplicates ? 'checked' : ''} onchange="ZoneD.updateGlobal('allowDuplicates', this.checked)">
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>Number Configuration</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Start Number:</span>
                            <input type="number" value="${ds.startNumber || 1}" onchange="ZoneD.updateGlobal('startNumber', this.value)">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">End Number:</span>
                            <input type="number" value="${ds.endNumber || 1000}" onchange="ZoneD.updateGlobal('endNumber', this.value)">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label" style="color:var(--accent-cyan);">Digit Padding (e.g. 6=000001):</span>
                            <input type="number" min="0" max="10" value="${ds.numDigits || 0}" onchange="ZoneD.updateGlobal('numDigits', parseInt(this.value)||0)" style="border: 2px solid var(--accent-cyan);">
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Exclude Numbers:</span>
                            <input type="text" placeholder="e.g. 13, 44, 101" value="${ds.excludeList || ''}" onchange="ZoneD.updateGlobal('excludeList', this.value)">
                        </div>
                    </div>

                    <div class="inspector-section">
                        <div class="inspector-section-title"><span>🖼️ STAGE WALLPAPER & VIDEO BACKGROUND</span></div>
                        <div class="inspector-row">
                            <span class="inspector-label">Custom Image:</span>
                            <label class="btn-arena" style="flex:1; cursor:pointer;">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                                UPLOAD IMAGE
                                <input type="file" accept="image/*" style="display:none;" onchange="ZoneD.handleBgImageUpload(event)">
                            </label>
                        </div>
                        <div class="inspector-row">
                            <span class="inspector-label">Looping Video:</span>
                            <label class="btn-arena" style="flex:1; cursor:pointer;">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2" ry="2"/></svg>
                                UPLOAD MP4/WEBM
                                <input type="file" accept="video/mp4,video/webm" style="display:none;" onchange="ZoneD.handleBgVideoUpload(event)">
                            </label>
                        </div>
                        ${S.settings.bgImage !== 'none' || S.settings.bgVideo ? `
                            <button class="btn-arena btn-arena-danger" onclick="ZoneD.clearBackground()" style="width:100%; margin-top:8px;">RESET BACKGROUND TO ARENA DARK</button>
                        ` : ''}
                    </div>
                `}
            </div>
        `;
    },

    updateField(field, value) {
        const S = EngineState;
        if (!S.roundConfigs[S.currentRound]) S.roundConfigs[S.currentRound] = S.getDefaultRoundConfig(S.currentRound);
        S.roundConfigs[S.currentRound][field] = value;
        S.syncSettingsFromConfigs();
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
        const name = prompt("Enter new Category Deck name (e.g. ⭐ VIP Rounds, 🏆 Grand Prizes):");
        if (name && name.trim()) {
            if (!EngineState.prizeCategories.includes(name.trim())) {
                EngineState.prizeCategories.push(name.trim());
                EngineState.autoSaveAllSettings();
                if (window.ZoneA) ZoneA.selectCategoryTab(name.trim());
            }
        }
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
