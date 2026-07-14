/**
 * zoneE_telegramBot.js - Live Stage Telegram Broadcast & Direct DM Hub
 * Standalone modular controller for:
 * 1. Showing draw results instantly (`បង្ហាញទិន្នន័យដែលបាន Draw ចប់ភ្លាមៗ`)
 * 2. Sending announcements to Public Group/Channel or directly to User Account (`Send ចូល Group ឬឆាតទៅ Account User ផ្ទាល់តែម្តង`)
 * 3. Per-round auto-broadcast execution when enabled in Effects & Rules (`អាចផ្លាស់ប្តូរទៅបើកលើវគ្គណាមួយក៏បាន`)
 */
window.ZoneETelegramBot = {
    getSettings() {
        const S = EngineState;
        if (!S.telegramSettings) S.telegramSettings = { botToken: '', groupChatId: '' };
        return S.telegramSettings;
    },

    async saveSettings(botToken, groupChatId) {
        const S = EngineState;
        if (!S.telegramSettings) S.telegramSettings = {};
        if (botToken !== undefined) S.telegramSettings.botToken = botToken.trim();
        if (groupChatId !== undefined) S.telegramSettings.groupChatId = groupChatId.trim();
        try {
            await DesktopStorage.updateSettings({ telegramSettings: S.telegramSettings });
        } catch (error) {
            console.error('Telegram settings save failed:', error);
        }
    },

    render(containerEl) {
        if (!containerEl) return;
        const S = EngineState;
        const cfg = this.getSettings();
        const currentRoundIdx = S.currentRound || 0;
        const roundResult = S.roundResults[currentRoundIdx];
        const category = (S.settings && S.settings.roundCategories) ? S.settings.roundCategories[currentRoundIdx] || `Round #${currentRoundIdx + 1}` : `Round #${currentRoundIdx + 1}`;

        let html = `
            <div style="background:var(--bg-surface); padding:8px 10px; border-radius:4px; border:1px solid var(--border-light); margin-bottom:10px;">
                <div style="font-size:11px; font-weight:700; color:var(--accent-cyan); display:flex; justify-content:space-between; align-items:center;">
                    <span>Telegram</span>
                    <span style="font-size:10px; color:#ffaa00;">Round #${currentRoundIdx + 1} · ${category}</span>
                </div>
            </div>

            <!-- Bot Token & Group ID Config -->
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:4px; padding:8px; margin-bottom:12px; display:flex; flex-direction:column; gap:6px;">
                <div style="font-size:10px; font-weight:700; color:#fff;">Credentials</div>
                <div style="display:flex; gap:6px;">
                    <input id="tg_bot_token_input" type="password" value="${cfg.botToken || ''}" placeholder="Bot Token" style="flex:2; background:#101018; border:1px solid var(--border-light); border-radius:3px; padding:4px 6px; color:#fff; font-size:10px;">
                    <input id="tg_group_id_input" type="text" value="${cfg.groupChatId || ''}" placeholder="Group Chat ID" style="flex:1.5; background:#101018; border:1px solid var(--border-light); border-radius:3px; padding:4px 6px; color:#fff; font-size:10px;">
                    <button onclick="ZoneETelegramBot.handleSaveConfig()" class="btn-arena btn-arena-primary" style="padding:4px 8px; font-size:10px; font-weight:700;">Save</button>
                </div>
            </div>
        `;

        // Check if there are winners in current draw round
        if (!roundResult || !roundResult.winners || roundResult.winners.length === 0) {
            html += `
                <div class="ui-empty-state" style="border:1px dashed var(--border-light); border-radius:4px; padding:24px 10px;">No Winners</div>
            `;
            return containerEl.innerHTML = html;
        }

        // Bulk Actions Bar
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,229,163,0.05); border:1px solid rgba(0,229,163,0.3); border-radius:4px; padding:6px 8px; margin-bottom:8px;">
                <span style="font-size:10px; font-weight:700; color:#00e5a3;">${roundResult.winners.length} Winners</span>
                <button onclick="ZoneETelegramBot.broadcastAllWinners(${currentRoundIdx})" class="btn-arena btn-arena-primary" style="padding:4px 10px; font-size:10px; font-weight:700;">
                    <i data-lucide="send"></i> Send All
                </button>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px; max-height:280px; overflow-y:auto; padding-right:2px;">
        `;

        roundResult.winners.forEach((winner, idx) => {
            if (!winner) return;
            const name = winner.name || winner.id || 'N/A';
            const idStr = winner.id || '';
            const tgAccount = winner.telegram || winner.phone || winner.chat_id || winner.telegram_id || idStr;

            html += `
                <div style="display:flex; flex-direction:column; gap:6px; padding:8px; background:rgba(255,255,255,0.02); border:1px solid var(--border-light); border-radius:4px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; flex-direction:column; overflow:hidden;">
                            <span style="font-size:12px; font-weight:700; color:#fff;">Winner #${idx + 1}: ${name}</span>
                            <span style="font-size:9px; color:var(--text-secondary);">ID: ${idStr}</span>
                        </div>
                        <div style="display:flex; gap:4px;">
                            <button onclick="ZoneETelegramBot.sendSingleToGroup(${currentRoundIdx}, ${idx})" title="Send to Group" style="background:rgba(0,229,163,0.15); border:1px solid #00e5a3; color:#00e5a3; padding:4px 8px; border-radius:3px; font-size:10px; font-weight:700; cursor:pointer;">
                                <i data-lucide="send"></i> Group
                            </button>
                            <button onclick="ZoneETelegramBot.sendDirectToUser(${currentRoundIdx}, ${idx})" title="Message Winner" style="background:rgba(0,195,255,0.15); border:1px solid #00c3ff; color:#00c3ff; padding:4px 8px; border-radius:3px; font-size:10px; font-weight:700; cursor:pointer;">
                                <i data-lucide="message-circle"></i> Message
                            </button>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <span style="font-size:9px; color:var(--text-secondary);">Telegram Account</span>
                        <input type="text" id="tg_user_input_${currentRoundIdx}_${idx}" value="${tgAccount}" placeholder="Username / Chat ID" style="flex:1; background:#101018; border:1px solid var(--border-light); border-radius:3px; padding:2px 6px; color:#fff; font-size:10px;" onchange="ZoneETelegramBot.updateUserTelegram(${currentRoundIdx}, ${idx}, this.value)">
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        containerEl.innerHTML = html;
    },

    handleSaveConfig() {
        const tokenIn = document.getElementById('tg_bot_token_input');
        const groupIn = document.getElementById('tg_group_id_input');
        if (!tokenIn || !groupIn) return;
        this.saveSettings(tokenIn.value, groupIn.value);
        alert('Telegram settings saved.');
        if (window.ZoneE) ZoneE.render();
    },

    updateUserTelegram(roundIdx, winnerIdx, newVal) {
        const S = EngineState;
        const r = S.roundResults[roundIdx];
        if (r && r.winners && r.winners[winnerIdx]) {
            r.winners[winnerIdx].telegram = newVal.trim();
            S.saveDrawState();
        }
    },

    async sendTelegramAPI(chatId, text) {
        const cfg = this.getSettings();
        const token = cfg.botToken;
        if (!token) {
            alert('Telegram Bot Token is required.');
            return false;
        }
        if (!chatId) {
            alert('Group Chat ID is required.');
            return false;
        }

        try {
            const url = `https://api.telegram.org/bot${token}/sendMessage`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    parse_mode: 'HTML'
                })
            });
            const data = await resp.json();
            if (data && data.ok) {
                return true;
            } else {
                console.error("Telegram API Error:", data);
                alert(`Telegram error: ${data.description || 'Unknown error'}`);
                return false;
            }
        } catch (err) {
            console.error("Network or CORS Error:", err);
            alert('Telegram connection failed. Check the internet connection and Bot Token.');
            return false;
        }
    },

    async sendSingleToGroup(roundIdx, winnerIdx) {
        const S = EngineState;
        const r = S.roundResults[roundIdx];
        if (!r || !r.winners || !r.winners[winnerIdx]) return;
        const w = r.winners[winnerIdx];
        const category = r.category || `Round ${roundIdx + 1}`;
        const cfg = this.getSettings();
        if (!cfg.groupChatId) {
            alert("Group Chat ID is required.");
            return;
        }

        const msg = `🎉 <b>CONGRATULATIONS!</b> 🎉\n\n🏆 <b>Winner:</b> ${w.name || w.id}\n🆔 <b>ID:</b> ${w.id || 'N/A'}\n🎁 <b>Prize Category:</b> ${category}\n\n🚀 <i>Lucky Draw Pro Studio Live Stage</i>`;
        const success = await this.sendTelegramAPI(cfg.groupChatId, msg);
        if (success) alert(`Announcement sent for ${w.name}.`);
    },

    async sendDirectToUser(roundIdx, winnerIdx) {
        const S = EngineState;
        const r = S.roundResults[roundIdx];
        if (!r || !r.winners || !r.winners[winnerIdx]) return;
        const w = r.winners[winnerIdx];
        const category = r.category || `Round ${roundIdx + 1}`;
        
        const inputEl = document.getElementById(`tg_user_input_${roundIdx}_${winnerIdx}`);
        const userChatId = inputEl ? inputEl.value.trim() : (w.telegram || w.phone || w.id);
        if (!userChatId) {
            alert(`Telegram username or Chat ID is required for ${w.name}.`);
            return;
        }

        const msg = `🎉 <b>CONGRATULATIONS ${w.name || 'Winner'}!</b> 🎉\n\nYou have just won: <b>${category}</b> in our Live Stage Lucky Draw!\n\n📍 Please proceed immediately to the stage to verify your identity and claim your prize.\n\n🚀 <i>Lucky Draw Pro Studio</i>`;
        const success = await this.sendTelegramAPI(userChatId, msg);
        if (success) alert(`💬 Direct DM sent to ${w.name} (${userChatId}) successfully!`);
    },

    async broadcastAllWinners(roundIdx) {
        const S = EngineState;
        const r = S.roundResults[roundIdx];
        if (!r || !r.winners || r.winners.length === 0) return;
        const category = r.category || `Round ${roundIdx + 1}`;
        const cfg = this.getSettings();
        if (!cfg.groupChatId) {
            alert("Group Chat ID is required.");
            return;
        }

        let msg = `🎉 <b>OFFICIAL RESULTS: ${category}</b> 🎉\n\n`;
        r.winners.forEach((w, i) => {
            if (w) {
                msg += `<b>#${i + 1}.</b> ${w.name || w.id} (<code>${w.id || 'N/A'}</code>)\n`;
            }
        });
        msg += `\n🚀 <i>Lucky Draw Pro Studio Live Stage</i>`;

        const success = await this.sendTelegramAPI(cfg.groupChatId, msg);
        if (success) alert(`📢 Broadcasted all ${r.winners.length} winners to Group successfully!`);
    },

    // --- AUTO-BROADCAST HOOK (Called on draw finish if enabled in Effects & Rules) ---
    async executeAutoRoundBroadcast(winners, category) {
        if (!winners || winners.length === 0) return;
        const cfg = this.getSettings();
        if (!cfg.botToken || !cfg.groupChatId) return;

        let msg = `🎉 <b>INSTANT WINNER ANNOUNCEMENT: ${category}</b> 🎉\n\n`;
        winners.forEach((w, i) => {
            if (w) {
                msg += `🏆 <b>Winner:</b> ${w.name || w.id} (<code>${w.id || 'N/A'}</code>)\n`;
            }
        });
        msg += `\n🚀 <i>Lucky Draw Pro Studio Live Stage</i>`;

        // Send quietly in background without annoying alerts
        try {
            await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: cfg.groupChatId,
                    text: msg,
                    parse_mode: 'HTML'
                })
            });
        } catch (e) {
            console.error("Auto Telegram Broadcast Failed:", e);
        }
    },

    async executeAutoDirectMessages(winners, category) {
        if (!winners || winners.length === 0) return;
        const cfg = this.getSettings();
        if (!cfg.botToken) return;

        winners.forEach(async (w) => {
            if (!w) return;
            const tgAccount = w.telegram || w.phone || w.chat_id || w.telegram_id;
            if (!tgAccount) return;

            const msg = `🎉 <b>CONGRATULATIONS ${w.name || 'Winner'}!</b> 🎉\n\nYou have won: <b>${category}</b>!\n📍 Please proceed to the stage to verify your ticket and claim your prize.\n\n🚀 <i>Lucky Draw Pro Studio</i>`;
            try {
                await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: tgAccount,
                        text: msg,
                        parse_mode: 'HTML'
                    })
                });
            } catch (e) {
                console.error("Auto Direct DM Failed for", tgAccount, e);
            }
        });
    }
};
