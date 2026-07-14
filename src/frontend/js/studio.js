/**
 * studio.js - Master Orchestrator & Controller
 * Connects all 5 Resolume Arena 7 zones to EngineState and DOM.
 */

window.AudioSynth = {
    playTick() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(850, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.04);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.04);
        } catch(e) {}
    },
    playFanfare() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
                gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.45);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.12);
                osc.stop(ctx.currentTime + i * 0.12 + 0.45);
            });
        } catch(e) {}
    },
    triggerConfetti() {
        if (window.confetti) {
            window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        }
    },
    playSound(soundName) {
        if (soundName === 'victory' || soundName === 'fanfare' || soundName === 'celebration') {
            this.playFanfare();
        } else {
            this.playTick();
        }
    }
};

window.Studio = {
    async init() {
        console.log("Initializing Lucky Draw Pro Studio...");

        // 1. Load desktop settings and optional crash recovery from local files.
        let startup = { settings: {}, recent: [], recoveries: [] };
        let resumedFromRecovery = false;
        try {
            startup = await DesktopStorage.init();
            EngineState.applyAppSettings(startup.settings);
            EngineState.savedProjectsList = startup.recent || [];
            if (window.ZoneDPoolManager) ZoneDPoolManager.ribbonMode = startup.settings.poolRibbonMode || 'all';
        } catch (error) {
            console.error('Desktop storage initialization failed:', error);
            alert(`Local storage service could not start: ${error.message}`);
        }

        if (startup.recoveries && startup.recoveries.length > 0) {
            const latest = startup.recoveries[0];
            const shouldRestore = confirm(`Recovery data was found for "${latest.name}" from ${latest.savedAt || 'the previous session'}. Restore it now?`);
            if (shouldRestore) {
                try {
                    const result = await DesktopStorage.restoreRecovery(latest.id);
                    resumedFromRecovery = EngineState.applyProjectDocument(result.document, { path: result.path });
                    EngineState.savedProjectsList = result.recent || EngineState.savedProjectsList;
                } catch (error) {
                    console.error('Recovery restore failed:', error);
                    alert(`Recovery could not be restored: ${error.message}`);
                }
            }
        }

        if (!resumedFromRecovery) {
            EngineState.loadParticipantsFromStorage();
            EngineState.ensureRoundConfigs(1);
            EngineState.syncSettingsFromConfigs();
        }

        // 2. Init all 5 Resolume Arena zones
        if (window.ZoneA) ZoneA.init();
        if (window.ZoneB) ZoneB.init();
        if (window.ZoneC) ZoneC.init();
        if (window.ZoneD) ZoneD.init();
        if (window.ZoneE) ZoneE.init();

        // 3. Restore an approved disk recovery or initialize a clean draw session.
        if (resumedFromRecovery && EngineState.drawState) {
            Draw.initializeDisplayMode(false);
        } else {
            EngineState.isDrawing = false;
            EngineState.drawCompletedThisRound = false;
            if (window.ProjectorSync) ProjectorSync.publish({ type: 'draw_status', isDrawing: false });
            Draw.initializePoolsSilently();
            if (window.Display) Display.resetDisplayForNewRound();
        }

        // 4. Keyboard Shortcuts & VJ Hotkeys (Point 6)
        document.addEventListener('keydown', (e) => {
            const activeEl = document.activeElement;
            const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA');

            // Escape closes modals
            if (e.code === 'Escape') {
                Studio.closeProjectManager();
                Studio.closeCategoryManager();
                Studio.closeHotkeysHelp();
                Studio.closeReport();
                return;
            }

            // Microsoft Word Ctrl+S (or Cmd+S) Quick Save
            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                Studio.quickSaveProject();
                return;
            }

            if (isInput) return;

            // Space / Enter: Launch Draw or Next Column
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                if (!EngineState.isDrawing && !EngineState.drawCompletedThisRound) {
                    Draw.startDraw();
                } else if (EngineState.drawCompletedThisRound) {
                    Display.nextRound();
                }
                return;
            }

            // Left / Right Arrows: Select Previous/Next Column
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                if (!EngineState.isDrawing && EngineState.currentRound > 0 && window.ZoneA) {
                    ZoneA.selectSlot(EngineState.currentRound - 1);
                }
                return;
            }
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                if (!EngineState.isDrawing && EngineState.currentRound < EngineState.totalRounds - 1 && window.ZoneA) {
                    ZoneA.selectSlot(EngineState.currentRound + 1);
                }
                return;
            }

            // Key R: Re-Spin Current Column
            if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                if (!EngineState.isDrawing && window.ZoneB && EngineState.roundResults[EngineState.currentRound]) {
                    ZoneB.reDrawEntireColumn();
                }
                return;
            }

            // Key S: Toggle Speed
            if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') {
                e.preventDefault();
                const current = EngineState.displaySettings.drawSpeed || 'normal';
                const nextSpeed = current === 'normal' ? 'fast' : (current === 'fast' ? 'suspense' : 'normal');
                if (window.ZoneB) ZoneB.setSpeed(nextSpeed);
                return;
            }

            // Key P: Projector Pop-Out
            if (e.code === 'KeyP' || e.key === 'p' || e.key === 'P') {
                e.preventDefault();
                Studio.openProjector();
                return;
            }

            // Key H: History / Report Modal
            if (e.code === 'KeyH' || e.key === 'h' || e.key === 'H') {
                e.preventDefault();
                Studio.showReport();
                return;
            }

            // Key O: Open Project Manager
            if (e.code === 'KeyO' || e.key === 'o' || e.key === 'O') {
                e.preventDefault();
                Studio.openProjectManager();
                return;
            }
        });

        // 5. Apply app preferences loaded from settings.json.
        this.ribbonDisplayMode = (startup.settings && startup.settings.ribbonMode) || 'all';
        this.applyRibbonDisplayMode();

        // Close Ribbon menu when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('ribbonOptionsDropdown');
            if (dropdown && !e.target.closest('#ribbonOptionsDropdown') && !e.target.closest('.ribbon-display-trigger')) {
                Studio.closeRibbonDisplayMenu();
            }
            if (!e.target.closest('.history-menu-wrap')) Studio.closeHistoryMenus();
        });

        window.addEventListener('beforeunload', (event) => {
            if (!EngineState.isDirty) return;
            DesktopStorage.flushRecovery();
            event.preventDefault();
            event.returnValue = '';
        });

        console.log("Lucky Draw Pro Studio ready!");
    },

    ribbonDisplayMode: 'all',

    escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);
    },

    applyRibbonDisplayMode() {
        // No-op for global body; Ribbon Mode strictly controls Pool Manager (`ZoneDPoolManager`)
    },

    setRibbonDisplayMode(mode) {
        this.ribbonDisplayMode = mode;
        if (window.DesktopStorage) DesktopStorage.updateSettings({ ribbonMode: mode }).catch(error => console.error('Ribbon preference save failed:', error));
        if (window.ZoneDPoolManager) {
            ZoneDPoolManager.setRibbonMode(mode);
        }
        this.closeRibbonDisplayMenu();
    },

    openRibbonDisplayMenu(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        let dropdown = document.getElementById('ribbonOptionsDropdown');
        if (dropdown) {
            this.closeRibbonDisplayMenu();
            return;
        }

        dropdown = document.createElement('div');
        dropdown.id = 'ribbonOptionsDropdown';
        dropdown.className = 'ribbon-options-dropdown';

        // Position near trigger button or top right
        if (event && event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 6) + 'px';
            dropdown.style.left = Math.min(window.innerWidth - 240, Math.max(10, rect.left - 120)) + 'px';
        } else {
            dropdown.style.top = '48px';
            dropdown.style.right = '20px';
        }

        const current = window.ZoneDPoolManager ? (ZoneDPoolManager.ribbonMode || 'all') : 'all';

        dropdown.innerHTML = `
            <div style="padding: 6px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 10px; font-weight: 800; color: #8a8a9e; letter-spacing: 0.5px; text-transform: uppercase;">
                View Options
            </div>
            <div class="ribbon-option-item ${current === 'autohide' ? 'active' : ''}" onclick="Studio.setRibbonDisplayMode('autohide')" title="Hide both header rows completely to maximize vertical space">
                <div class="ribbon-option-icon">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:15px; height:15px;"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                </div>
                <div class="ribbon-option-text">
                    <h4>Auto-hide Controls</h4>
                </div>
            </div>
            <div class="ribbon-option-item ${current === 'tabs' ? 'active' : ''}" onclick="Studio.setRibbonDisplayMode('tabs')" title="Show the compact search and filter strip only">
                <div class="ribbon-option-icon">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:15px; height:15px;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/></svg>
                </div>
                <div class="ribbon-option-text">
                    <h4>Tabs Only</h4>
                </div>
            </div>
            <div class="ribbon-option-item ${current === 'all' ? 'active' : ''}" onclick="Studio.setRibbonDisplayMode('all')" title="Show both the action header and search strip all the time">
                <div class="ribbon-option-icon">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:15px; height:15px;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                </div>
                <div class="ribbon-option-text">
                    <h4>Tabs and Controls</h4>
                </div>
            </div>
        `;

        document.body.appendChild(dropdown);
    },

    closeRibbonDisplayMenu() {
        const dropdown = document.getElementById('ribbonOptionsDropdown');
        if (dropdown) {
            dropdown.remove();
        }
    },

    openProjector() {
        const width = 1280;
        const height = 720;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        window.open(
            'projector/projector.html',
            'LuckyDrawProjector',
            `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
        );
    },

    historyView: 'results',
    historySearch: '',
    historyCategory: 'all',
    historySource: 'all',
    historySort: 'newest',
    historySelectedRoundIndex: null,
    historyRoundLimit: 50,
    historyWinnerLimit: 50,
    historyActivityLimit: 50,
    historyOpenMenu: null,
    historySearchTimer: null,

    getHistorySourceLabel(source) {
        if (source === 'list') return 'Participant Name';
        if (source === 'id') return 'ID Ticket';
        return 'Number Range';
    },

    formatHistoryTime(value) {
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return '--';
        return date.toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    },

    getHistoryResultEntries(sortMode = this.historySort) {
        const totalRounds = Number(EngineState.totalRounds);
        const entries = Object.entries(EngineState.roundResults || {})
            .filter(([index, result]) => result && (!Number.isFinite(totalRounds) || totalRounds < 1 || Number(index) < totalRounds))
            .map(([index, result]) => ({ index: Number(index), result }));

        entries.sort((a, b) => {
            const aTime = Date.parse(a.result.lastDrawnAt || '');
            const bTime = Date.parse(b.result.lastDrawnAt || '');
            const aHasTime = Number.isFinite(aTime);
            const bHasTime = Number.isFinite(bTime);
            if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
            if (aHasTime && bHasTime && aTime !== bTime) return sortMode === 'oldest' ? aTime - bTime : bTime - aTime;

            const aRound = Number(a.result.round) || a.index + 1;
            const bRound = Number(b.result.round) || b.index + 1;
            return sortMode === 'oldest' ? aRound - bRound : bRound - aRound;
        });
        return entries;
    },

    getHistoryResultsNewestFirst() {
        return this.getHistoryResultEntries('newest').map(entry => entry.result);
    },

    getHistoryActivities(sortMode = this.historySort) {
        const events = Array.isArray(EngineState.historyEvents) ? [...EngineState.historyEvents] : [];
        return events.map((event, index) => ({ event, index })).sort((a, b) => {
            const aTime = Date.parse(a.event.timestamp || '');
            const bTime = Date.parse(b.event.timestamp || '');
            const aHasTime = Number.isFinite(aTime);
            const bHasTime = Number.isFinite(bTime);
            if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
            if (aHasTime && bHasTime && aTime !== bTime) return sortMode === 'oldest' ? aTime - bTime : bTime - aTime;
            return sortMode === 'oldest' ? a.index - b.index : b.index - a.index;
        }).map(entry => entry.event);
    },

    getFilteredHistoryResultEntries() {
        const query = this.historySearch.trim().toLowerCase();
        return this.getHistoryResultEntries().filter(({ result, index }) => {
            const source = result.type || 'numeric';
            if (this.historyCategory !== 'all' && result.category !== this.historyCategory) return false;
            if (this.historySource !== 'all' && source !== this.historySource) return false;
            if (!query) return true;
            const winnerText = (result.winners || []).map(winner => `${winner?.name || ''} ${winner?.id || ''}`).join(' ');
            return [`round ${result.round || index + 1}`, result.category || '', this.getHistorySourceLabel(source), winnerText]
                .join(' ').toLowerCase().includes(query);
        });
    },

    getFilteredHistoryEvents() {
        const query = this.historySearch.trim().toLowerCase();
        return this.getHistoryActivities().filter(event => {
            if (this.historyCategory !== 'all' && event.category !== this.historyCategory) return false;
            if (this.historySource !== 'all' && event.source !== this.historySource) return false;
            if (!query) return true;
            const winnerText = [
                ...(event.winners || []),
                ...(event.previousWinners || []),
                event.previousWinner,
                event.newWinner
            ].filter(Boolean).map(winner => `${winner.name || ''} ${winner.id || ''} ${winner.participantName || ''}`).join(' ');
            return [this.getHistoryEventLabel(event.type), `round ${this.getHistoryEventRound(event)}`, event.category || '', this.getHistorySourceLabel(event.source), winnerText]
                .join(' ').toLowerCase().includes(query);
        });
    },

    getHistoryEventLabel(type) {
        if (type === 'redraw') return 'Redraw Winner';
        if (type === 'redraw_round') return 'Redraw Round';
        return 'Draw';
    },

    getHistoryEventRound(event) {
        const round = Number(event?.round);
        if (Number.isFinite(round) && round > 0) return round;
        const roundIndex = Number(event?.roundIndex);
        return Number.isFinite(roundIndex) && roundIndex >= 0 ? roundIndex + 1 : '--';
    },

    getHistoryEventDetail(event) {
        if (event.type === 'redraw') {
            const previous = event.previousWinner?.name || 'N/A';
            const next = event.newWinner?.name || event.winners?.[0]?.name || 'N/A';
            const slot = Number.isInteger(event.slotIndex) ? event.slotIndex + 1 : 1;
            return `Winner #${slot}: ${previous} to ${next}`;
        }
        if (event.type === 'redraw_round') {
            return `${event.previousWinners?.length || 0} to ${event.winners?.length || 0} Winners`;
        }
        return `${event.winners?.length || 0} Winners`;
    },

    getHistorySummary() {
        const results = this.getHistoryResultEntries('newest');
        const events = this.getHistoryActivities('newest');
        const winnerCount = results.reduce((total, entry) => total + (entry.result.winners?.length || 0), 0);
        const redrawCount = events.filter(event => event.type === 'redraw' || event.type === 'redraw_round').length;
        const timestamps = [
            ...results.map(entry => Date.parse(entry.result.lastDrawnAt || '')),
            ...events.map(event => Date.parse(event.timestamp || ''))
        ].filter(Number.isFinite);
        return {
            rounds: results.length,
            winners: winnerCount,
            redraws: redrawCount,
            latest: timestamps.length ? this.formatHistoryTime(Math.max(...timestamps)) : '--'
        };
    },

    getHistoryCategories() {
        const categories = new Set(EngineState.prizeCategories || []);
        this.getHistoryResultEntries('newest').forEach(({ result }) => categories.add(result.category || 'Draw'));
        this.getHistoryActivities('newest').forEach(event => categories.add(event.category || 'Draw'));
        return [...categories].filter(Boolean);
    },

    renderHistoryToolbar() {
        const categoryOptions = this.getHistoryCategories().map(category => `
            <option value="${this.escapeHtml(category)}" ${this.historyCategory === category ? 'selected' : ''}>${this.escapeHtml(category)}</option>
        `).join('');
        return `
            <div class="history-toolbar">
                <div class="history-segmented" role="tablist" aria-label="History View">
                    <button class="${this.historyView === 'results' ? 'active' : ''}" onclick="Studio.setHistoryView('results')" role="tab" aria-selected="${this.historyView === 'results'}">Results</button>
                    <button class="${this.historyView === 'activity' ? 'active' : ''}" onclick="Studio.setHistoryView('activity')" role="tab" aria-selected="${this.historyView === 'activity'}">Activity</button>
                </div>
                <label class="history-search-field" title="Search History">
                    <i data-lucide="search"></i>
                    <input id="historySearchInput" type="search" value="${this.escapeHtml(this.historySearch)}" oninput="Studio.setHistorySearch(this.value)" placeholder="Search" aria-label="Search History">
                </label>
                <select onchange="Studio.setHistoryFilter('category', this.value)" aria-label="Prize Category" title="Prize Category">
                    <option value="all">All Categories</option>
                    ${categoryOptions}
                </select>
                <select onchange="Studio.setHistoryFilter('source', this.value)" aria-label="Draw Source" title="Draw Source">
                    <option value="all" ${this.historySource === 'all' ? 'selected' : ''}>All Sources</option>
                    <option value="numeric" ${this.historySource === 'numeric' ? 'selected' : ''}>Number Range</option>
                    <option value="list" ${this.historySource === 'list' ? 'selected' : ''}>Participant Name</option>
                    <option value="id" ${this.historySource === 'id' ? 'selected' : ''}>ID Ticket</option>
                </select>
                <select onchange="Studio.setHistoryFilter('sort', this.value)" aria-label="Sort History" title="Sort History">
                    <option value="newest" ${this.historySort === 'newest' ? 'selected' : ''}>Newest First</option>
                    <option value="oldest" ${this.historySort === 'oldest' ? 'selected' : ''}>Oldest First</option>
                </select>
            </div>
        `;
    },

    renderHistoryResults() {
        const entries = this.getFilteredHistoryResultEntries();
        if (!entries.some(entry => entry.index === this.historySelectedRoundIndex)) {
            this.historySelectedRoundIndex = entries.length ? entries[0].index : null;
            this.historyWinnerLimit = 50;
        }
        const selectedEntry = entries.find(entry => entry.index === this.historySelectedRoundIndex) || null;
        const visibleEntries = entries.slice(0, this.historyRoundLimit);
        const roundRows = visibleEntries.map(({ index, result }) => {
            const roundNumber = Number(result.round) || index + 1;
            const winnerCount = result.winners?.length || 0;
            return `
                <button class="history-round-row ${index === this.historySelectedRoundIndex ? 'selected' : ''}" onclick="Studio.selectHistoryRound(${index})">
                    <span class="history-round-main"><strong>Round ${roundNumber}</strong><span>${this.escapeHtml(result.category || 'Draw')}</span></span>
                    <span class="history-round-meta"><span>${winnerCount} ${winnerCount === 1 ? 'Winner' : 'Winners'}</span><time>${this.escapeHtml(this.formatHistoryTime(result.lastDrawnAt))}</time></span>
                </button>
            `;
        }).join('');
        const loadMoreRounds = entries.length > visibleEntries.length ? `
            <button class="history-load-more" onclick="Studio.showMoreHistory('rounds')">Show More</button>
        ` : '';

        let detail = '<div class="history-empty">No Results</div>';
        if (selectedEntry) {
            const result = selectedEntry.result;
            const winners = Array.isArray(result.winners) ? result.winners : [];
            const visibleWinners = winners.slice(0, this.historyWinnerLimit);
            const winnerRows = visibleWinners.map((winner, index) => `
                <tr>
                    <td class="history-slot-cell">#${index + 1}</td>
                    <td class="history-winner-cell">${this.escapeHtml(winner?.name || 'N/A')}</td>
                    <td class="history-id-cell">${this.escapeHtml(winner?.id || '')}</td>
                </tr>
            `).join('');
            const loadMoreWinners = winners.length > visibleWinners.length ? `
                <button class="history-load-more" onclick="Studio.showMoreHistory('winners')">Show More</button>
            ` : '';
            detail = `
                <section class="history-detail-pane">
                    <header class="history-detail-header">
                        <div><h3>Round ${Number(result.round) || selectedEntry.index + 1}</h3><span>${this.escapeHtml(result.category || 'Draw')}</span></div>
                        <div class="history-detail-meta">
                            <span>${this.escapeHtml(this.getHistorySourceLabel(result.type || 'numeric'))}</span>
                            <span>${winners.length} ${winners.length === 1 ? 'Winner' : 'Winners'}</span>
                            <time>${this.escapeHtml(this.formatHistoryTime(result.lastDrawnAt))}</time>
                        </div>
                    </header>
                    <div class="history-table-scroll">
                        <table class="history-table">
                            <thead><tr><th>Slot</th><th>Winner</th><th>ID</th></tr></thead>
                            <tbody>${winnerRows}</tbody>
                        </table>
                        ${loadMoreWinners}
                    </div>
                </section>
            `;
        }

        return `
            <div class="history-results-layout">
                <aside class="history-round-pane">
                    <div class="history-pane-heading"><span>Rounds</span><strong>${entries.length}</strong></div>
                    <div class="history-round-scroll">${roundRows || '<div class="history-empty">No Results</div>'}${loadMoreRounds}</div>
                </aside>
                ${detail}
            </div>
        `;
    },

    renderHistoryActivity() {
        const events = this.getFilteredHistoryEvents();
        const visibleEvents = events.slice(0, this.historyActivityLimit);
        const rows = visibleEvents.map(event => `
            <tr>
                <td><time>${this.escapeHtml(this.formatHistoryTime(event.timestamp))}</time></td>
                <td><span class="history-event-type ${this.escapeHtml(event.type || 'draw')}">${this.escapeHtml(this.getHistoryEventLabel(event.type))}</span></td>
                <td>Round ${this.getHistoryEventRound(event)}</td>
                <td>${this.escapeHtml(event.category || 'Draw')}</td>
                <td>${this.escapeHtml(this.getHistoryEventDetail(event))}</td>
            </tr>
        `).join('');
        const loadMore = events.length > visibleEvents.length ? `
            <button class="history-load-more" onclick="Studio.showMoreHistory('activity')">Show More</button>
        ` : '';
        return `
            <section class="history-activity-pane">
                <div class="history-pane-heading"><span>Activity</span><strong>${events.length}</strong></div>
                <div class="history-table-scroll">
                    ${events.length ? `
                        <table class="history-table history-activity-table">
                            <thead><tr><th>Time</th><th>Event</th><th>Round</th><th>Category</th><th>Details</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                        ${loadMore}
                    ` : '<div class="history-empty">No Activity</div>'}
                </div>
            </section>
        `;
    },

    renderHistoryManager() {
        const body = document.getElementById('report-body');
        if (!body) return;
        const summary = this.getHistorySummary();
        body.innerHTML = `
            <div class="history-manager">
                <div class="history-summary-bar">
                    <div><span>Rounds</span><strong>${summary.rounds}</strong></div>
                    <div><span>Winners</span><strong>${summary.winners}</strong></div>
                    <div><span>Redraws</span><strong>${summary.redraws}</strong></div>
                    <div><span>Latest Draw</span><strong>${this.escapeHtml(summary.latest)}</strong></div>
                </div>
                ${this.renderHistoryToolbar()}
                <div class="history-content">${this.historyView === 'activity' ? this.renderHistoryActivity() : this.renderHistoryResults()}</div>
            </div>
        `;
        const footerStatus = document.getElementById('historyFooterStatus');
        if (footerStatus) {
            const count = this.historyView === 'activity' ? this.getFilteredHistoryEvents().length : this.getFilteredHistoryResultEntries().length;
            footerStatus.textContent = `${count} ${this.historyView === 'activity' ? (count === 1 ? 'Event' : 'Events') : (count === 1 ? 'Round' : 'Rounds')}`;
        }
        if (window.lucide) lucide.createIcons();
    },

    showReport() {
        const modal = document.getElementById('reportModal');
        if (!modal) return;
        if (this.historyCategory !== 'all' && !this.getHistoryCategories().includes(this.historyCategory)) {
            this.historyCategory = 'all';
        }
        if (!['all', 'numeric', 'list', 'id'].includes(this.historySource)) this.historySource = 'all';
        this.historyRoundLimit = 50;
        this.historyWinnerLimit = 50;
        this.historyActivityLimit = 50;
        this.closeHistoryMenus();
        modal.style.display = 'flex';
        this.renderHistoryManager();
    },

    closeReport() {
        const modal = document.getElementById('reportModal');
        this.closeHistoryMenus();
        if (modal) modal.style.display = 'none';
    },

    setHistoryView(view) {
        this.historyView = view === 'activity' ? 'activity' : 'results';
        this.historyRoundLimit = 50;
        this.historyWinnerLimit = 50;
        this.historyActivityLimit = 50;
        this.renderHistoryManager();
    },

    setHistorySearch(value) {
        this.historySearch = value || '';
        if (this.historySearchTimer) clearTimeout(this.historySearchTimer);
        this.historySearchTimer = setTimeout(() => {
            this.historyRoundLimit = 50;
            this.historyWinnerLimit = 50;
            this.historyActivityLimit = 50;
            this.renderHistoryManager();
            const input = document.getElementById('historySearchInput');
            if (input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }, 120);
    },

    setHistoryFilter(field, value) {
        if (field === 'category') this.historyCategory = value;
        else if (field === 'source') this.historySource = value;
        else if (field === 'sort') this.historySort = value === 'oldest' ? 'oldest' : 'newest';
        this.historyRoundLimit = 50;
        this.historyWinnerLimit = 50;
        this.historyActivityLimit = 50;
        this.renderHistoryManager();
    },

    selectHistoryRound(index) {
        this.historySelectedRoundIndex = Number(index);
        this.historyWinnerLimit = 50;
        this.renderHistoryManager();
    },

    showMoreHistory(section) {
        if (section === 'rounds') this.historyRoundLimit += 50;
        else if (section === 'winners') this.historyWinnerLimit += 50;
        else if (section === 'activity') this.historyActivityLimit += 50;
        this.renderHistoryManager();
    },

    toggleHistoryMenu(menu, event) {
        if (event) event.stopPropagation();
        this.historyOpenMenu = this.historyOpenMenu === menu ? null : menu;
        const exportMenu = document.getElementById('historyExportMenu');
        const actionMenu = document.getElementById('historyActionMenu');
        if (exportMenu) exportMenu.hidden = this.historyOpenMenu !== 'export';
        if (actionMenu) actionMenu.hidden = this.historyOpenMenu !== 'actions';
    },

    closeHistoryMenus() {
        this.historyOpenMenu = null;
        const exportMenu = document.getElementById('historyExportMenu');
        const actionMenu = document.getElementById('historyActionMenu');
        if (exportMenu) exportMenu.hidden = true;
        if (actionMenu) actionMenu.hidden = true;
    },

    resetDrawData() {
        this.closeHistoryMenus();
        if (!confirm('Reset all draw results, redraw activity, winner progress, and participant pools? This cannot be undone.')) return;
        EngineState.roundResults = [];
        EngineState.historyEvents = [];
        EngineState.allWinners = [];
        EngineState.drawCompletedThisRound = false;
        EngineState.isDrawing = false;
        if (window.Draw && typeof Draw.initializePoolsSilently === 'function') {
            Draw.initializePoolsSilently();
        } else {
            EngineState.drawListPool = [...(EngineState.masterListPool || [])];
            EngineState.drawNumericPool = [...(EngineState.masterNumericPool || [])];
            EngineState.drawIdPool = [...(EngineState.masterIdPool || [])];
        }
        EngineState.saveDrawState();
        if (window.Display) Display.resetDisplayForNewRound();
        if (window.ZoneA) ZoneA.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneC) ZoneC.render();
        if (window.ZoneD) ZoneD.render();
        if (window.ZoneE) ZoneE.render();
        this.historySelectedRoundIndex = null;
        this.showReport();
    },

    clearReport() {
        this.resetDrawData();
    },

    printReport() {
        this.closeHistoryMenus();
        window.print();
    },

    getHistoryResultExportRows(entries) {
        const rows = [];
        entries.forEach(({ index, result }) => {
            const winners = Array.isArray(result.winners) ? result.winners : [];
            winners.forEach((winner, slotIndex) => rows.push({
                'Draw Time': result.lastDrawnAt || '',
                'Round': Number(result.round) || index + 1,
                'Prize Category': result.category || 'Draw',
                'Draw Source': this.getHistorySourceLabel(result.type || 'numeric'),
                'Slot': slotIndex + 1,
                'Winner': winner?.name || 'N/A',
                'Winner ID': winner?.id || ''
            }));
        });
        return rows;
    },

    getHistoryActivityExportRows(events) {
        return events.map(event => ({
            'Time': event.timestamp || '',
            'Event': this.getHistoryEventLabel(event.type),
            'Round': this.getHistoryEventRound(event),
            'Prize Category': event.category || 'Draw',
            'Draw Source': this.getHistorySourceLabel(event.source || 'numeric'),
            'Slot': Number.isInteger(event.slotIndex) ? event.slotIndex + 1 : '',
            'Previous Winner': event.previousWinner?.name || (event.previousWinners || []).map(winner => winner.name).join(', '),
            'New Winner': event.newWinner?.name || (event.winners || []).map(winner => winner.name).join(', '),
            'Winner Count': event.winners?.length || 0
        }));
    },

    exportHistory(scope = 'all') {
        this.closeHistoryMenus();
        if (!window.XLSX || !XLSX.utils) {
            alert('Excel export is unavailable.');
            return;
        }
        const workbook = XLSX.utils.book_new();
        let sheetCount = 0;
        const appendSheet = (rows, name) => {
            if (!rows.length) return;
            const sheet = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(workbook, sheet, name);
            sheetCount++;
        };

        if (scope === 'all' || this.historyView === 'results') {
            const entries = scope === 'all' ? this.getHistoryResultEntries() : this.getFilteredHistoryResultEntries();
            appendSheet(this.getHistoryResultExportRows(entries), 'Results');
        }
        if (scope === 'all' || this.historyView === 'activity') {
            const events = scope === 'all' ? this.getHistoryActivities() : this.getFilteredHistoryEvents();
            appendSheet(this.getHistoryActivityExportRows(events), 'Activity');
        }
        if (!sheetCount) {
            alert('No history data to export.');
            return;
        }
        const suffix = scope === 'all' ? 'all' : this.historyView;
        XLSX.writeFile(workbook, `lucky_draw_history_${suffix}.xlsx`, { compression: true });
    },

    exportReportToExcel() {
        this.exportHistory('all');
    },

    // ---- Microsoft Word File Workflow & Save Controls (Word Process) ----
    updateSaveStatusUI() {
        const badge = document.getElementById('topBarSaveStatusBadge');
        if (badge) {
            if (!EngineState.currentProjectSaved && !EngineState.isDirty) {
                badge.style.background = 'rgba(255, 255, 255, 0.08)';
                badge.style.color = 'var(--text-secondary)';
                badge.textContent = 'Not saved';
            } else if (EngineState.isDirty) {
                badge.style.background = 'rgba(245, 158, 11, 0.2)';
                badge.style.color = 'var(--warning-color)';
                badge.textContent = 'Unsaved';
            } else {
                badge.style.background = 'rgba(16, 185, 129, 0.15)';
                badge.style.color = 'var(--success-color)';
                badge.textContent = 'Saved';
            }
        }
    },

    async quickSaveProject() {
        // Exact Microsoft Word Ctrl+S behavior
        if (!EngineState.currentProjectSaved || !EngineState.currentProjectPath) {
            // If never saved before / Untitled -> open Save As Backstage tab
            this.openProjectManager('saveAs');
            return;
        }

        await this.saveCurrentProject(false);
    },

    async saveCurrentProject(saveAs = false) {
        try {
            const saveRevision = DesktopStorage.revision;
            const documentData = EngineState.exportProjectDocument();
            const result = await DesktopStorage.saveProject(documentData, saveAs);
            if (!result || result.cancelled) return false;
            if (!result.ok) throw new Error('Project save did not complete.');

            EngineState.currentProjectPath = result.path || EngineState.currentProjectPath;
            EngineState.currentProjectSaved = true;
            const changedDuringSave = DesktopStorage.revision !== saveRevision;
            EngineState.isDirty = changedDuringSave;
            EngineState.savedProjectsList = result.recent || DesktopStorage.recent || [];
            if (!changedDuringSave) await DesktopStorage.clearRecoveryAfterSave(EngineState.currentProjectId).catch(() => null);
            else DesktopStorage.scheduleRecovery(() => EngineState.exportProjectDocument(), true);
            this.updateSaveStatusUI();
            if (window.AudioSynth) AudioSynth.playTick();
            const badge = document.getElementById('topBarSaveStatusBadge');
            if (badge) {
                badge.textContent = changedDuringSave ? 'Unsaved' : 'Saved';
                if (!changedDuringSave) setTimeout(() => Studio.updateSaveStatusUI(), 2500);
            }
            return true;
        } catch (error) {
            EngineState.isDirty = true;
            this.updateSaveStatusUI();
            console.error('Project save failed:', error);
            alert(`Project could not be saved: ${error.message}`);
            return false;
        }
    },

    openProjectManager(tabId = 'recent') {
        const modal = document.getElementById('projectModal');
        if (!modal) return;
        modal.style.display = 'flex';
        this.switchWordTab(tabId);
    },

    closeProjectManager() {
        const modal = document.getElementById('projectModal');
        if (modal) modal.style.display = 'none';
    },

    switchWordTab(tabId) {
        const tabs = ['recent', 'new', 'open', 'saveAs'];
        tabs.forEach(t => {
            const btn = document.getElementById(`wordTabBtn_${t}`);
            if (btn) {
                if (t === tabId) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
        this.renderWordBackstageTab(tabId);
    },

    renderWordBackstageTab(tabId) {
        const contentArea = document.getElementById('wordBackstageContentArea');
        if (!contentArea) return;
        const S = EngineState;
        const safeCurrentProjectName = this.escapeHtml(S.currentProjectName || 'Untitled Project');

        if (tabId === 'recent') {
            const projects = S.loadSavedProjectsList();
            let rowsHtml = '';
            if (projects.length === 0) {
                rowsHtml = `<div class="ui-empty-state">No Recent Projects</div>`;
            } else {
                let listItems = '';
                projects.forEach(p => {
                    const isCurrent = !!(p.path && p.path === S.currentProjectPath);
                    const pathToken = encodeURIComponent(p.path || '').replace(/'/g, '%27');
                    const projectName = this.escapeHtml(p.name || 'Untitled Project');
                    const parsedUpdatedAt = p.updatedAt ? new Date(p.updatedAt) : null;
                    const updatedAt = this.escapeHtml(parsedUpdatedAt && !Number.isNaN(parsedUpdatedAt.getTime())
                        ? parsedUpdatedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                        : 'Recently');
                    const totalRounds = Math.max(1, Number(p.totalRounds) || 1);
                    const participantCount = Math.max(0, Number(p.participantCount) || 0);
                    listItems += `
                        <div style="padding:14px 18px; border-bottom:1px solid var(--border-light); display:flex; align-items:center; justify-content:space-between; background:${isCurrent ? 'rgba(47, 128, 255, 0.13)' : 'var(--bg-elevated)'}; border-radius:var(--radius-sm); margin-bottom:8px;">
                            <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                                <div style="font-weight:800; font-size:15px; color:${isCurrent ? 'var(--accent-cyan)' : '#fff'}; display:flex; align-items:center; gap:8px;">
                                    <i data-lucide="file" aria-hidden="true"></i>
                                    <span>${projectName}</span>
                                    ${isCurrent ? `<span style="font-size:10px; background:var(--accent-cyan); color:#000; padding:2px 6px; border-radius:3px; font-weight:800;">CURRENT</span>` : ''}
                                </div>
                                <div style="font-size:11px; color:var(--text-secondary);">
                                    ${updatedAt} &middot; ${totalRounds} Rounds &middot; ${participantCount} Participants${p.missing ? ' &middot; File Missing' : ''}
                                </div>
                            </div>
                            <div style="display:flex; gap:8px;">
                                ${!isCurrent && !p.missing ? `
                                <button class="btn-arena btn-arena-primary" onclick="Studio.loadProjectFromLocal('${pathToken}')" style="padding:6px 16px; font-size:12px; font-weight:700;">
                                    Open
                                </button>
                                ` : ''}
                                <button class="btn-arena btn-arena-danger" onclick="Studio.deleteProjectFromLocal('${pathToken}')" style="padding:6px 12px; font-size:12px;">
                                    Remove
                                </button>
                            </div>
                        </div>
                    `;
                });
                rowsHtml = listItems;
            }

            contentArea.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div style="border-bottom:1px solid var(--border-light); padding-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:18px; font-weight:800; color:#fff;">Recent Projects</div>
                        </div>
                        <div style="background:#111; border:1px solid var(--accent-cyan); padding:8px 14px; border-radius:var(--radius-sm); font-size:12px; font-weight:700; color:var(--accent-cyan);">
                            ${safeCurrentProjectName}
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column;">
                        ${rowsHtml}
                    </div>
                </div>
            `;
        } else if (tabId === 'new') {
            contentArea.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div style="border-bottom:1px solid var(--border-light); padding-bottom:12px;">
                        <div style="font-size:18px; font-weight:800; color:#fff;">New Project</div>
                    </div>

                    <!-- Custom Blank Project Box -->
                    <div style="background:var(--bg-elevated); border:1px solid var(--accent-cyan); border-radius:var(--radius-md); padding:20px; display:flex; flex-direction:column; gap:12px;">
                        <div style="font-size:14px; font-weight:800; color:var(--accent-cyan); display:flex; align-items:center; gap:8px;">
                            <i data-lucide="file-plus" aria-hidden="true"></i>
                            <span>Blank Project</span>
                        </div>
                        <div style="display:flex; gap:12px;">
                            <input type="text" id="newWordProjNameInput" placeholder="Project Name" style="flex:1; font-size:14px; padding:10px 14px; background:#111; border:1px solid var(--border-light); color:#fff; border-radius:var(--radius-sm);">
                            <button class="btn-arena btn-arena-primary" onclick="Studio.createNewWordProjectFlow()" style="padding:10px 24px; font-size:14px; font-weight:800;">
                                Create Blank
                            </button>
                        </div>
                    </div>

                    <div style="font-size:13px; font-weight:700; color:var(--text-secondary); margin-top:10px;">Templates</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
                        <div class="word-template-card" onclick="Studio.applyWordTemplate('gala')">
                            <i data-lucide="trophy" aria-hidden="true"></i>
                            <div style="font-weight:800; font-size:14px; color:#fff;">Gala Dinner · 10 Rounds</div>
                        </div>
                        <div class="word-template-card" onclick="Studio.applyWordTemplate('quick3')">
                            <i data-lucide="zap" aria-hidden="true"></i>
                            <div style="font-weight:800; font-size:14px; color:#fff;">Quick Draw · 3 Rounds</div>
                        </div>
                        <div class="word-template-card" onclick="Studio.applyWordTemplate('single')">
                            <i data-lucide="gift" aria-hidden="true"></i>
                            <div style="font-weight:800; font-size:14px; color:#fff;">Grand Prize · 1 Round</div>
                        </div>
                    </div>
                </div>
            `;
        } else if (tabId === 'open') {
            contentArea.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div style="border-bottom:1px solid var(--border-light); padding-bottom:12px;">
                        <div style="font-size:18px; font-weight:800; color:#fff;">Open Project</div>
                    </div>

                    <label style="border:2px dashed var(--accent-cyan); border-radius:var(--radius-lg); padding:60px 20px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; cursor:pointer; background:rgba(18, 207, 255, 0.035); transition:all 0.2s;" onmouseover="this.style.background='rgba(18, 207, 255, 0.08)'" onmouseout="this.style.background='rgba(18, 207, 255, 0.035)'">
                        <i data-lucide="folder-open" aria-hidden="true" style="width:48px; height:48px; color:var(--accent-cyan);"></i>
                        <div style="font-size:16px; font-weight:800; color:#fff;">Choose Project File</div>
                        <div style="font-size:12px; color:var(--text-secondary);">.ldp · .json</div>
                        <input id="browserProjectFileInput" type="file" accept=".json,.ldp" style="display:none;" onclick="if(window.DesktopStorage && DesktopStorage.bridge){event.preventDefault(); Studio.openProjectFile();}" onchange="Studio.importProjectFile(event)">
                    </label>
                    <button class="btn-arena" onclick="Studio.openLegacyRecovery()" style="align-self:flex-start; padding:10px 16px;"><i data-lucide="archive-restore" aria-hidden="true"></i>Recover Browser Data</button>
                </div>
            `;
        } else if (tabId === 'saveAs') {
            contentArea.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div style="border-bottom:1px solid var(--border-light); padding-bottom:12px;">
                        <div style="font-size:18px; font-weight:800; color:#fff;">Save As</div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                        <div style="background:var(--bg-elevated); border:1px solid var(--border-light); border-radius:var(--radius-md); padding:24px; display:flex; flex-direction:column; gap:14px;">
                            <div style="font-size:15px; font-weight:800; color:var(--accent-cyan); display:flex; align-items:center; gap:8px;">
                                <i data-lucide="save" aria-hidden="true"></i>
                                <span>Project File</span>
                            </div>
                            <label style="font-size:11px; color:#aaa; font-weight:700;">Project Name</label>
                            <input type="text" id="saveAsNameInput" value="${safeCurrentProjectName}" style="padding:10px 14px; background:#111; border:1px solid #333; color:#fff; border-radius:var(--radius-sm); font-size:14px;">
                            <button class="btn-arena btn-arena-primary" onclick="Studio.confirmSaveAsLocal()" style="margin-top:auto; padding:12px; font-size:14px; font-weight:800;">
                                Save As
                            </button>
                        </div>

                        <div style="background:var(--bg-elevated); border:1px solid var(--border-light); border-radius:var(--radius-md); padding:24px; display:flex; flex-direction:column; gap:14px;">
                            <div style="font-size:15px; font-weight:800; color:#fff; display:flex; align-items:center; gap:8px;">
                                <i data-lucide="copy" aria-hidden="true"></i>
                                <span>Project Copy</span>
                            </div>
                            <div style="background:#111; padding:12px; border-radius:var(--radius-sm); border:1px solid #222; font-family:var(--font-mono); font-size:11px; color:#aaa;">
                                ${(S.currentProjectName || 'project').toLowerCase().replace(/[^a-z0-9]/g, '_')}_v6.ldp
                            </div>
                            <button class="btn-arena" onclick="Studio.exportProjectFile()" style="margin-top:auto; padding:12px; font-size:14px; font-weight:800; border-color:var(--accent-cyan); color:var(--accent-cyan);">
                                Save a Copy
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    createNewWordProjectFlow() {
        const input = document.getElementById('newWordProjNameInput');
        const name = input ? input.value.trim() : "";
        if (EngineState.isDirty && !confirm("Create a new project without saving the current changes?")) return;
        if (!name && !confirm("Create new Untitled Project? Any unsaved changes will be reset.")) return;
        
        EngineState.createNewProject(name || "Untitled Project");
        if (window.ZoneA) ZoneA.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneC) ZoneC.render();
        if (window.ZoneD) ZoneD.render();
        if (window.ZoneE) ZoneE.render();
        if (window.Display) Display.resetDisplayForNewRound();
        
        this.switchWordTab('recent');
    },

    applyWordTemplate(templateType) {
        const S = EngineState;
        if (templateType === 'gala') {
            if (!confirm("Apply 10-Round Gala Dinner template?")) return;
            S.createNewProject("Gala Dinner Event 2026", ["Grand Prizes", "VIP Draw", "Regular Draw", "Consolation"]);
            S.totalRounds = 10;
            S.roundConfigs = [];
            for (let i = 0; i < 10; i++) {
                const rc = S.getDefaultRoundConfig(i);
                if (i === 0) { rc.category = "Grand Prizes"; rc.winnerCount = 1; rc.dataSource = "numeric"; }
                else if (i <= 2) { rc.category = "VIP Draw"; rc.winnerCount = 3; rc.dataSource = "list"; }
                else if (i <= 6) { rc.category = "Regular Draw"; rc.winnerCount = 5; rc.dataSource = "list"; }
                else { rc.category = "Consolation"; rc.winnerCount = 10; rc.dataSource = "numeric"; }
                S.roundConfigs.push(rc);
            }
        } else if (templateType === 'quick3') {
            if (!confirm("Apply Quick 3-Round template?")) return;
            S.createNewProject("Quick Draw 3 Rounds", ["1st Prize", "2nd Prize", "3rd Prize"]);
            S.totalRounds = 3;
            S.roundConfigs = [
                { ...S.getDefaultRoundConfig(0), category: "1st Prize", winnerCount: 1, dataSource: "numeric" },
                { ...S.getDefaultRoundConfig(1), category: "2nd Prize", winnerCount: 2, dataSource: "numeric" },
                { ...S.getDefaultRoundConfig(2), category: "3rd Prize", winnerCount: 5, dataSource: "numeric" }
            ];
        } else if (templateType === 'single') {
            if (!confirm("Apply Single Grand Prize suspense template?")) return;
            S.createNewProject("Grand Prize Draw", ["Grand Prize"]);
            S.totalRounds = 1;
            S.roundConfigs = [{ ...S.getDefaultRoundConfig(0), category: "Grand Prize", winnerCount: 1, dataSource: "numeric", animationStyle: "simultaneous" }];
            S.displaySettings.drawSpeed = "suspense";
        }

        S.currentRound = 0;
        S.syncSettingsFromConfigs();
        S.autoSaveAllSettings();
        if (window.ZoneA) ZoneA.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneC) ZoneC.render();
        if (window.ZoneD) ZoneD.render();
        if (window.ZoneE) ZoneE.render();
        if (window.Display) Display.resetDisplayForNewRound();
        this.switchWordTab('recent');
    },

    async confirmSaveAsLocal() {
        const input = document.getElementById('saveAsNameInput');
        const name = input ? input.value.trim() : "";
        if (name) EngineState.currentProjectName = name;

        const saved = await this.saveCurrentProject(true);
        if (saved) {
            if (window.ZoneB) ZoneB.render();
            alert(`Document "${EngineState.currentProjectName}" saved successfully.`);
            this.switchWordTab('recent');
        }
    },

    async loadProjectFromLocal(pathToken) {
        if (EngineState.isDirty && !confirm("You have unsaved changes in your current document. Open another project without saving?")) return;
        try {
            const result = await DesktopStorage.openRecent(decodeURIComponent(pathToken));
            if (!result || !result.ok || !EngineState.applyProjectDocument(result.document, { path: result.path })) {
                throw new Error('Project data is invalid.');
            }
            EngineState.savedProjectsList = result.recent || DesktopStorage.recent || [];
            this.refreshAfterProjectLoad();
            this.closeProjectManager();
        } catch (error) {
            console.error('Recent project open failed:', error);
            alert(`Could not load selected project: ${error.message}`);
        }
    },

    async deleteProjectFromLocal(pathToken) {
        if (!confirm("Remove this file from the Recent Projects list? The .ldp file will not be deleted.")) return;
        try {
            EngineState.savedProjectsList = await DesktopStorage.removeRecent(decodeURIComponent(pathToken));
            this.switchWordTab('recent');
        } catch (error) {
            alert(`Recent entry could not be removed: ${error.message}`);
        }
    },

    async exportProjectFile() {
        await this.saveCurrentProject(true);
    },

    async openProjectFile() {
        if (EngineState.isDirty && !confirm('Open another project without saving the current changes?')) return;
        try {
            const result = await DesktopStorage.openProject();
            if (result && result.needsBrowserFile) {
                const input = document.getElementById('browserProjectFileInput');
                if (input) input.click();
                return;
            }
            if (!result || result.cancelled) return;
            if (!result.ok || !EngineState.applyProjectDocument(result.document, { path: result.path })) {
                throw new Error('Project data is invalid.');
            }
            EngineState.savedProjectsList = result.recent || DesktopStorage.recent || [];
            this.refreshAfterProjectLoad();
            this.closeProjectManager();
        } catch (error) {
            console.error('Project open failed:', error);
            alert(`Project could not be opened: ${error.message}`);
        }
    },

    openLegacyRecovery() {
        window.open('legacy-recovery.html', 'LuckyDrawLegacyRecovery', 'width=820,height=680,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
    },

    async importProjectFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (EngineState.isDirty && !confirm(`Import project file "${file.name}" over your unsaved session?`)) return;
        try {
            const result = await DesktopStorage.openBrowserFile(file);
            if (!result.ok || !EngineState.applyProjectDocument(result.document, { path: null })) {
                throw new Error('Invalid or corrupted project file format.');
            }
            EngineState.currentProjectSaved = false;
            this.refreshAfterProjectLoad();
            this.closeProjectManager();
            alert(`Project "${EngineState.currentProjectName}" imported successfully.`);
        } catch (error) {
            console.error('Browser project import failed:', error);
            alert(`Project could not be imported: ${error.message}`);
        } finally {
            event.target.value = '';
        }
    },

    refreshAfterProjectLoad() {
        if (window.ZoneA) ZoneA.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneC) ZoneC.render();
        if (window.ZoneD) ZoneD.render();
        if (window.ZoneE) ZoneE.render();
        if (EngineState.drawState && EngineState.roundResults.some(Boolean)) Draw.initializeDisplayMode(false);
        else {
            Draw.initializePoolsSilently();
            if (window.Display) Display.resetDisplayForNewRound();
        }
    },

    // ---- 2-Column Prize Category Manager (No Icons, WordPress/Pro Layout) ----
    openCategoryManager() {
        const modal = document.getElementById('categoryManagerModal');
        if (!modal) return;
        this.resetCategoryForm();
        this.renderCategoryManagerTable();
        modal.style.display = 'flex';
    },

    closeCategoryManager() {
        const modal = document.getElementById('categoryManagerModal');
        if (modal) modal.style.display = 'none';
        if (window.ZoneA) ZoneA.render();
        if (window.ZoneD) ZoneD.render();
    },

    resetCategoryForm() {
        const titleEl = document.getElementById('catFormHeaderTitle');
        const origInput = document.getElementById('catEditOriginalName');
        const nameInput = document.getElementById('catFormNameInput');
        const poolSelect = document.getElementById('catFormPoolSelect');
        const submitBtn = document.getElementById('catFormSubmitBtn');
        const resetBtn = document.getElementById('catFormResetBtn');

        if (titleEl) titleEl.textContent = "Add Prize Category";
        if (origInput) origInput.value = "";
        if (nameInput) nameInput.value = "";
        if (poolSelect) poolSelect.value = "numeric";
        if (submitBtn) submitBtn.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i>Add';
        if (resetBtn) resetBtn.style.display = "none";

        const radios = document.getElementsByName('catFormColor');
        for (let r of radios) {
            if (r.value === 'gold') r.checked = true;
        }
    },

    selectCategoryForEdit(categoryName) {
        const titleEl = document.getElementById('catFormHeaderTitle');
        const origInput = document.getElementById('catEditOriginalName');
        const nameInput = document.getElementById('catFormNameInput');
        const poolSelect = document.getElementById('catFormPoolSelect');
        const submitBtn = document.getElementById('catFormSubmitBtn');
        const resetBtn = document.getElementById('catFormResetBtn');

        const themeObj = EngineState.getCategoryThemeObj(categoryName);

        if (titleEl) titleEl.textContent = "Edit Prize Category · " + categoryName;
        if (origInput) origInput.value = categoryName;
        if (nameInput) {
            nameInput.value = categoryName;
            nameInput.focus();
        }
        if (poolSelect) poolSelect.value = themeObj.defaultPool || "numeric";
        if (submitBtn) submitBtn.innerHTML = '<i data-lucide="check" aria-hidden="true"></i>Update';
        if (resetBtn) resetBtn.style.display = "block";

        const radios = document.getElementsByName('catFormColor');
        for (let r of radios) {
            if (r.value === (themeObj.color || 'cyan')) r.checked = true;
        }
    },

    saveCategoryFromForm() {
        const origInput = document.getElementById('catEditOriginalName');
        const nameInput = document.getElementById('catFormNameInput');
        const poolSelect = document.getElementById('catFormPoolSelect');

        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) {
            alert("Prize Category is required.");
            return;
        }

        let selectedColor = "cyan";
        const radios = document.getElementsByName('catFormColor');
        for (let r of radios) {
            if (r.checked) { selectedColor = r.value; break; }
        }
        const selectedPool = poolSelect ? poolSelect.value : "numeric";

        const origName = origInput ? origInput.value : "";
        if (origName) {
            EngineState.renameCategory(origName, name, selectedColor, selectedPool);
        } else {
            if (EngineState.prizeCategories.includes(name)) {
                alert("A prize category with this exact name already exists.");
                return;
            }
            EngineState.saveCategorySettings(name, selectedColor, selectedPool);
        }

        this.resetCategoryForm();
        this.renderCategoryManagerTable();
        if (window.ZoneA) ZoneA.render();
        if (window.ZoneD) ZoneD.render();
    },

    deleteCategoryFromManager(categoryName) {
        if (!confirm(`Are you sure you want to delete category "${categoryName}"? Any rounds assigned to it will be moved to default.`)) return;
        EngineState.deleteCategory(categoryName);
        this.resetCategoryForm();
        this.renderCategoryManagerTable();
        if (window.ZoneA) ZoneA.render();
        if (window.ZoneD) ZoneD.render();
    },

    reorderCategoryManager(index, direction) {
        EngineState.reorderCategory(index, direction);
        this.renderCategoryManagerTable();
        if (window.ZoneA) ZoneA.render();
    },

    // ---- Drag and Drop Category Reordering ----
    catDraggedIndex: null,

    onCatDragStart(event, index) {
        this.catDraggedIndex = index;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', index);
        const trEl = event.currentTarget;
        setTimeout(() => { if (trEl) trEl.style.opacity = '0.3'; }, 0);
    },

    onCatDragOver(event) {
        if (this.catDraggedIndex === null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const trEl = event.currentTarget;
        if (trEl && !trEl.classList.contains('cat-drag-over')) {
            trEl.classList.add('cat-drag-over');
            trEl.style.borderTop = '2px solid var(--accent-cyan)';
            trEl.style.background = 'rgba(47, 128, 255, 0.15)';
        }
    },

    onCatDragLeave(event) {
        const trEl = event.currentTarget;
        if (trEl) {
            trEl.classList.remove('cat-drag-over');
            trEl.style.borderTop = '1px solid #222';
            trEl.style.background = '';
        }
    },

    onCatDrop(event, targetIndex) {
        event.preventDefault();
        const trEl = event.currentTarget;
        if (trEl) {
            trEl.classList.remove('cat-drag-over');
            trEl.style.borderTop = '1px solid #222';
            trEl.style.background = '';
            trEl.style.opacity = '1';
        }

        const fromIndex = this.catDraggedIndex;
        this.catDraggedIndex = null;
        if (fromIndex === null || fromIndex === targetIndex) {
            this.renderCategoryManagerTable();
            return;
        }

        EngineState.reorderPrizeCategories(fromIndex, targetIndex);
        this.renderCategoryManagerTable();
        if (window.ZoneA) ZoneA.render();
        if (window.ZoneD) ZoneD.render();
    },

    renderCategoryManagerTable() {
        const container = document.getElementById('categoryManagerTableContainer');
        const countBadge = document.getElementById('catManagerTotalCount');
        if (!container) return;

        const categories = EngineState.prizeCategories || [];
        if (countBadge) countBadge.textContent = categories.length;

        if (categories.length === 0) {
            container.innerHTML = `<div class="ui-empty-state">No Prize Categories</div>`;
            return;
        }

        let html = `
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
                <thead>
                    <tr style="background:#1a1a1a; border-bottom:1px solid #333; color:#aaa; font-size:11px; text-transform:uppercase;">
                        <th style="padding:12px 6px 12px 14px; width:36px; text-align:center;"></th>
                        <th style="padding:12px 14px; font-weight:800;">Prize Category</th>
                        <th style="padding:12px 14px; font-weight:800;">Draw Source</th>
                        <th style="padding:12px 14px; font-weight:800; text-align:center;">Rounds</th>
                        <th style="padding:12px 14px; font-weight:800; text-align:right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        categories.forEach((catName, idx) => {
            const themeObj = EngineState.getCategoryThemeObj(catName);
            const badgeColor = EngineState.getCategoryColor(catName);
            const poolText = (themeObj.defaultPool === 'list') ? 'Participant Name' : ((themeObj.defaultPool === 'id') ? 'ID Ticket' : 'Number Range');
            const roundsCount = EngineState.roundConfigs.filter(r => r.category === catName).length;

            html += `
                <tr draggable="true"
                    ondragstart="Studio.onCatDragStart(event, ${idx})"
                    ondragover="Studio.onCatDragOver(event)"
                    ondragleave="Studio.onCatDragLeave(event)"
                    ondrop="Studio.onCatDrop(event, ${idx})"
                    style="border-bottom:1px solid #222; background:${idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}; transition:all 0.2s; cursor:grab;"
                    onmouseover="this.style.background='rgba(18, 207, 255, 0.055)'"
                    onmouseout="this.style.background='${idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}'"
                    title="Reorder Prize Category">
                    <td style="padding:12px 6px 12px 14px; text-align:center; color:#555; font-size:16px;">
                        <i data-lucide="grip-vertical" aria-hidden="true"></i>
                    </td>
                    <td style="padding:12px 14px; font-weight:800; color:#fff;">
                        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${badgeColor}; margin-right:8px;"></span>
                        ${catName}
                    </td>
                    <td style="padding:12px 14px; color:#aaa; font-size:12px;">
                        ${poolText}
                    </td>
                    <td style="padding:12px 14px; text-align:center; font-family:var(--font-mono); font-weight:700; color:#fff;">
                        <span style="background:#222; border:1px solid #333; padding:2px 8px; border-radius:10px; font-size:11px;">
                            ${roundsCount}
                        </span>
                    </td>
                    <td style="padding:12px 14px; text-align:right;">
                        <div style="display:flex; justify-content:flex-end; gap:6px;">
                            <button class="btn-arena" onclick="Studio.selectCategoryForEdit('${catName.replace(/'/g, "\\'")}')" title="Edit Prize Category" style="padding:6px 12px; font-size:11px; border-color:#444;">
                                <i data-lucide="pencil" aria-hidden="true"></i>Edit
                            </button>
                            <button class="btn-arena btn-arena-danger" onclick="Studio.deleteCategoryFromManager('${catName.replace(/'/g, "\\'")}')" title="Delete Prize Category" style="padding:6px 10px; font-size:11px;">
                                <i data-lucide="trash-2" aria-hidden="true"></i>Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        container.innerHTML = html;
    },

    // ---- Keyboard Shortcuts Help Modal (Point 6) ----
    openHotkeysHelp() {
        const modal = document.getElementById('hotkeysModal');
        if (modal) modal.style.display = 'flex';
    },

    closeHotkeysHelp() {
        const modal = document.getElementById('hotkeysModal');
        if (modal) modal.style.display = 'none';
    },

    // ---- Master Participant Table Dashboard & Excel Suite ----
    partFilterTab: 'all', // 'all', 'eligible', 'winners', 'disabled'
    partSelectedIndices: new Set(),

    openParticipantManager() {
        const modal = document.getElementById('participantManagerModal');
        if (modal) {
            modal.style.display = 'flex';
            this.partSelectedIndices.clear();
            this.renderParticipantManagerTable();
        }
    },

    closeParticipantManager() {
        const modal = document.getElementById('participantManagerModal');
        if (modal) modal.style.display = 'none';
        if (window.ZoneE) ZoneE.render();
    },

    setPartFilterTab(tabName) {
        this.partFilterTab = tabName;
        ['all', 'eligible', 'winners', 'disabled'].forEach(t => {
            const btn = document.getElementById(`partTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
            if (btn) {
                if (t === tabName) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
        this.partSelectedIndices.clear();
        this.renderParticipantManagerTable();
    },

    renderParticipantManagerTable() {
        const S = EngineState;
        const container = document.getElementById('partMgrTableContainer');
        if (!container) return;

        const allParticipants = S.getParticipantList();
        const wonIds = new Set();
        const wonDetails = new Map();
        (S.allWinners || []).forEach(w => {
            if (w && w.id) {
                wonIds.add(w.id);
                wonDetails.set(w.id, w);
            }
        });

        // Update counts
        const cntAll = allParticipants.length;
        const cntEligible = allParticipants.filter(p => !p.hidden && !wonIds.has(p.id)).length;
        const cntWinners = allParticipants.filter(p => wonIds.has(p.id)).length;
        const cntDisabled = allParticipants.filter(p => p.hidden).length;

        const elAll = document.getElementById('partCountAll');
        const elElig = document.getElementById('partCountEligible');
        const elWin = document.getElementById('partCountWinners');
        const elDis = document.getElementById('partCountDisabled');
        if (elAll) elAll.innerText = cntAll;
        if (elElig) elElig.innerText = cntEligible;
        if (elWin) elWin.innerText = cntWinners;
        if (elDis) elDis.innerText = cntDisabled;

        const searchEl = document.getElementById('partMgrSearchInput');
        const q = searchEl ? searchEl.value.trim().toLowerCase() : '';

        // Filter participants
        const filtered = allParticipants.map((p, idx) => ({ ...p, originalIndex: idx })).filter(p => {
            const idMatch = (p.id || '').toLowerCase().includes(q);
            const nameMatch = (p.name || '').toLowerCase().includes(q);
            const deptMatch = (p.dept || '').toLowerCase().includes(q);
            const matchesSearch = (!q || idMatch || nameMatch || deptMatch);
            if (!matchesSearch) return false;

            const isWon = wonIds.has(p.id) || wonIds.has(`l_${p.originalIndex + 1}`) || wonIds.has(`i_${p.originalIndex + 1}`);
            if (this.partFilterTab === 'eligible') return !p.hidden && !isWon;
            if (this.partFilterTab === 'winners') return isWon;
            if (this.partFilterTab === 'disabled') return p.hidden;
            return true;
        });

        // Update batch bar
        const batchBar = document.getElementById('partMgrBatchBar');
        const selCountEl = document.getElementById('partMgrSelectedCount');
        if (batchBar && selCountEl) {
            if (this.partSelectedIndices.size > 0) {
                batchBar.style.display = 'flex';
                selCountEl.innerText = this.partSelectedIndices.size;
            } else {
                batchBar.style.display = 'none';
            }
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="padding:40px; text-align:center; color:#666; font-size:13px;">
                    No Participants
                </div>
            `;
            return;
        }

        let html = `
            <table class="category-table" style="width:100%; border-collapse:collapse; text-align:left;">
                <thead>
                    <tr style="background:#1a1a1a; border-bottom:1px solid #282828; color:#aaa; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">
                        <th style="padding:12px 14px; width:40px; text-align:center;">
                            <input type="checkbox" onchange="Studio.toggleSelectAllParticipants(this.checked)" style="accent-color:var(--accent-cyan); width:15px; height:15px; cursor:pointer;">
                        </th>
                        <th style="padding:12px 14px; width:140px;">ID / Ticket #</th>
                        <th style="padding:12px 14px;">Full Name</th>
                        <th style="padding:12px 14px; width:220px;">Department / Company</th>
                        <th style="padding:12px 14px; width:140px; text-align:center;">Status</th>
                        <th style="padding:12px 14px; width:180px; text-align:right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach((p, rowIdx) => {
            const isWon = wonIds.has(p.id) || wonIds.has(`l_${p.originalIndex + 1}`) || wonIds.has(`i_${p.originalIndex + 1}`);
            const isChecked = this.partSelectedIndices.has(p.originalIndex);

            let badgeHtml = '';
            if (p.hidden) {
                badgeHtml = `<span style="background:rgba(255,255,255,0.08); border:1px solid #555; color:#aaa; padding:3px 10px; border-radius:12px; font-size:10px; font-weight:700;">Excluded</span>`;
            } else if (isWon) {
                badgeHtml = `<span style="background:rgba(245,158,11,0.15); border:1px solid #f59e0b; color:#f59e0b; padding:3px 10px; border-radius:12px; font-size:10px; font-weight:700;">Winner</span>`;
            } else {
                badgeHtml = `<span style="background:rgba(0,229,163,0.12); border:1px solid var(--accent-cyan); color:var(--accent-cyan); padding:3px 10px; border-radius:12px; font-size:10px; font-weight:700;">Eligible</span>`;
            }

            html += `
                <tr style="border-bottom:1px solid #222; background:${rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}; transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(18, 207, 255, 0.045)'"
                    onmouseout="this.style.background='${rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}'">
                    <td style="padding:10px 14px; text-align:center;">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="Studio.toggleSelectParticipant(${p.originalIndex}, this.checked)" style="accent-color:var(--accent-cyan); width:15px; height:15px; cursor:pointer;">
                    </td>
                    <td style="padding:10px 14px; font-family:var(--font-mono); font-weight:700; color:var(--accent-cyan);">
                        ${p.id || p.ticket || `<span style="color:#666; font-weight:400;">#${p.originalIndex + 1}</span>`}
                    </td>
                    <td style="padding:10px 14px; font-weight:700; color:#fff;">
                        ${p.name || '---'}
                    </td>
                    <td style="padding:10px 14px; color:#bbb; font-size:12px;">
                        ${p.dept || p.company || p.phone || '---'}
                    </td>
                    <td style="padding:10px 14px; text-align:center;">
                        ${badgeHtml}
                    </td>
                    <td style="padding:10px 14px; text-align:right;">
                        <div style="display:flex; justify-content:flex-end; gap:6px;">
                            <button class="btn-arena" onclick="Studio.editParticipantPrompt(${p.originalIndex})" title="Edit Participant" style="padding:4px 10px; font-size:11px;">
                                <i data-lucide="pencil" aria-hidden="true"></i>Edit
                            </button>
                            <button class="btn-arena" onclick="Studio.toggleParticipantStatus(${p.originalIndex})" title="${p.hidden ? 'Include Participant' : 'Exclude Participant'}" style="padding:4px 10px; font-size:11px; border-color:${p.hidden ? 'var(--accent-cyan)' : '#444'}; color:${p.hidden ? 'var(--accent-cyan)' : '#bbb'};">
                                <i data-lucide="${p.hidden ? 'user-check' : 'user-x'}" aria-hidden="true"></i>${p.hidden ? 'Include' : 'Exclude'}
                            </button>
                            <button class="btn-arena btn-arena-danger" onclick="Studio.deleteParticipantConfirm(${p.originalIndex})" title="Delete Participant" style="padding:4px 8px; font-size:11px;">
                                <i data-lucide="trash-2" aria-hidden="true"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    },

    toggleSelectParticipant(idx, checked) {
        if (checked) this.partSelectedIndices.add(idx);
        else this.partSelectedIndices.delete(idx);
        this.renderParticipantManagerTable();
    },

    toggleSelectAllParticipants(checked) {
        const S = EngineState;
        const allParticipants = S.getParticipantList();
        if (checked) {
            allParticipants.forEach((_, idx) => this.partSelectedIndices.add(idx));
        } else {
            this.partSelectedIndices.clear();
        }
        this.renderParticipantManagerTable();
    },

    batchToggleParticipants(enable) {
        if (this.partSelectedIndices.size === 0) return;
        const S = EngineState;
        const list = S.getParticipantList();
        this.partSelectedIndices.forEach(idx => {
            if (list[idx]) list[idx].hidden = !enable;
        });
        S.saveParticipantList(list);
        Draw.initializePoolsSilently();
        this.partSelectedIndices.clear();
        this.renderParticipantManagerTable();
        if (window.ZoneE) ZoneE.render();
    },

    batchDeleteParticipants() {
        if (this.partSelectedIndices.size === 0) return;
        if (!confirm(`Are you sure you want to permanently delete ${this.partSelectedIndices.size} selected participant(s)?`)) return;
        const S = EngineState;
        const list = S.getParticipantList();
        const toDelete = new Set(this.partSelectedIndices);
        const newList = list.filter((_, idx) => !toDelete.has(idx));
        S.saveParticipantList(newList);
        Draw.initializePoolsSilently();
        this.partSelectedIndices.clear();
        this.renderParticipantManagerTable();
        if (window.ZoneE) ZoneE.render();
    },

    addQuickParticipant() {
        const idEl = document.getElementById('partQuickIdInput');
        const nameEl = document.getElementById('partQuickNameInput');
        const deptEl = document.getElementById('partQuickDeptInput');
        if (!nameEl || !nameEl.value.trim()) {
            alert('Full Name is required.');
            return;
        }
        const S = EngineState;
        const list = S.getParticipantList();
        list.push({
            id: idEl && idEl.value.trim() ? idEl.value.trim() : (list.length + 1).toString(),
            name: nameEl.value.trim(),
            dept: deptEl ? deptEl.value.trim() : '',
            phone: '',
            eligibility: 'All',
            status: 'ELIGIBLE',
            hidden: false
        });
        S.saveParticipantList(list);
        Draw.initializePoolsSilently();
        if (idEl) idEl.value = '';
        if (nameEl) nameEl.value = '';
        if (deptEl) deptEl.value = '';
        this.renderParticipantManagerTable();
        if (window.ZoneE) ZoneE.render();
    },

    editParticipantPrompt(idx) {
        const S = EngineState;
        const list = S.getParticipantList();
        const p = list[idx];
        if (!p) return;
        const newId = prompt('ID / Ticket #', p.id || p.ticket || '');
        if (newId === null) return;
        const newName = prompt('Full Name', p.name || '');
        if (newName === null || !newName.trim()) return;
        const newDept = prompt('Department / Company', p.dept || p.company || '');
        if (newDept === null) return;

        p.id = newId.trim();
        p.name = newName.trim();
        p.dept = newDept.trim();
        S.saveParticipantList(list);
        Draw.initializePoolsSilently();
        this.renderParticipantManagerTable();
        if (window.ZoneE) ZoneE.render();
    },

    toggleParticipantStatus(idx) {
        const S = EngineState;
        const list = S.getParticipantList();
        if (list[idx]) {
            list[idx].hidden = !list[idx].hidden;
            S.saveParticipantList(list);
            Draw.initializePoolsSilently();
            this.renderParticipantManagerTable();
            if (window.ZoneE) ZoneE.render();
        }
    },

    deleteParticipantConfirm(idx) {
        const S = EngineState;
        const list = S.getParticipantList();
        const p = list[idx];
        if (!p) return;
        if (!confirm(`Delete participant "${p.name || p.id}"?`)) return;
        list.splice(idx, 1);
        S.saveParticipantList(list);
        Draw.initializePoolsSilently();
        this.renderParticipantManagerTable();
        if (window.ZoneE) ZoneE.render();
    },

    clearAllParticipantsConfirm() {
        if (!confirm('Remove all participants? This cannot be undone.')) return;
        EngineState.saveParticipantList([]);
        Draw.initializePoolsSilently();
        this.partSelectedIndices.clear();
        this.renderParticipantManagerTable();
        if (window.ZoneE) ZoneE.render();
    },

    // ---- Excel / CSV Template Options & Generation ----
    openTemplateOptionsModal() {
        const modal = document.getElementById('templateOptionsModal');
        if (modal) modal.style.display = 'flex';
    },

    closeTemplateOptionsModal() {
        const modal = document.getElementById('templateOptionsModal');
        if (modal) modal.style.display = 'none';
    },

    generateAndDownloadTemplate() {
        const incId = document.getElementById('tplIncId') ? document.getElementById('tplIncId').checked : true;
        const incDept = document.getElementById('tplIncDept') ? document.getElementById('tplIncDept').checked : true;
        const incPhone = document.getElementById('tplIncPhone') ? document.getElementById('tplIncPhone').checked : true;
        const incElig = document.getElementById('tplIncElig') ? document.getElementById('tplIncElig').checked : false;

        const formatRadio = document.querySelector('input[name="tplFormat"]:checked');
        const format = formatRadio ? formatRadio.value : 'xlsx';

        // Build sample data based strictly on checked columns
        const sampleRows = [
            { id: "EMP-001", name: "Gaspar Antunes", dept: "Marketing HQ", phone: "012-345-678", elig: "All Categories" },
            { id: "EMP-002", name: "Trienke van Aartsen", dept: "Sales & Retail", phone: "016-888-999", elig: "All Categories" },
            { id: "VIP-001", name: "Tongbang Jun-Seo", dept: "Gold Sponsor", phone: "099-168-168", elig: "VIP Only" }
        ];

        const exportData = sampleRows.map(row => {
            const obj = {};
            if (incId) obj["ID_Ticket"] = row.id;
            obj["Full_Name"] = row.name; // Always required
            if (incDept) obj["Department_Company"] = row.dept;
            if (incPhone) obj["Phone_Number"] = row.phone;
            if (incElig) obj["Category_Eligibility"] = row.elig;
            return obj;
        });

        if (format === 'xlsx') {
            const a = document.createElement('a');
            a.href = "assets/Lucky_Draw_Pro_Participants_Master_Template.xlsx";
            a.download = "Lucky_Draw_Pro_Participants_Master_Template.xlsx";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            // Generate CSV fallback
            const headers = Object.keys(exportData[0]);
            let csvContent = headers.join(",") + "\n";
            exportData.forEach(row => {
                csvContent += headers.map(h => `"${(row[h] || '').replace(/"/g, '""')}"`).join(",") + "\n";
            });
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "Lucky_Draw_Participants_Template.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        this.closeTemplateOptionsModal();
    },

    handleMasterExcelImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        const fileName = file.name.toLowerCase();

        reader.onload = (e) => {
            try {
                let parsedList = [];
                if ((fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) && window.XLSX) {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Smartly pick the target data sheet instead of blindly grabbing SheetNames[0] (which might be Instructions & Guide)
                    let targetSheetName = workbook.SheetNames.find(s => 
                        s.includes('Master_Participants_Pool') || s.includes('Master') || s.includes('Pool') || s.includes('Participants')
                    );
                    
                    if (!targetSheetName) {
                        // Look for any sheet containing valid headers
                        for (let sName of workbook.SheetNames) {
                            if (sName.includes('Instructions') || sName.includes('Guide') || sName.includes('Sample')) continue;
                            const sampleJson = XLSX.utils.sheet_to_json(workbook.Sheets[sName], { header: 1 });
                            if (sampleJson && sampleJson.length > 0) {
                                const firstRowStr = JSON.stringify(sampleJson[0] || []).toLowerCase();
                                if (firstRowStr.includes('name') || firstRowStr.includes('ticket') || firstRowStr.includes('id')) {
                                    targetSheetName = sName;
                                    break;
                                }
                            }
                        }
                    }
                    if (!targetSheetName) targetSheetName = workbook.SheetNames.find(s => !s.includes('Instructions') && !s.includes('Guide')) || workbook.SheetNames[0];

                    const worksheet = workbook.Sheets[targetSheetName];
                    const jsonRows = XLSX.utils.sheet_to_json(worksheet);

                    jsonRows.forEach((row, idx) => {
                        const idVal = row["ID_Ticket"] || row["ID"] || row["Ticket"] || row["Ticket_Number"] || row["ID/Ticket"] || row["Code"] || row["#"] || '';
                        const nameVal = row["Full_Name"] || row["Name"] || row["Participant"] || row["Guest"] || row["Full Name"] || row["Participant_Name"] || '';
                        const deptVal = row["Department_Company"] || row["Department"] || row["Company"] || row["Branch"] || row["Dept"] || row["Note"] || '';
                        const phoneVal = row["Phone_Number"] || row["Phone"] || row["Tel"] || row["Mobile"] || '';
                        const eligVal = row["Category_Eligibility"] || row["Eligibility"] || row["Tier"] || 'All';

                        const finalName = nameVal.toString().trim();
                        const finalId = idVal.toString().trim();

                        // Skip rows that have neither name nor ID (such as guide/instruction lines or blank formatting cells)
                        if (!finalName && !finalId) return;

                        parsedList.push({
                            id: finalId || (idx + 1).toString(),
                            name: finalName || finalId,
                            dept: deptVal.toString().trim(),
                            phone: phoneVal.toString().trim(),
                            eligibility: eligVal.toString().trim() || 'All',
                            status: 'ELIGIBLE',
                            hidden: false
                        });
                    });
                } else {
                    // CSV text reading
                    const text = new TextDecoder("utf-8").decode(e.target.result);
                    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
                    if (lines.length > 0) {
                        // Check if line 0 is header
                        let startIdx = 0;
                        const firstLineLower = lines[0].toLowerCase();
                        if (firstLineLower.includes('name') || firstLineLower.includes('ticket') || firstLineLower.includes('id')) {
                            startIdx = 1;
                        }
                        for (let i = startIdx; i < lines.length; i++) {
                            const cols = lines[i].split(',').map(s => s.replace(/^"|"$/g, '').trim());
                            if (cols.length >= 2) {
                                parsedList.push({
                                    id: cols[0] || (i + 1).toString(),
                                    name: cols[1] || cols[0],
                                    dept: cols[2] || '',
                                    phone: cols[3] || '',
                                    eligibility: cols[4] || 'All',
                                    status: 'ELIGIBLE',
                                    hidden: false
                                });
                            } else if (cols[0]) {
                                parsedList.push({
                                    id: (i + 1).toString(),
                                    name: cols[0],
                                    dept: '', phone: '', eligibility: 'All', status: 'ELIGIBLE', hidden: false
                                });
                            }
                        }
                    }
                }

                if (parsedList.length === 0) {
                    alert('No valid participant data found in this file.');
                    return;
                }

                const S = EngineState;
                const existing = S.getParticipantList();
                let finalList = parsedList;

                if (existing.length > 0) {
                    const choice = confirm(`Merge ${parsedList.length} imported participants with ${existing.length} existing participants?\n\nCancel replaces the existing participant list.`);
                    if (choice) {
                        finalList = [...existing, ...parsedList];
                    }
                }

                S.saveParticipantList(finalList);
                Draw.initializePoolsSilently();
                alert(`${parsedList.length} participants imported.`);
                Studio.renderParticipantManagerTable();
                if (window.ZoneE) ZoneE.render();
            } catch (err) {
                console.error("Master Excel import error:", err);
                alert("Error importing Excel/CSV file: " + err.message);
            }
            event.target.value = '';
        };

        if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Studio.init();
});
