/**
 * Telegram control surface for the selected draw round.
 * Network requests and the bot token remain behind DesktopStorage's Python bridge.
 */
window.ZoneETelegramBot = {
    defaultTemplates: {
        groupRound: '<b>OFFICIAL RESULTS: {{category}}</b>\n\n{{winners}}\n\nLucky Draw Pro Studio',
        groupSingle: '<b>WINNER ANNOUNCEMENT</b>\n\nWinner: <b>{{winner}}</b>\nID: <code>{{winnerId}}</code>\nPrize: {{category}}\nSlot: #{{slot}}',
        groupRedraw: '<b>UPDATED RESULT: {{category}}</b>\n\nPrevious Winner: <s>{{previousWinner}}</s>\nNew Winner: <b>{{winner}}</b>\nSlot: #{{slot}}\n\n{{winners}}',
        personalWinner: '<b>CONGRATULATIONS {{winner}}!</b>\n\nYou have won {{category}}.\nWinner ID: <code>{{winnerId}}</code>\nSlot: #{{slot}}',
        personalRevoked: '<b>WINNING STATUS REVOKED</b>\n\n{{previousWinner}}, your winning status for {{category}} (Slot #{{slot}}) is no longer valid following an official redraw.'
    },
    selectedRoundIndex: null,
    activeView: 'messages',
    statusData: null,
    jobs: [],
    refreshPending: false,
    lastRefreshAt: 0,
    refreshTimer: null,
    actionMessage: '',
    actionState: '',

    escapeHtml(value) {
        if (window.Studio && typeof Studio.escapeHtml === 'function') return Studio.escapeHtml(value);
        return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
    },

    escapeTelegramHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;'
        })[char]);
    },

    getSettings() {
        const S = EngineState;
        if (!S.telegramSettings) S.telegramSettings = { groupChatId: '', botIdentity: {}, templates: {} };
        if (!S.telegramSettings.templates) S.telegramSettings.templates = {};
        S.telegramSettings.templates = { ...this.defaultTemplates, ...S.telegramSettings.templates };
        return S.telegramSettings;
    },

    getCompletedRounds() {
        return (EngineState.roundResults || [])
            .map((result, index) => ({ index, result }))
            .filter(entry => entry.result && Array.isArray(entry.result.winners) && entry.result.winners.length > 0)
            .sort((a, b) => {
                const aTime = Date.parse(a.result.lastDrawnAt || '');
                const bTime = Date.parse(b.result.lastDrawnAt || '');
                if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
                if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(bTime) ? 1 : -1;
                return b.index - a.index;
            });
    },

    resolveSelectedRound() {
        const rounds = this.getCompletedRounds();
        if (!rounds.length) {
            this.selectedRoundIndex = null;
            return null;
        }
        if (!rounds.some(entry => entry.index === this.selectedRoundIndex)) {
            this.selectedRoundIndex = rounds[0].index;
        }
        return rounds.find(entry => entry.index === this.selectedRoundIndex) || rounds[0];
    },

    winnerName(winner) {
        return winner?.originalParticipant?.name || winner?.name || winner?.id || 'N/A';
    },

    winnerId(winner) {
        return winner?.originalParticipant?.id || winner?.originalParticipant?.ticket || winner?.id || '';
    },

    winnerChatId(winner) {
        return String(
            winner?.telegramChatId
            || winner?.originalParticipant?.telegramChatId
            || winner?.telegram
            || winner?.chat_id
            || winner?.telegram_id
            || ''
        ).trim();
    },

    roundCategory(roundIndex, result) {
        return result?.category
            || EngineState.roundConfigs?.[roundIndex]?.category
            || EngineState.settings?.roundCategories?.[roundIndex]
            || `Round #${roundIndex + 1}`;
    },

    templateValues(roundIndex, winner = null, slotIndex = null, previousWinner = null) {
        const result = EngineState.roundResults?.[roundIndex] || {};
        const winners = Array.isArray(result.winners) ? result.winners : [];
        return {
            category: this.roundCategory(roundIndex, result),
            round: roundIndex + 1,
            slot: slotIndex == null ? '' : slotIndex + 1,
            winner: this.winnerName(winner),
            winnerId: this.winnerId(winner),
            previousWinner: this.winnerName(previousWinner),
            winners: winners.map((item, index) => `#${index + 1}. ${this.winnerName(item)} (${this.winnerId(item) || 'N/A'})`).join('\n')
        };
    },

    renderTemplate(name, values) {
        const template = this.getSettings().templates[name] || this.defaultTemplates[name] || '';
        return String(template).replace(/\{\{([a-zA-Z]+)\}\}/g, (_match, key) => this.escapeTelegramHtml(values[key] ?? ''));
    },

    newEventId(prefix = 'manual') {
        const suffix = window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        return `${prefix}_${suffix}`;
    },

    render(containerEl) {
        if (!containerEl) return;
        const rounds = this.getCompletedRounds();
        const selected = this.resolveSelectedRound();
        const connected = !!this.statusData?.connected;
        const bot = this.statusData?.bot || this.getSettings().botIdentity || {};
        const statusLabel = connected ? `@${bot.username || bot.firstName || 'Bot'}` : 'Disconnected';
        const roundOptions = rounds.map((entry, index) => {
            const category = this.roundCategory(entry.index, entry.result);
            const latest = index === 0 ? 'Latest - ' : '';
            return `<option value="${entry.index}" ${entry.index === this.selectedRoundIndex ? 'selected' : ''}>${latest}Round #${entry.index + 1} - ${this.escapeHtml(category)}</option>`;
        }).join('');

        containerEl.innerHTML = `
            <div class="telegram-toolbar">
                <select class="telegram-round-select" onchange="ZoneETelegramBot.selectRound(this.value)" aria-label="Draw Round" ${rounds.length ? '' : 'disabled'}>
                    ${rounds.length ? roundOptions : '<option>No Draw Results</option>'}
                </select>
                <span class="telegram-connection-status" data-connected="${connected}">
                    <span></span>${this.escapeHtml(statusLabel)}
                </span>
            </div>
            <div class="telegram-view-switch" role="tablist" aria-label="Telegram View">
                ${this.renderViewButton('messages', 'Messages')}
                ${this.renderViewButton('outbox', 'Outbox')}
                ${this.renderViewButton('setup', 'Setup')}
            </div>
            <div class="telegram-view-content">
                ${this.activeView === 'messages' ? this.renderMessages(selected) : ''}
                ${this.activeView === 'outbox' ? this.renderOutbox() : ''}
                ${this.activeView === 'setup' ? this.renderSetup() : ''}
            </div>
            <div id="telegramActionStatus" class="telegram-action-status" data-state="${this.escapeHtml(this.actionState)}">${this.escapeHtml(this.actionMessage)}</div>
        `;
        if (window.lucide) lucide.createIcons();
        this.scheduleRefresh();
    },

    renderViewButton(view, label) {
        return `<button role="tab" aria-selected="${this.activeView === view}" class="${this.activeView === view ? 'active' : ''}" onclick="ZoneETelegramBot.setView('${view}')">${label}</button>`;
    },

    renderMessages(selected) {
        if (!selected) return '<div class="ui-empty-state telegram-empty">No Draw Results</div>';
        const { index: roundIndex, result } = selected;
        const winners = result.winners || [];
        const rc = EngineState.roundConfigs[roundIndex] || EngineState.getDefaultRoundConfig(roundIndex);
        const connected = !!this.statusData?.connected;
        const groupReady = connected && !!this.getSettings().groupChatId;
        return `
            <section class="telegram-round-header">
                <div>
                    <strong>Round #${roundIndex + 1}</strong>
                    <span>${this.escapeHtml(this.roundCategory(roundIndex, result))}</span>
                </div>
                <button class="btn-arena btn-arena-primary" onclick="ZoneETelegramBot.sendRoundToGroup(${roundIndex})" ${groupReady ? '' : 'disabled'}>
                    <i data-lucide="send"></i>Send Group
                </button>
            </section>
            <section class="telegram-automation-row">
                ${this.renderAutomationToggle(roundIndex, 'telegramAutoGroup', 'Auto Send Group', !!rc.telegramAutoGroup)}
                ${this.renderAutomationToggle(roundIndex, 'telegramAutoDirect', 'Auto Send Personal', !!rc.telegramAutoDirect)}
            </section>
            <div class="telegram-winner-list">
                ${winners.map((winner, slotIndex) => this.renderWinnerRow(roundIndex, slotIndex, winner, groupReady, connected)).join('')}
            </div>
        `;
    },

    renderAutomationToggle(roundIndex, field, label, checked) {
        return `
            <label class="telegram-automation-toggle">
                <span>${label}</span>
                <input type="checkbox" class="ios-toggle-input" ${checked ? 'checked' : ''} onchange="ZoneETelegramBot.updateRoundAutomation(${roundIndex}, '${field}', this.checked)">
                <span class="ios-toggle-switch"></span>
            </label>
        `;
    },

    renderWinnerRow(roundIndex, slotIndex, winner, groupReady, connected) {
        const chatId = this.winnerChatId(winner);
        return `
            <article class="telegram-winner-row">
                <div class="telegram-winner-identity">
                    <span>Winner #${slotIndex + 1}</span>
                    <strong title="${this.escapeHtml(this.winnerName(winner))}">${this.escapeHtml(this.winnerName(winner))}</strong>
                    <small>${this.escapeHtml(this.winnerId(winner))}</small>
                </div>
                <input type="text" value="${this.escapeHtml(chatId)}" placeholder="Telegram Chat ID" aria-label="Telegram Chat ID" onchange="ZoneETelegramBot.updateWinnerChatId(${roundIndex}, ${slotIndex}, this.value)">
                <div class="telegram-winner-actions">
                    <button title="Send to Group" aria-label="Send to Group" onclick="ZoneETelegramBot.sendSingleToGroup(${roundIndex}, ${slotIndex})" ${groupReady ? '' : 'disabled'}><i data-lucide="send"></i></button>
                    <button title="Message Winner" aria-label="Message Winner" onclick="ZoneETelegramBot.sendDirectToUser(${roundIndex}, ${slotIndex})" ${connected && chatId ? '' : 'disabled'}><i data-lucide="message-circle"></i></button>
                </div>
            </article>
        `;
    },

    renderOutbox() {
        if (!this.jobs.length) return '<div class="ui-empty-state telegram-empty">No Messages</div>';
        const statusLabels = {
            pending: 'Queued', sending: 'Sending', sent: 'Sent', failed: 'Failed',
            deleted: 'Deleted', cancelled: 'Cancelled', skipped: 'Skipped'
        };
        const kindLabels = {
            group_round: 'Group Results', group_single: 'Group Winner', group_redraw: 'Redraw Update',
            group_revocation: 'Group Revocation', personal_winner: 'Personal Winner',
            personal_revocation: 'Revocation Notice'
        };
        return `
            <div class="telegram-outbox-list">
                ${this.jobs.map(job => {
                    const status = String(job.status || 'pending');
                    const statusLabel = statusLabels[status] || status;
                    const kind = kindLabels[job.kind] || String(job.kind || '').replace(/_/g, ' ');
                    return `
                        <article class="telegram-outbox-row">
                            <span class="telegram-job-state" data-state="${this.escapeHtml(status)}">${this.escapeHtml(statusLabel)}</span>
                            <div>
                                <strong>${this.escapeHtml(kind)}</strong>
                                <span>Round #${Number(job.roundIndex || 0) + 1} - ${this.escapeHtml(job.winnerName || job.chatId || '')}</span>
                                ${job.error ? `<small>${this.escapeHtml(job.error)}</small>` : ''}
                            </div>
                            ${status === 'failed' ? `<button title="Retry" aria-label="Retry" onclick="ZoneETelegramBot.retryJob('${this.escapeHtml(job.id)}')"><i data-lucide="rotate-ccw"></i></button>` : ''}
                        </article>
                    `;
                }).join('')}
            </div>
        `;
    },

    renderSetup() {
        const connected = !!this.statusData?.connected;
        const bot = this.statusData?.bot || {};
        const settings = this.getSettings();
        const templates = settings.templates;
        return `
            <section class="telegram-setup-section">
                <div class="telegram-section-title">Bot Connection</div>
                ${connected ? `
                    <div class="telegram-connected-row">
                        <strong>@${this.escapeHtml(bot.username || bot.firstName || 'Bot')}</strong>
                        <button class="btn-arena" onclick="ZoneETelegramBot.testConnection()"><i data-lucide="activity"></i>Test</button>
                        <button class="btn-arena btn-arena-danger" onclick="ZoneETelegramBot.disconnect()"><i data-lucide="unplug"></i>Disconnect</button>
                    </div>
                    <div class="telegram-setup-fields">
                        <label><span>Group Chat ID</span><input id="tg_group_id_input" type="text" value="${this.escapeHtml(settings.groupChatId || '')}"></label>
                        <button class="btn-arena btn-arena-primary" onclick="ZoneETelegramBot.saveSetup()"><i data-lucide="save"></i>Save</button>
                    </div>
                ` : `
                    <div class="telegram-setup-fields telegram-connect-fields">
                        <label><span>Bot Token</span><input id="tg_bot_token_input" type="password" autocomplete="off"></label>
                        <label><span>Group Chat ID</span><input id="tg_group_id_input" type="text" value="${this.escapeHtml(settings.groupChatId || '')}"></label>
                        <button class="btn-arena btn-arena-primary" onclick="ZoneETelegramBot.connect()"><i data-lucide="plug"></i>Connect</button>
                    </div>
                `}
            </section>
            <details class="telegram-template-editor">
                <summary>Message Templates</summary>
                ${this.renderTemplateField('groupRound', 'Group Results', templates.groupRound)}
                ${this.renderTemplateField('groupSingle', 'Single Winner', templates.groupSingle)}
                ${this.renderTemplateField('groupRedraw', 'Redraw Update', templates.groupRedraw)}
                ${this.renderTemplateField('personalWinner', 'Personal Winner', templates.personalWinner)}
                ${this.renderTemplateField('personalRevoked', 'Revocation Notice', templates.personalRevoked)}
                <button class="btn-arena btn-arena-primary telegram-template-save" onclick="ZoneETelegramBot.saveSetup()"><i data-lucide="save"></i>Save Templates</button>
            </details>
        `;
    },

    renderTemplateField(name, label, value) {
        return `<label class="telegram-template-field"><span>${label}</span><textarea id="tg_template_${name}" rows="4">${this.escapeHtml(value || '')}</textarea></label>`;
    },

    setView(view) {
        if (!['messages', 'outbox', 'setup'].includes(view)) return;
        this.activeView = view;
        this.repaint();
        if (view === 'outbox') this.refreshData();
    },

    selectRound(value) {
        const roundIndex = Number(value);
        if (!Number.isInteger(roundIndex)) return;
        this.selectedRoundIndex = roundIndex;
        this.repaint();
    },

    repaint() {
        if (window.ZoneEStageControls?.activeSubTab !== 'telegram') return;
        const container = document.getElementById('tg_subtab_container');
        if (container) this.render(container);
    },

    scheduleRefresh() {
        if (!this.statusData && !this.refreshPending) this.refreshData();
        if (this.refreshTimer) return;
        this.refreshTimer = setInterval(() => {
            if (window.ZoneEStageControls?.activeSubTab === 'telegram') this.refreshData(false);
        }, 3000);
    },

    async refreshData(repaint = true) {
        if (this.refreshPending) return;
        this.refreshPending = true;
        try {
            const projectId = EngineState.currentProjectId || '';
            const [status, jobsResult] = await Promise.all([
                DesktopStorage.telegramStatus(projectId),
                DesktopStorage.telegramJobs(projectId, 100)
            ]);
            this.statusData = status;
            this.jobs = jobsResult?.jobs || [];
            if (status?.preferences) {
                EngineState.telegramSettings = {
                    ...EngineState.telegramSettings,
                    ...status.preferences,
                    botIdentity: status.bot || {}
                };
            }
            this.lastRefreshAt = Date.now();
            if (repaint) this.repaint();
        } catch (error) {
            console.error('Telegram status refresh failed:', error);
        } finally {
            this.refreshPending = false;
        }
    },

    setActionStatus(message = '', state = '') {
        this.actionMessage = message;
        this.actionState = state;
        const element = document.getElementById('telegramActionStatus');
        if (element) {
            element.textContent = message;
            element.dataset.state = state;
        }
    },

    async connect() {
        const tokenInput = document.getElementById('tg_bot_token_input');
        const groupInput = document.getElementById('tg_group_id_input');
        const token = tokenInput ? tokenInput.value.trim() : '';
        if (!token) return this.setActionStatus('Bot Token Required', 'error');
        this.setActionStatus('Connecting...', 'working');
        try {
            await DesktopStorage.telegramConnect(token, groupInput ? groupInput.value.trim() : '');
            if (tokenInput) tokenInput.value = '';
            this.setActionStatus('Connected', 'success');
            await this.refreshData();
        } catch (error) {
            this.setActionStatus(error.message || 'Connection Failed', 'error');
        }
    },

    async disconnect() {
        this.setActionStatus('Disconnecting...', 'working');
        try {
            await DesktopStorage.telegramDisconnect();
            this.setActionStatus('Disconnected', 'success');
            await this.refreshData();
        } catch (error) {
            this.setActionStatus(error.message || 'Disconnect Failed', 'error');
        }
    },

    collectTemplates() {
        const templates = {};
        Object.keys(this.defaultTemplates).forEach(name => {
            const element = document.getElementById(`tg_template_${name}`);
            if (element) templates[name] = element.value;
        });
        return templates;
    },

    async saveSetup() {
        const groupInput = document.getElementById('tg_group_id_input');
        const currentGroupChatId = String(this.getSettings().groupChatId || '').trim();
        const preferences = {
            groupChatId: groupInput ? groupInput.value.trim() : currentGroupChatId,
            templates: this.collectTemplates()
        };
        this.setActionStatus('Saving...', 'working');
        try {
            const validateGroup = !!preferences.groupChatId && preferences.groupChatId !== currentGroupChatId;
            const result = await DesktopStorage.telegramSavePreferences(preferences, validateGroup);
            if (result?.preferences) EngineState.telegramSettings = { ...EngineState.telegramSettings, ...result.preferences };
            this.setActionStatus('Saved', 'success');
            await this.refreshData();
        } catch (error) {
            this.setActionStatus(error.message || 'Save Failed', 'error');
        }
    },

    async testConnection() {
        this.setActionStatus('Testing...', 'working');
        try {
            await DesktopStorage.telegramTestConnection();
            this.setActionStatus('Connection OK', 'success');
        } catch (error) {
            this.setActionStatus(error.message || 'Connection Failed', 'error');
        }
    },

    updateRoundAutomation(roundIndex, field, value) {
        const S = EngineState;
        if (!S.roundConfigs[roundIndex]) S.roundConfigs[roundIndex] = S.getDefaultRoundConfig(roundIndex);
        S.roundConfigs[roundIndex][field] = !!value;
        S.syncSettingsFromConfigs();
        S.autoSaveAllSettings();
        this.repaint();
    },

    updateWinnerChatId(roundIndex, winnerIndex, value) {
        const S = EngineState;
        const winner = S.roundResults?.[roundIndex]?.winners?.[winnerIndex];
        if (!winner) return;
        const chatId = String(value || '').trim();
        winner.telegramChatId = chatId;
        if (winner.originalParticipant) winner.originalParticipant.telegramChatId = chatId;
        const participants = S.getParticipantList();
        const participantId = String(winner.originalParticipant?.id || '').trim();
        let participantIndex = participantId
            ? participants.findIndex(participant => String(participant.id || '').trim() === participantId)
            : -1;
        if (participantIndex < 0) participantIndex = Number(winner.originalParticipant?.originalIndex || 0) - 1;
        if (participantIndex >= 0 && participants[participantIndex]) {
            participants[participantIndex].telegramChatId = chatId;
            S.saveParticipantList(participants);
        }
        S.saveDrawState();
        this.repaint();
    },

    buildJob(kind, roundIndex, slotIndex, winner, text, eventId, chatId, idempotencyKey = '') {
        return {
            idempotencyKey,
            projectId: EngineState.currentProjectId || '',
            eventId,
            kind,
            chatId,
            text,
            roundIndex,
            slotIndex,
            winnerId: this.winnerId(winner),
            winnerName: this.winnerName(winner)
        };
    },

    async queueJobs(jobs, silent = false) {
        if (!jobs.length) return { ok: true, added: [] };
        if (!silent) this.setActionStatus('Queued...', 'working');
        try {
            const result = await DesktopStorage.telegramEnqueue(jobs);
            if (!silent) this.setActionStatus(`${result?.added?.length || 0} Queued`, 'success');
            await this.refreshData(this.activeView === 'outbox');
            return result;
        } catch (error) {
            if (!silent) this.setActionStatus(error.message || 'Send Failed', 'error');
            else console.error('Telegram auto-send failed:', error);
            return { ok: false, error };
        }
    },

    async sendRoundToGroup(roundIndex) {
        const result = EngineState.roundResults?.[roundIndex];
        const chatId = this.getSettings().groupChatId;
        if (!result || !chatId) return this.setActionStatus('Group Chat ID Required', 'error');
        const eventId = this.newEventId('manual_group_round');
        const text = this.renderTemplate('groupRound', this.templateValues(roundIndex));
        await this.queueJobs([this.buildJob('group_round', roundIndex, null, null, text, eventId, chatId, eventId)]);
    },

    async sendSingleToGroup(roundIndex, winnerIndex) {
        const winner = EngineState.roundResults?.[roundIndex]?.winners?.[winnerIndex];
        const chatId = this.getSettings().groupChatId;
        if (!winner || !chatId) return this.setActionStatus('Group Chat ID Required', 'error');
        const eventId = this.newEventId('manual_group_winner');
        const text = this.renderTemplate('groupSingle', this.templateValues(roundIndex, winner, winnerIndex));
        await this.queueJobs([this.buildJob('group_single', roundIndex, winnerIndex, winner, text, eventId, chatId, eventId)]);
    },

    async sendDirectToUser(roundIndex, winnerIndex) {
        const winner = EngineState.roundResults?.[roundIndex]?.winners?.[winnerIndex];
        const chatId = this.winnerChatId(winner);
        if (!winner || !chatId) return this.setActionStatus('Telegram Chat ID Required', 'error');
        const eventId = this.newEventId('manual_personal');
        const text = this.renderTemplate('personalWinner', this.templateValues(roundIndex, winner, winnerIndex));
        await this.queueJobs([this.buildJob('personal_winner', roundIndex, winnerIndex, winner, text, eventId, chatId, eventId)]);
    },

    async handleDrawComplete(roundIndex, eventId) {
        const S = EngineState;
        const result = S.roundResults?.[roundIndex];
        const rc = S.roundConfigs?.[roundIndex] || S.getDefaultRoundConfig(roundIndex);
        this.selectedRoundIndex = roundIndex;
        this.repaint();
        if (!result || (!rc.telegramAutoGroup && !rc.telegramAutoDirect)) return;
        const jobs = [];
        const groupChatId = this.getSettings().groupChatId;
        if (rc.telegramAutoGroup && groupChatId) {
            jobs.push(this.buildJob(
                'group_round', roundIndex, null, null,
                this.renderTemplate('groupRound', this.templateValues(roundIndex)),
                eventId, groupChatId, `draw:${S.currentProjectId}:${eventId}:group`
            ));
        }
        if (rc.telegramAutoDirect) {
            result.winners.forEach((winner, slotIndex) => {
                const chatId = this.winnerChatId(winner);
                if (!chatId) return;
                jobs.push(this.buildJob(
                    'personal_winner', roundIndex, slotIndex, winner,
                    this.renderTemplate('personalWinner', this.templateValues(roundIndex, winner, slotIndex)),
                    eventId, chatId, `draw:${S.currentProjectId}:${eventId}:personal:${slotIndex}`
                ));
            });
        }
        await this.queueJobs(jobs, true);
    },

    async handleRedraw(roundIndex, slotIndex, previousWinner, newWinner, eventId) {
        const S = EngineState;
        const result = S.roundResults?.[roundIndex];
        const rc = S.roundConfigs?.[roundIndex] || S.getDefaultRoundConfig(roundIndex);
        if (!result) return;
        this.selectedRoundIndex = roundIndex;
        this.repaint();
        const values = this.templateValues(roundIndex, newWinner, slotIndex, previousWinner);
        try {
            await DesktopStorage.telegramHandleRedraw({
                projectId: S.currentProjectId || '',
                eventId,
                roundIndex,
                slotIndex,
                previousWinner: {
                    id: this.winnerId(previousWinner),
                    name: this.winnerName(previousWinner),
                    chatId: this.winnerChatId(previousWinner)
                },
                newWinner: {
                    id: this.winnerId(newWinner),
                    name: this.winnerName(newWinner),
                    chatId: this.winnerChatId(newWinner)
                },
                automation: { group: !!rc.telegramAutoGroup, personal: !!rc.telegramAutoDirect },
                groupChatId: this.getSettings().groupChatId,
                groupText: this.renderTemplate('groupRedraw', values),
                personalText: this.renderTemplate('personalWinner', values),
                revocationText: this.renderTemplate('personalRevoked', values)
            });
            await this.refreshData(this.activeView === 'outbox');
        } catch (error) {
            console.error('Telegram redraw update failed:', error);
        }
    },

    async retryJob(jobId) {
        this.setActionStatus('Retrying...', 'working');
        try {
            await DesktopStorage.telegramRetry(jobId);
            this.setActionStatus('Retry Queued', 'success');
            await this.refreshData();
        } catch (error) {
            this.setActionStatus(error.message || 'Retry Failed', 'error');
        }
    },

    broadcastAllWinners(roundIndex) {
        return this.sendRoundToGroup(roundIndex);
    }
};
