/**
 * zoneA_deck.js - Top Half: Deck Matrix Grid & Columns
 * Displays Category Deck tabs and horizontally scrollable Round Column Slots.
 * Resolume Arena 7 1-to-1 visual layout.
 */
window.ZoneA = {
    init() {
        this.render();
    },

    render() {
        const S = EngineState;
        const el = document.getElementById('zoneA_deckMatrix');
        if (!el) return;

        const totalRounds = S.totalRounds;
        const roundConfigs = S.roundConfigs;
        const activeTab = S.activeCategoryTab || "All";

        // Deck Category Tabs HTML
        let tabsHtml = `
            <button class="deck-tab-btn ${activeTab === 'All' ? 'active' : ''}" onclick="ZoneA.selectCategoryTab('All')">ALL DECKS (${totalRounds})</button>
        `;
        S.prizeCategories.forEach(cat => {
            const count = roundConfigs.filter(rc => rc.category === cat).length;
            tabsHtml += `
                <button class="deck-tab-btn ${activeTab === cat ? 'active' : ''}" onclick="ZoneA.selectCategoryTab('${cat.replace(/'/g, "\\'")}')">
                    ${cat.toUpperCase()} (${count})
                </button>
            `;
        });
        tabsHtml += `
            <button class="deck-tab-btn" onclick="ZoneD.setTab('round'); ZoneD.addCategoryPrompt();" title="Create New Category Deck" style="border:1px dashed var(--border-light); color:var(--accent-cyan);">
                + ADD DECK
            </button>
        `;

        // Columns Grid HTML
        let columnsHtml = '';
        let displayedCount = 0;

        for (let i = 0; i < totalRounds; i++) {
            const rc = roundConfigs[i] || S.getDefaultRoundConfig(i);
            const category = rc.category || 'Regular Draw';

            if (activeTab !== "All" && category !== activeTab) continue;
            displayedCount++;

            const isActive = (i === S.currentRound);
            const roundResult = S.roundResults[i];
            const isCompleted = !!roundResult;
            const isDrawing = (S.isDrawing && isActive);
            const winCount = roundResult ? roundResult.winners.length : 0;
            const targetWinCount = rc.winnerCount || 1;

            let statusPill = `<span style="color:var(--success-color); background:rgba(16,185,129,0.15); padding:2px 6px; border-radius:3px; font-size:9px;">READY</span>`;
            if (isDrawing) {
                statusPill = `<span style="color:var(--accent-blue); background:rgba(0,180,216,0.2); padding:2px 6px; border-radius:3px; font-size:9px;">DRAWING...</span>`;
            } else if (isCompleted) {
                statusPill = `<span style="color:var(--warning-color); background:rgba(245,158,11,0.2); padding:2px 6px; border-radius:3px; font-size:9px;">DONE (${winCount})</span>`;
            }

            columnsHtml += `
                <div class="arena-column-slot ${isActive ? 'active' : ''} ${isDrawing ? 'drawing' : ''}" onclick="ZoneA.selectSlot(${i})">
                    <div>
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                            <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-secondary);">COLUMN ${i + 1}</span>
                            ${statusPill}
                        </div>
                        <div style="font-size:13px; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${category}
                        </div>
                        <div style="font-size:11px; color:var(--accent-cyan); margin-top:2px;">
                            ${targetWinCount} ${targetWinCount > 1 ? 'Winners' : 'Winner'}
                        </div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">
                            ${rc.dataSource === 'numeric' ? 'Numeric Range' : 'Name List'} · ${rc.animationStyle}
                        </div>
                    </div>

                    <div style="margin-top:12px; padding-top:8px; border-top:1px solid var(--border-light); display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-size:10px; color:var(--text-secondary);">
                            Slot: <span style="color:#fff;">#${i + 1}</span>
                        </span>
                        <div style="display:flex; gap:4px;">
                            <button class="btn-arena" onclick="event.stopPropagation(); ZoneA.duplicateSlot(${i})" style="padding:2px 6px; font-size:10px;">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                            </button>
                            ${totalRounds > 1 ? `
                            <button class="btn-arena btn-arena-danger" onclick="event.stopPropagation(); ZoneA.deleteSlot(${i})" style="padding:2px 6px; font-size:10px;">
                                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        if (displayedCount === 0) {
            columnsHtml = `<div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:12px;">No slots created inside "${activeTab}". Click "Add Column" above.</div>`;
        }

        el.innerHTML = `
            <div class="arena-panel-header">
                <div class="arena-panel-title">
                    <svg class="svg-icon highlight" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    Composition Matrix · <span class="highlight">${totalRounds} Columns</span>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="btn-arena btn-arena-primary" onclick="ZoneA.addSlot()">
                        <svg class="svg-icon" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>
                        Add Column
                    </button>
                </div>
            </div>
            <div class="arena-deck-tabs">${tabsHtml}</div>
            <div class="columns-grid-container">${columnsHtml}</div>
        `;
    },

    selectCategoryTab(tab) {
        EngineState.activeCategoryTab = tab;
        EngineState.autoSaveAllSettings();
        this.render();
    },

    selectSlot(index) {
        if (EngineState.isDrawing) return;
        EngineState.currentRound = index;

        // Reset stage output or reveal instant winners if already drawn
        const roundResult = EngineState.roundResults[index];
        Display.resetDisplayForNewRound();
        if (roundResult && roundResult.winners && roundResult.winners.length > 0) {
            Display.showWinnersInstantly(roundResult.winners);
        }

        EngineState.saveDrawState();
        this.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneC) ZoneC.render();
        if (window.ZoneD) ZoneD.render();
    },

    addSlot() {
        const S = EngineState;
        S.totalRounds++;
        S.ensureRoundConfigs(S.totalRounds);
        if (S.activeCategoryTab && S.activeCategoryTab !== "All") {
            S.roundConfigs[S.totalRounds - 1].category = S.activeCategoryTab;
        }
        S.syncSettingsFromConfigs();
        S.autoSaveAllSettings();
        this.selectSlot(S.totalRounds - 1);
    },

    deleteSlot(index) {
        const S = EngineState;
        if (S.totalRounds <= 1) return;
        if (!confirm(`Delete Column #${index + 1}?`)) return;

        S.roundConfigs.splice(index, 1);
        S.totalRounds--;
        if (S.currentRound >= S.totalRounds) S.currentRound = S.totalRounds - 1;
        S.ensureRoundConfigs(S.totalRounds);
        S.syncSettingsFromConfigs();
        S.autoSaveAllSettings();

        Display.resetDisplayForNewRound();
        this.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneD) ZoneD.render();
    },

    duplicateSlot(index) {
        const S = EngineState;
        const src = S.roundConfigs[index];
        if (!src) return;
        const newConfig = JSON.parse(JSON.stringify(src));
        S.roundConfigs.splice(index + 1, 0, newConfig);
        S.totalRounds++;
        S.ensureRoundConfigs(S.totalRounds);
        S.syncSettingsFromConfigs();
        S.autoSaveAllSettings();
        this.selectSlot(index + 1);
    }
};
