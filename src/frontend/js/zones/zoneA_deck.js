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
            <button class="deck-tab-btn ${activeTab === 'All' ? 'active' : ''}" onclick="ZoneA.selectCategoryTab('All')">All (${totalRounds})</button>
        `;
        S.prizeCategories.forEach(cat => {
            const count = roundConfigs.filter(rc => rc.category === cat).length;
            const badgeColor = S.getCategoryColor(cat);
            const isEmptyStyle = count === 0 ? 'opacity:0.45; filter:grayscale(0.5);' : '';
            tabsHtml += `
                <button class="deck-tab-btn ${activeTab === cat ? 'active' : ''}" onclick="ZoneA.selectCategoryTab('${cat.replace(/'/g, "\\'")}')" style="display:inline-flex; align-items:center; gap:6px; ${isEmptyStyle}">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${badgeColor};"></span>
                    ${cat} (${count})
                </button>
            `;
        });
        tabsHtml += `
            <button class="deck-tab-btn" onclick="Studio.openCategoryManager()" title="Prize Categories" style="border:1px dashed var(--accent-cyan); color:var(--accent-cyan); font-weight:800; display:inline-flex; align-items:center; gap:4px;">
                <i data-lucide="tags"></i> Prize Categories
            </button>
        `;

        // Columns Grid HTML
        let columnsHtml = '';
        let displayedCount = 0;

        for (let i = 0; i < totalRounds; i++) {
            const rc = roundConfigs[i] || S.getDefaultRoundConfig(i);
            const category = rc.category || 'Draw';

            if (activeTab !== "All" && category !== activeTab) continue;
            displayedCount++;

            const isActive = (i === S.currentRound);
            const roundResult = S.roundResults[i];
            const isCompleted = !!roundResult;
            const isDrawing = (S.isDrawing && isActive);
            const winCount = roundResult ? roundResult.winners.length : 0;
            const targetWinCount = rc.winnerCount || 1;

            let statusPill = `<span style="color:var(--success-color); background:rgba(48,209,88,0.12); padding:2px 6px; border-radius:999px; font-size:10px;">Ready</span>`;
            if (isDrawing) {
                statusPill = `<span style="color:var(--accent-blue); background:rgba(100,210,255,0.12); padding:2px 6px; border-radius:999px; font-size:10px;">Drawing</span>`;
            } else if (isCompleted) {
                statusPill = `<span style="color:var(--warning-color); background:rgba(255,159,10,0.12); padding:2px 6px; border-radius:999px; font-size:10px;">Completed (${winCount})</span>`;
            }

            columnsHtml += `
                <div class="arena-column-slot ${isActive ? 'active' : ''} ${isDrawing ? 'drawing' : ''}" 
                     data-round-index="${i}"
                     draggable="true"
                     ondragstart="ZoneA.onDragStart(event, ${i})"
                     ondragover="ZoneA.onDragOver(event)"
                     ondragleave="ZoneA.onDragLeave(event)"
                     ondrop="ZoneA.onDrop(event, ${i})"
                     onclick="ZoneA.selectSlot(${i})"
                     title="Reorder Round">
                    <div>
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                            <span style="display:flex; align-items:center; gap:4px; font-family:var(--font-mono); font-size:10px; color:var(--text-secondary);">
                                <i data-lucide="grip-vertical" style="cursor:grab; opacity:0.6;"></i> Round #${i + 1}
                            </span>
                            ${statusPill}
                        </div>
                        <div style="font-size:13px; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:5px;">
                            <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${S.getCategoryColor(category)}; flex-shrink:0;"></span>
                            <span>${category}</span>
                        </div>
                        <div style="font-size:11px; color:var(--accent-cyan); margin-top:2px;">
                            ${targetWinCount} ${targetWinCount > 1 ? 'Winners' : 'Winner'}
                        </div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">
                            ${rc.dataSource === 'numeric' ? 'Number Range' : (rc.dataSource === 'id' ? 'ID Ticket' : 'Participant Name')} · ${rc.animationStyle}
                        </div>
                    </div>

                    <div style="margin-top:12px; padding-top:8px; border-top:1px solid var(--border-light); display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-size:10px; color:var(--text-secondary);">
                             Round <span style="color:#fff;">#${i + 1}</span>
                        </span>
                        <div style="display:flex; gap:4px;">
                            <button class="btn-arena" onclick="event.stopPropagation(); ZoneA.duplicateSlot(${i})" title="Duplicate Round" aria-label="Duplicate Round" style="padding:2px 6px; font-size:10px;">
                                <i data-lucide="copy-plus"></i>
                            </button>
                            ${totalRounds > 1 ? `
                            <button class="btn-arena btn-arena-danger" onclick="event.stopPropagation(); ZoneA.deleteSlot(${i})" title="Delete Round" style="padding:2px 6px; font-size:10px;">
                                <i data-lucide="trash-2"></i>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        if (displayedCount === 0) {
            columnsHtml = `<div class="ui-empty-state" style="flex:1; display:flex; align-items:center; justify-content:center;">No Rounds</div>`;
        }

        el.innerHTML = `
            <div class="arena-panel-header">
                <div class="arena-panel-title">
                    <svg class="svg-icon highlight" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    Draw Rounds · <span class="highlight">${totalRounds} ${totalRounds === 1 ? 'Round' : 'Rounds'}</span>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="btn-arena btn-arena-primary" onclick="ZoneA.addSlot()">
                        <svg class="svg-icon" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>
                        Add Round
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
        
        // Auto-sync selection: if clicking a specific Category, automatically select the first Column inside that Category
        if (tab !== 'All') {
            const firstIdx = EngineState.roundConfigs.findIndex(rc => rc.category === tab);
            if (firstIdx !== -1) {
                this.selectSlot(firstIdx);
                return;
            }
        }
        
        this.render();
    },

    selectSlot(index) {
        if (EngineState.isDrawing) return;
        EngineState.currentRound = index;
        Draw.initializePoolsSilently();

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
            const themeObj = S.getCategoryThemeObj(S.activeCategoryTab);
            if (themeObj && themeObj.defaultPool) {
                S.roundConfigs[S.totalRounds - 1].dataSource = themeObj.defaultPool;
            }
        }
        S.syncSettingsFromConfigs();
        S.autoSaveAllSettings();
        this.selectSlot(S.totalRounds - 1);
    },

    deleteSlot(index) {
        const S = EngineState;
        if (S.totalRounds <= 1) return;
        if (!confirm(`Delete Round ${index + 1}?`)) return;

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
        if (S.isDrawing) {
            this.showActionStatus('Finish the current draw first', 'warning');
            return;
        }

        const src = S.roundConfigs[index];
        if (!src) return;

        const previousRoundCount = S.totalRounds;
        const insertIndex = index + 1;
        const newConfig = JSON.parse(JSON.stringify(src));
        S.roundConfigs.splice(insertIndex, 0, newConfig);

        if (!Array.isArray(S.roundResults)) S.roundResults = [];
        while (S.roundResults.length < previousRoundCount) S.roundResults.push(null);
        S.roundResults.splice(insertIndex, 0, null);
        S.roundResults.forEach((result, resultIndex) => {
            if (result) result.round = resultIndex + 1;
        });

        if (Array.isArray(S.historyEvents)) {
            S.historyEvents.forEach(historyEvent => {
                if (Number.isInteger(historyEvent?.roundIndex) && historyEvent.roundIndex >= insertIndex) {
                    historyEvent.roundIndex += 1;
                    historyEvent.round = historyEvent.roundIndex + 1;
                }
            });
        }

        S.totalRounds = previousRoundCount + 1;
        S.ensureRoundConfigs(S.totalRounds);
        S.syncSettingsFromConfigs();
        S.drawCompletedThisRound = false;
        S.autoSaveAllSettings();
        this.selectSlot(insertIndex);
        this.revealSlot(insertIndex);
        this.showActionStatus(`Round #${insertIndex + 1} duplicated`, 'success');
    },

    revealSlot(index) {
        requestAnimationFrame(() => {
            const slot = document.querySelector(`#zoneA_deckMatrix .arena-column-slot[data-round-index="${index}"]`);
            if (slot) slot.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
    },

    showActionStatus(message, state = 'success') {
        if (!document.body) return;
        const existing = document.getElementById('roundActionToast');
        if (existing) existing.remove();
        if (this.actionStatusTimer) clearTimeout(this.actionStatusTimer);

        const toast = document.createElement('div');
        toast.id = 'roundActionToast';
        toast.className = 'round-action-toast';
        toast.dataset.state = state;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;
        document.body.appendChild(toast);

        this.actionStatusTimer = setTimeout(() => {
            toast.remove();
            this.actionStatusTimer = null;
        }, 2200);
    },

    // ---- Drag and Drop Column Reordering (Point 8) ----
    draggedIndex: null,

    onDragStart(event, index) {
        if (EngineState.isDrawing) {
            event.preventDefault();
            return;
        }
        this.draggedIndex = index;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', index);
        const slotEl = event.currentTarget;
        setTimeout(() => { if (slotEl) slotEl.classList.add('dragging'); }, 0);
    },

    onDragOver(event) {
        if (this.draggedIndex === null || EngineState.isDrawing) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const slotEl = event.currentTarget;
        if (slotEl && !slotEl.classList.contains('drag-over')) {
            slotEl.classList.add('drag-over');
        }
    },

    onDragLeave(event) {
        const slotEl = event.currentTarget;
        if (slotEl) slotEl.classList.remove('drag-over');
    },

    onDrop(event, targetIndex) {
        event.preventDefault();
        const slotEl = event.currentTarget;
        if (slotEl) slotEl.classList.remove('drag-over');

        const fromIndex = this.draggedIndex;
        this.draggedIndex = null;
        if (fromIndex === null || fromIndex === targetIndex || EngineState.isDrawing) {
            this.render();
            return;
        }

        const success = EngineState.reorderRoundSlots(fromIndex, targetIndex);
        if (success) {
            this.render();
            if (window.ZoneB) ZoneB.render();
            if (window.ZoneC) ZoneC.render();
            if (window.ZoneD) ZoneD.render();
        }
    },

    // ---- Category Decks Manager ----
    manageCategoriesPrompt() {
        if (window.Studio) Studio.openCategoryManager();
    }
};
