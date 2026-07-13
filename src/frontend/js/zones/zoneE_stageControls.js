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
                    🔄 Redraw
                </button>
                <button onclick="ZoneEStageControls.setSubTab('quota')" class="btn-arena ${this.activeSubTab === 'quota' ? 'btn-arena-primary' : ''}" style="flex:1; padding:6px 2px; font-size:9.5px; font-weight:700;">
                    🏆 Quota
                </button>
                <button onclick="ZoneEStageControls.setSubTab('audio')" class="btn-arena ${this.activeSubTab === 'audio' ? 'btn-arena-primary' : ''}" style="flex:1; padding:6px 2px; font-size:9.5px; font-weight:700;">
                    🔊 Audio
                </button>
                <button onclick="ZoneEStageControls.setSubTab('telegram')" class="btn-arena ${this.activeSubTab === 'telegram' ? 'btn-arena-primary' : ''}" style="flex:1; padding:6px 2px; font-size:9.5px; font-weight:700;">
                    📲 Telegram
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
                    <span>Target: Col #${currentRoundIdx + 1} (${S.settings.roundCategories ? S.settings.roundCategories[currentRoundIdx] || 'Draw' : 'Draw'})</span>
                    <span style="font-size:10px; color:var(--text-secondary);">Absentee Override</span>
                </div>
                <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;">
                    Click <b style="color:#ff5252;">Redraw</b> next to an absent winner to spin and replace <b>ONLY that specific card box</b> while keeping present winners untouched.
                </div>
            </div>
        `;

        if (!roundResult || !roundResult.winners || roundResult.winners.length === 0) {
            return html + `
                <div style="border:1px dashed var(--border-light); border-radius:4px; padding:28px 12px; text-align:center; color:var(--text-muted); font-size:11px;">
                    No winners drawn yet for Col #${currentRoundIdx + 1}.<br>Spin the deck above first!
                </div>
            `;
        }

        html += `<div style="display:flex; flex-direction:column; gap:6px;">`;
        roundResult.winners.forEach((winner, idx) => {
            const name = winner ? (winner.name || winner.id || 'N/A') : 'N/A';
            const idStr = winner ? (winner.id || '') : '';
            html += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:4px;">
                    <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden;">
                        <span style="font-size:10px; color:var(--accent-cyan); font-weight:700;">Slot #${idx + 1}</span>
                        <span style="font-size:12px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${name}">${name}</span>
                        ${idStr ? `<span style="font-size:9px; color:var(--text-secondary);">${idStr}</span>` : ''}
                    </div>
                    <button onclick="ZoneEStageControls.triggerRedraw(${currentRoundIdx}, ${idx})" title="Disqualify this absentee and redraw Slot #${idx + 1}" style="background:rgba(255,82,82,0.15); border:1px solid #ff5252; color:#ff5252; padding:5px 10px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.2s;">
                        <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                        Redraw
                    </button>
                </div>
            `;
        });
        html += `</div>`;
        return html;
    },

    triggerRedraw(roundIdx, slotIdx) {
        if (!confirm(`⚠️ Are you sure you want to REDRAW Slot #${slotIdx + 1}? The current winner will be replaced ONLY in this box.`)) return;
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
                <div style="font-size:11px; font-weight:700; color:var(--accent-cyan);">🏆 Category Quota Tracker (Operator View)</div>
                <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">
                    Set quotas to track drawn vs remaining items. Strictly for operator CRUD management (no public images).
                </div>
            </div>

            <!-- Add Category Bar -->
            <div style="display:flex; gap:6px; margin-bottom:12px;">
                <input id="new_cat_name_input" type="text" placeholder="New Category Name..." style="flex:2; background:#101018; border:1px solid var(--border-light); border-radius:4px; padding:5px 8px; color:#fff; font-size:11px;">
                <input id="new_cat_quota_input" type="number" placeholder="Qty" value="10" style="flex:1; background:#101018; border:1px solid var(--border-light); border-radius:4px; padding:5px 6px; color:#fff; font-size:11px; text-align:center;">
                <button onclick="ZoneEStageControls.addCategory()" class="btn-arena btn-arena-primary" style="padding:5px 10px; font-size:11px; font-weight:700;">+ Add</button>
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
                        <button onclick="ZoneEStageControls.deleteCategory(${idx})" title="Delete Category" style="background:transparent; border:none; color:#ff5252; cursor:pointer; font-size:12px; padding:2px 4px;">✕</button>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:space-between; font-size:10px;">
                        <div style="display:flex; align-items:center; gap:4px;">
                            <span style="color:var(--text-secondary);">Quota:</span>
                            <input type="number" value="${quota}" onchange="ZoneEStageControls.updateQuota('${cat}', this.value)" style="width:50px; background:#101018; border:1px solid var(--border-light); border-radius:3px; padding:2px 4px; color:#fff; font-size:11px; text-align:center;">
                        </div>
                        <div style="font-size:10px; font-weight:600; color:${isFull ? '#ff5252' : '#00e5a3'};">
                            Drawn: ${drawn} / ${quota} (${remaining} Left)
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
        if (!confirm("Are you sure you want to delete this Category?")) return;
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
                <div style="font-size:11px; font-weight:700; color:var(--accent-cyan);">🔊 Live FX Soundboard</div>
                <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">
                    Click pads for instant stage audio effects during events or transitions.
                </div>
            </div>

            <!-- Soundboard Trigger Pads -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px;">
                <button onclick="AudioSynth.playDrumroll()" class="btn-arena" style="padding:14px 10px; font-size:12px; font-weight:700; display:flex; flex-direction:column; align-items:center; gap:6px; background:#181824; border:1px solid var(--border-light);">
                    <span style="font-size:18px;">🥁</span> Drumroll
                </button>
                <button onclick="AudioSynth.playApplause()" class="btn-arena" style="padding:14px 10px; font-size:12px; font-weight:700; display:flex; flex-direction:column; align-items:center; gap:6px; background:#181824; border:1px solid var(--border-light);">
                    <span style="font-size:18px;">👏</span> Applause
                </button>
                <button onclick="AudioSynth.playFanfare()" class="btn-arena" style="padding:14px 10px; font-size:12px; font-weight:700; display:flex; flex-direction:column; align-items:center; gap:6px; background:#181824; border:1px solid var(--border-light);">
                    <span style="font-size:18px;">🎺</span> Victory Horn
                </button>
                <button onclick="AudioSynth.playHeartbeat()" class="btn-arena" style="padding:14px 10px; font-size:12px; font-weight:700; display:flex; flex-direction:column; align-items:center; gap:6px; background:#181824; border:1px solid var(--border-light);">
                    <span style="font-size:18px;">💓</span> Heartbeat
                </button>
            </div>

            <!-- Quick Link & Global Override -->
            <div style="background:rgba(255,170,0,0.06); border:1px solid rgba(255,170,0,0.3); border-radius:4px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                <div style="font-size:11px; font-weight:700; color:#ffaa00; display:flex; align-items:center; justify-content:space-between;">
                    <span>⚡ Per-Round Audio Rules</span>
                    <button onclick="if(window.ZoneD) { ZoneD.setTab('inspector'); ZoneD.render(); }" class="btn-arena" style="padding:3px 8px; font-size:10px; font-weight:700; border-color:#ffaa00; color:#ffaa00; cursor:pointer;">Go to Effects & Rules →</button>
                </div>
                <div style="font-size:10px; color:var(--text-secondary); line-height:1.4;">
                    Per user rule, auto-audio toggles are moved to <b>Effects & Rules (Zone D)</b> using iOS toggle switches (OFF by default) so you can easily configure distinct sound effects per round/column!
                </div>
            </div>
        `;
    }
};
