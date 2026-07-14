/**
 * zoneE_stageControls.js - Resolume Arena 7 Stage & FX Hub
 * Standalone modular controller for:
 * 1. Slot Redraw Control (Redraw individual absentee winner without touching other slots)
 * 2. Category Quota & Inventory CRUD (Operator-only tracking without images/public screen)
 * 3. Audio Soundboard & Auto-Play configuration
 */
window.ZoneEStageControls = {
    activeSubTab: 'redraw', // 'redraw', 'quota', or 'audio'

    setSubTab(tab) {
        this.activeSubTab = tab;
        if (window.ZoneE) ZoneE.render();
    },

    render(containerEl) {
        if (!containerEl) return;
        const S = EngineState;

        containerEl.innerHTML = `
            <div style="display:flex; gap:4px; margin-bottom:10px; border-bottom:1px solid var(--border-light); padding-bottom:6px;">
                <button onclick="ZoneEStageControls.setSubTab('redraw')" class="btn-arena ${this.activeSubTab === 'redraw' ? 'btn-arena-primary' : ''}" style="flex:1; padding:6px 2px; font-size:9.5px; font-weight:700;">
                    Redraw
                </button>
                <button onclick="ZoneEStageControls.setSubTab('quota')" class="btn-arena ${this.activeSubTab === 'quota' ? 'btn-arena-primary' : ''}" style="flex:1; padding:6px 2px; font-size:9.5px; font-weight:700;">
                    Prize Progress
                </button>
                <button onclick="ZoneEStageControls.setSubTab('audio')" class="btn-arena ${this.activeSubTab === 'audio' ? 'btn-arena-primary' : ''}" style="flex:1; padding:6px 2px; font-size:9.5px; font-weight:700;">
                    Soundboard
                </button>
                <button onclick="ZoneEStageControls.setSubTab('telegram')" class="btn-arena ${this.activeSubTab === 'telegram' ? 'btn-arena-primary' : ''}" style="flex:1; padding:6px 2px; font-size:9.5px; font-weight:700;">
                    Telegram
                </button>
            </div>

            <div class="stage-controls-content" style="max-height:430px; overflow-y:auto; padding-right:2px;">
                ${this.activeSubTab === 'redraw' ? this.renderRedrawTab(S) : ''}
                ${this.activeSubTab === 'quota' ? this.renderQuotaTab(S) : ''}
                ${this.activeSubTab === 'audio' ? this.renderAudioTab(S) : ''}
                ${this.activeSubTab === 'telegram' ? '<div id="tg_subtab_container"></div>' : ''}
            </div>
        `;

        if (this.activeSubTab === 'telegram' && window.ZoneETelegramBot) {
            ZoneETelegramBot.render(containerEl.querySelector('#tg_subtab_container'));
        }
    },

    // --- 1. SLOT REDRAW CONTROL ---
    renderRedrawTab(S) {
        const currentRoundIdx = S.currentRound || 0;
        const roundResult = S.roundResults[currentRoundIdx];

        let html = `
            <div style="background:var(--bg-surface); padding:8px 10px; border-radius:4px; border:1px solid var(--border-light); margin-bottom:10px;">
                <div style="font-size:11px; font-weight:700; color:var(--accent-cyan); display:flex; justify-content:space-between; align-items:center;">
                    <span>Round #${currentRoundIdx + 1} · ${S.settings.roundCategories ? S.settings.roundCategories[currentRoundIdx] || 'Draw' : 'Draw'}</span>
                    <span style="font-size:10px; color:var(--text-secondary);">Winner Replacement</span>
                </div>
            </div>
        `;

        if (!roundResult || !roundResult.winners || roundResult.winners.length === 0) {
            return html + `
                <div class="ui-empty-state" style="border:1px dashed var(--border-light); border-radius:4px; padding:28px 12px;">No Winners</div>
            `;
        }

        html += `<div style="display:flex; flex-direction:column; gap:6px;">`;
        roundResult.winners.forEach((winner, idx) => {
            const name = winner ? (winner.name || winner.id || 'N/A') : 'N/A';
            const idStr = winner ? (winner.id || '') : '';
            html += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:4px;">
                    <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden;">
                        <span style="font-size:10px; color:var(--accent-cyan); font-weight:700;">Winner #${idx + 1}</span>
                        <span style="font-size:12px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${name}">${name}</span>
                        ${idStr ? `<span style="font-size:9px; color:var(--text-secondary);">${idStr}</span>` : ''}
                    </div>
                    <button onclick="ZoneEStageControls.triggerRedraw(${currentRoundIdx}, ${idx})" title="Redraw Winner" style="background:rgba(255,82,82,0.15); border:1px solid #ff5252; color:#ff5252; padding:5px 10px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.2s;">
                        <i data-lucide="rotate-ccw"></i>
                        Redraw
                    </button>
                </div>
            `;
        });
        html += `</div>`;
        return html;
    },

    triggerRedraw(roundIdx, slotIdx) {
        if (!confirm(`Redraw Winner #${slotIdx + 1}? The current winner will be replaced.`)) return;
        if (typeof Draw !== 'undefined' && typeof Draw.replaceWinnerAt === 'function') {
            Draw.replaceWinnerAt(roundIdx, slotIdx);
        }
    },

    // --- 2. CATEGORY QUOTA & INVENTORY CRUD ---
    renderQuotaTab(S) {
        const categories = S.prizeCategories || ["General"];
        const quotas = S.categoryQuotas || {};

        // Calculate drawn per category across all round results
        const drawnCounts = {};
        categories.forEach(cat => drawnCounts[cat] = 0);
        (S.roundResults || []).forEach(r => {
            if (r && r.winners && r.category) {
                drawnCounts[r.category] = (drawnCounts[r.category] || 0) + r.winners.length;
            }
        });

        let html = `
            <div style="background:var(--bg-surface); padding:8px 10px; border-radius:4px; border:1px solid var(--border-light); margin-bottom:10px;">
                <div style="font-size:11px; font-weight:700; color:var(--accent-cyan);">Prize Progress</div>
            </div>

            <!-- Add Category Bar -->
            <div style="display:flex; gap:6px; margin-bottom:12px;">
                <input id="new_cat_name_input" type="text" placeholder="Prize Category" style="flex:2; background:#101018; border:1px solid var(--border-light); border-radius:4px; padding:5px 8px; color:#fff; font-size:11px;">
                <input id="new_cat_quota_input" type="number" placeholder="Target" value="10" style="flex:1; background:#101018; border:1px solid var(--border-light); border-radius:4px; padding:5px 6px; color:#fff; font-size:11px; text-align:center;">
                <button onclick="ZoneEStageControls.addCategory()" class="btn-arena btn-arena-primary" style="padding:5px 10px; font-size:11px; font-weight:700;"><i data-lucide="plus"></i> Add</button>
            </div>

            <div style="display:flex; flex-direction:column; gap:6px;">
        `;

        categories.forEach((cat, idx) => {
            const quota = parseInt(quotas[cat]) || 0;
            const drawn = parseInt(drawnCounts[cat]) || 0;
            const remaining = Math.max(0, quota - drawn);
            const isFull = (drawn >= quota && quota > 0);

            html += `
                <div style="display:flex; flex-direction:column; gap:6px; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:4px; ${isFull ? 'border-left:3px solid #ff5252;' : 'border-left:3px solid var(--accent-cyan);'}">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                        <input type="text" value="${cat}" onchange="ZoneEStageControls.renameCategory(${idx}, this.value)" style="background:transparent; border:none; border-bottom:1px dashed #444; color:#fff; font-weight:700; font-size:12px; flex:1; padding:2px 0;">
                        <button onclick="ZoneEStageControls.deleteCategory(${idx})" title="Delete Prize Category" style="background:transparent; border:none; color:#ff5252; cursor:pointer; font-size:12px; padding:2px 4px;"><i data-lucide="trash-2" aria-hidden="true"></i></button>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:space-between; font-size:10px;">
                        <div style="display:flex; align-items:center; gap:4px;">
                            <span style="color:var(--text-secondary);">Target</span>
                            <input type="number" value="${quota}" onchange="ZoneEStageControls.updateQuota('${cat}', this.value)" style="width:50px; background:#101018; border:1px solid var(--border-light); border-radius:3px; padding:2px 4px; color:#fff; font-size:11px; text-align:center;">
                        </div>
                        <div style="font-size:10px; font-weight:600; color:${isFull ? '#ff5252' : '#00e5a3'};">
                            ${drawn} Drawn · ${remaining} Remaining
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        return html;
    },

    addCategory() {
        const nameInput = document.getElementById('new_cat_name_input');
        const quotaInput = document.getElementById('new_cat_quota_input');
        if (!nameInput || !quotaInput) return;
        const name = nameInput.value.trim();
        const quota = parseInt(quotaInput.value) || 10;
        if (!name) return;

        const S = EngineState;
        if (!S.prizeCategories.includes(name)) {
            S.prizeCategories.push(name);
            if (!S.categoryQuotas) S.categoryQuotas = {};
            S.categoryQuotas[name] = quota;
            if (typeof S.saveCategoryQuotas === 'function') S.saveCategoryQuotas(S.categoryQuotas);
            if (typeof S.autoSaveAllSettings === 'function') S.autoSaveAllSettings();
        }
        if (window.ZoneE) ZoneE.render();
    },

    updateQuota(catName, newVal) {
        const S = EngineState;
        if (!S.categoryQuotas) S.categoryQuotas = {};
        S.categoryQuotas[catName] = parseInt(newVal) || 0;
        if (typeof S.saveCategoryQuotas === 'function') S.saveCategoryQuotas(S.categoryQuotas);
        if (typeof S.autoSaveAllSettings === 'function') S.autoSaveAllSettings();
        if (window.ZoneE) ZoneE.render();
    },

    renameCategory(idx, newName) {
        newName = newName.trim();
        if (!newName) return;
        const S = EngineState;
        const oldName = S.prizeCategories[idx];
        if (!oldName || oldName === newName) return;

        S.prizeCategories[idx] = newName;
        if (S.categoryQuotas && S.categoryQuotas[oldName] !== undefined) {
            S.categoryQuotas[newName] = S.categoryQuotas[oldName];
            delete S.categoryQuotas[oldName];
            if (typeof S.saveCategoryQuotas === 'function') S.saveCategoryQuotas(S.categoryQuotas);
        }
        if (typeof S.autoSaveAllSettings === 'function') S.autoSaveAllSettings();
        if (window.ZoneE) ZoneE.render();
    },

    deleteCategory(idx) {
        if (!confirm("Delete this Prize Category?")) return;
        const S = EngineState;
        const oldName = S.prizeCategories[idx];
        S.prizeCategories.splice(idx, 1);
        if (S.categoryQuotas && S.categoryQuotas[oldName] !== undefined) {
            delete S.categoryQuotas[oldName];
            if (typeof S.saveCategoryQuotas === 'function') S.saveCategoryQuotas(S.categoryQuotas);
        }
        if (typeof S.autoSaveAllSettings === 'function') S.autoSaveAllSettings();
        if (window.ZoneE) ZoneE.render();
    },

    // --- 3. AUDIO SOUNDBOARD & AUTO-PLAY ---
    renderAudioTab(S) {
        return `
            <div style="background:var(--bg-surface); padding:8px 10px; border-radius:4px; border:1px solid var(--border-light); margin-bottom:10px;">
                <div style="font-size:11px; font-weight:700; color:var(--accent-cyan);">Soundboard</div>
            </div>

            <!-- Soundboard Trigger Pads -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px;">
                <button onclick="AudioSynth.playDrumroll()" class="btn-arena" style="padding:14px 10px; font-size:12px; font-weight:700; display:flex; flex-direction:column; align-items:center; gap:6px; background:#181824; border:1px solid var(--border-light);">
                    <i data-lucide="audio-lines" class="icon-lg"></i> Drumroll
                </button>
                <button onclick="AudioSynth.playApplause()" class="btn-arena" style="padding:14px 10px; font-size:12px; font-weight:700; display:flex; flex-direction:column; align-items:center; gap:6px; background:#181824; border:1px solid var(--border-light);">
                    <i data-lucide="hand" class="icon-lg"></i> Applause
                </button>
                <button onclick="AudioSynth.playFanfare()" class="btn-arena" style="padding:14px 10px; font-size:12px; font-weight:700; display:flex; flex-direction:column; align-items:center; gap:6px; background:#181824; border:1px solid var(--border-light);">
                    <i data-lucide="party-popper" class="icon-lg"></i> Fanfare
                </button>
                <button onclick="AudioSynth.playHeartbeat()" class="btn-arena" style="padding:14px 10px; font-size:12px; font-weight:700; display:flex; flex-direction:column; align-items:center; gap:6px; background:#181824; border:1px solid var(--border-light);">
                    <i data-lucide="heart-pulse" class="icon-lg"></i> Heartbeat
                </button>
            </div>

            <!-- Quick Link & Global Override -->
            <div style="background:rgba(255,170,0,0.06); border:1px solid rgba(255,170,0,0.3); border-radius:4px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                <div style="font-size:11px; font-weight:700; color:#ffaa00; display:flex; align-items:center; justify-content:space-between;">
                    <span>Round Sounds</span>
                    <button onclick="if(window.ZoneD) { ZoneD.setTab('fx'); }" class="btn-arena" style="padding:3px 8px; font-size:10px; font-weight:700; border-color:#ffaa00; color:#ffaa00; cursor:pointer;">Rules & Automation</button>
                </div>
            </div>
        `;
    }
};
