/**
 * state.js - Core State Management (Global, non-module)
 * Preserves the draw schema while delegating persistence to DesktopStorage.
 * Upgraded for Resolume Arena 7 structure: category tabs, individual winner re-draw.
 */
window.EngineState = {
    // Project management
    currentProjectId: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `project_${Date.now()}`,
    currentProjectName: "Untitled Project",
    currentProjectPath: null,
    currentProjectCreatedAt: new Date().toISOString(),
    savedProjectsList: [],
    isDirty: false,
    currentProjectSaved: false,
    isHydrating: false,

    // Participant pools
    masterListPool: [],
    masterNumericPool: [],
    drawListPool: [],
    drawNumericPool: [],

    // Winners and rounds state
    allWinners: [],
    presetWinners: [],
    roundResults: [],
    historyEvents: [],
    prizeCategories: ["Grand Prizes", "VIP Rounds", "Regular Draw", "Consolation"],
    categoryThemes: {
        "Grand Prizes": { color: "gold", defaultPool: "numeric" },
        "VIP Rounds": { color: "purple", defaultPool: "numeric" },
        "Regular Draw": { color: "cyan", defaultPool: "numeric" },
        "Consolation": { color: "green", defaultPool: "numeric" }
    },
    activeCategoryTab: "All", // "All" or a specific category
    categoryQuotas: { "Grand Prizes": 2, "VIP Rounds": 10, "Regular Draw": 50, "Consolation": 20 },
    audioSettings: { autoSpinStart: false, autoSpinStop: false },
    telegramSettings: { groupChatId: "", botIdentity: {}, templates: {} },

    // Active draw status
    isDrawing: false,
    drawCompletedThisRound: false,
    currentRound: 0,
    totalRounds: 1,
    settings: {},

    // Media & Cache
    tempBgFile: null,
    tempBgVideoFile: null,
    assets: [],
    backgroundAssetId: null,
    shuffleIntervals: [],
    manualFontSize: null,
    fontSizeCache: {},
    openRoundDetails: new Set(),
    drawState: null,

    // Round configuration (stored locally)
    roundConfigs: [],

    // Display settings
    displaySettings: {
        animationEnabled: true,
        winnerGlowEnabled: false,
        winnerGlowColor: '#00e5a3',
        allowDuplicates: false,
        textColor: '#ffffff',
        bgType: 'image',
        startNumber: 1,
        endNumber: 1000,
        numDigits: 0,
        excludeList: '',
        drawSpeed: 'normal' // 'fast' (1s), 'normal' (3s), 'suspense' (5s)
    },

    // AnimationManager
    AnimationManager: {
        intervals: new Set(),
        timeouts: new Set(),
        addInterval(id) { this.intervals.add(id); return id; },
        addTimeout(id) { this.timeouts.add(id); return id; },
        clearAll() {
            this.intervals.forEach(clearInterval);
            this.timeouts.forEach(clearTimeout);
            this.intervals.clear();
            this.timeouts.clear();
        }
    },

    // Helpers
    normalizeName(name) {
        return name ? name.toLowerCase().replace(/\s+/g, '') : '';
    },

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    },

    getLongestName(pool, finalWinner) {
        if (!pool || pool.length === 0) return finalWinner ? finalWinner.name : "";
        const allNames = [...pool.map(p => p.name), finalWinner ? finalWinner.name : ""];
        return allNames.reduce((longest, current) => current.length > longest.length ? current : longest, "");
    },

    // ---- Participant Management ----
    getParticipantList() {
        const masterList = document.getElementById('customList');
        if (!masterList) return [];
        try {
            const data = JSON.parse(masterList.value);
            return Array.isArray(data) ? data.map((p, idx) => ({
                id: p.id || p.ticket || (p.name ? '' : (idx + 1).toString()),
                ticket: p.ticket || p.id || '',
                name: p.name || p.id || '',
                department: p.department || p.dept || p.company || 'General',
                dept: p.dept || p.department || p.company || 'General',
                category: p.category || p.eligibility || 'General',
                phone: p.phone || '',
                telegramChatId: p.telegramChatId || p.telegram || p.chat_id || p.telegram_id || '',
                eligibility: p.eligibility || p.category || 'All',
                status: p.status || 'ELIGIBLE',
                hidden: !!p.hidden
            })) : [];
        } catch (e) {
            const names = (typeof masterList.value === 'string' && masterList.value.length > 0) ? masterList.value.split('\n') : [];
            return names.map((name, idx) => ({ id: (idx + 1).toString(), ticket: (idx + 1).toString(), name: name.trim(), department: 'General', dept: 'General', category: 'General', phone: '', eligibility: 'All', status: 'ELIGIBLE', hidden: false }));
        }
    },

    saveParticipantList(participantArray) {
        const validParticipants = participantArray.filter(p => p && (typeof p.name === 'string' || typeof p.id === 'string') && ((p.name && p.name.trim() !== '') || (p.id && p.id.trim() !== '')));
        const masterList = document.getElementById('customList');
        if (masterList) masterList.value = JSON.stringify(validParticipants, null, 2);
        if (!this.isHydrating) {
            this.isDirty = true;
            if (window.DesktopStorage) DesktopStorage.scheduleRecovery(() => this.exportProjectDocument());
            if (window.Studio && typeof Studio.updateSaveStatusUI === 'function') Studio.updateSaveStatusUI();
        }
    },

    setParticipantList(participantArray) {
        this.saveParticipantList(participantArray);
    },

    loadParticipantsFromStorage() {
        const masterList = document.getElementById('customList');
        if (masterList && !masterList.value.trim()) masterList.value = '[]';
    },

    // ---- Round Config Management ----
    getDefaultRoundConfig(index) {
        return {
            dataSource: 'numeric',
            winnerCount: 1,
            layoutMode: 'grid',
            animationStyle: 'simultaneous',
            duration: 'default',
            category: 'Regular Draw',
            presets: [],
            audioSpinStart: false,
            audioSpinStop: false,
            soundSpinStart: 'drumroll',
            soundSpinStop: 'victory',
            telegramAutoGroup: false,
            telegramAutoDirect: false
        };
    },

    ensureRoundConfigs(count) {
        while (this.roundConfigs.length < count) {
            this.roundConfigs.push(this.getDefaultRoundConfig(this.roundConfigs.length));
        }
        if (this.roundConfigs.length > count) {
            this.roundConfigs.length = count;
        }
        this.totalRounds = count;
    },

    // ---- Settings Sync ----
    syncSettingsFromConfigs() {
        this.settings = { ...this.displaySettings };
        this.settings.fontSizeCache = this.fontSizeCache;
        this.settings.bgImage = this.tempBgFile ? `url('${this.tempBgFile}')` : 'none';
        this.settings.bgVideo = this.tempBgVideoFile || null;
        this.settings.numDigits = this.displaySettings.numDigits || 0;

        this.settings.winnerCounts = [];
        this.settings.roundDataSources = [];
        this.settings.roundLayoutModes = [];
        this.settings.roundAnimationStyles = [];
        this.settings.roundDurations = [];
        this.settings.roundCategories = [];
        this.presetWinners = [];

        for (let i = 0; i < this.totalRounds; i++) {
            const rc = this.roundConfigs[i] || this.getDefaultRoundConfig(i);
            // Normalize field aliases from project files
            if (rc.totalWinners !== undefined && rc.winnerCount === undefined) rc.winnerCount = rc.totalWinners;
            if (rc.prizeName && !rc.category) rc.category = rc.prizeName;
            if (!rc.winnerCount) rc.winnerCount = 1;
            if (!rc.layoutMode) rc.layoutMode = 'grid';
            if (!rc.animationStyle) rc.animationStyle = 'simultaneous';
            this.settings.winnerCounts.push(rc.winnerCount);
            this.settings.roundDataSources.push(rc.dataSource);
            this.settings.roundLayoutModes.push(rc.layoutMode);
            this.settings.roundAnimationStyles.push(rc.animationStyle);
            this.settings.roundDurations.push(rc.duration || 'default');
            this.settings.roundCategories.push(rc.category || 'Regular Draw');
            this.presetWinners.push([...(rc.presets || [])]);
        }

        document.documentElement.style.setProperty('--winner-glow-color', this.settings.winnerGlowColor || '#00e5a3');
    },

    // ---- Draw State Persistence ----
    snapshotHistoryWinner(winner) {
        if (!winner || typeof winner !== 'object') return null;
        const snapshot = {
            id: winner.id == null ? '' : String(winner.id),
            name: winner.name == null ? '' : String(winner.name),
            type: winner.type == null ? '' : String(winner.type)
        };
        if (winner.originalParticipant && winner.originalParticipant.name) {
            snapshot.participantName = String(winner.originalParticipant.name);
        }
        return snapshot;
    },

    recordHistoryEvent(event = {}) {
        if (!Array.isArray(this.historyEvents)) this.historyEvents = [];
        const allowedTypes = new Set(['draw', 'redraw', 'redraw_round']);
        const type = allowedTypes.has(event.type) ? event.type : 'draw';
        const roundIndex = Number.isInteger(event.roundIndex) ? event.roundIndex : this.currentRound;
        const record = {
            id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `history_${Date.now()}_${this.historyEvents.length}`,
            type,
            timestamp: event.timestamp || new Date().toISOString(),
            roundIndex,
            round: Number(event.round) || roundIndex + 1,
            category: String(event.category || 'Draw'),
            source: String(event.source || 'numeric'),
            slotIndex: Number.isInteger(event.slotIndex) ? event.slotIndex : null,
            winners: Array.isArray(event.winners) ? event.winners.map(winner => this.snapshotHistoryWinner(winner)).filter(Boolean) : [],
            previousWinners: Array.isArray(event.previousWinners) ? event.previousWinners.map(winner => this.snapshotHistoryWinner(winner)).filter(Boolean) : [],
            previousWinner: this.snapshotHistoryWinner(event.previousWinner),
            newWinner: this.snapshotHistoryWinner(event.newWinner)
        };
        this.historyEvents.push(record);
        return record;
    },

    buildDrawState() {
        return {
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            allWinners: this.allWinners,
            roundResults: this.roundResults,
            historyEvents: this.historyEvents,
            drawListPool: this.drawListPool,
            drawNumericPool: this.drawNumericPool,
            masterListPool: this.masterListPool,
            masterNumericPool: this.masterNumericPool,
            presetWinners: this.presetWinners,
            fontSizeCache: this.fontSizeCache,
            drawCompletedThisRound: this.drawCompletedThisRound
        };
    },

    saveDrawState() {
        this.drawState = this.buildDrawState();
        this.isDirty = true;
        if (window.DesktopStorage && !this.isHydrating) {
            DesktopStorage.scheduleRecovery(() => this.exportProjectDocument(), true);
        }
    },

    restoreDrawStateData() {
        const data = this.drawState;
        if (!data || typeof data !== 'object') return null;
        if (data.currentRound !== undefined) this.currentRound = data.currentRound;
        if (data.totalRounds !== undefined) this.totalRounds = data.totalRounds;
        if (Array.isArray(data.allWinners)) this.allWinners = data.allWinners;
        if (Array.isArray(data.roundResults)) this.roundResults = data.roundResults;
        this.historyEvents = Array.isArray(data.historyEvents) ? data.historyEvents : [];
        if (Array.isArray(data.drawListPool)) this.drawListPool = data.drawListPool;
        if (Array.isArray(data.drawNumericPool)) this.drawNumericPool = data.drawNumericPool;
        if (Array.isArray(data.masterListPool)) this.masterListPool = data.masterListPool;
        if (Array.isArray(data.masterNumericPool)) this.masterNumericPool = data.masterNumericPool;
        if (Array.isArray(data.presetWinners)) this.presetWinners = data.presetWinners;
        if (data.fontSizeCache && typeof data.fontSizeCache === 'object') this.fontSizeCache = data.fontSizeCache;
        this.drawCompletedThisRound = !!data.drawCompletedThisRound;
        this.isDrawing = false;
        if (window.ProjectorSync) ProjectorSync.publish({ type: 'draw_status', isDrawing: false });
        return data;
    },

    clearDrawState() {
        this.drawState = null;
    },

    // ---- Disk Recovery Scheduling ----
    autoSaveAllSettings() {
        if (this.isHydrating) return;
        this.isDirty = true;
        if (window.DesktopStorage) DesktopStorage.scheduleRecovery(() => this.exportProjectDocument());
        if (window.Studio && typeof Studio.updateSaveStatusUI === 'function') Studio.updateSaveStatusUI();
    },

    loadAllSavedData() {
        return false;
    },

    applyAppSettings(settings) {
        if (!settings || typeof settings !== 'object') return;
        if (settings.telegramSettings) {
            this.telegramSettings = { ...this.telegramSettings, ...settings.telegramSettings };
        }
    },

    // ---- Drag & Drop Slot Reordering (Point 8) ----
    reorderRoundSlots(fromIdx, toIdx) {
        if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= this.totalRounds || toIdx >= this.totalRounds) return false;
        
        // Move roundConfig
        const [movedConfig] = this.roundConfigs.splice(fromIdx, 1);
        this.roundConfigs.splice(toIdx, 0, movedConfig);

        // Move roundResult if present
        const movedResult = this.roundResults[fromIdx];
        this.roundResults.splice(fromIdx, 1);
        this.roundResults.splice(toIdx, 0, movedResult);

        // Adjust currentRound selection
        if (this.currentRound === fromIdx) {
            this.currentRound = toIdx;
        } else if (fromIdx < this.currentRound && toIdx >= this.currentRound) {
            this.currentRound--;
        } else if (fromIdx > this.currentRound && toIdx <= this.currentRound) {
            this.currentRound++;
        }

        this.syncSettingsFromConfigs();
        this.autoSaveAllSettings();
        if (this.drawState) this.saveDrawState();
        return true;
    },

    // ---- Word-Style Project Management (Point 5) ----
    loadSavedProjectsList() {
        if (window.DesktopStorage && Array.isArray(DesktopStorage.recent)) {
            this.savedProjectsList = DesktopStorage.recent;
        }
        return this.savedProjectsList;
    },

    createNewProject(name, initialCategories) {
        this.isHydrating = true;
        this.currentProjectId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `project_${Date.now()}`;
        this.currentProjectName = name ? name.trim() : "New Event Project";
        this.currentProjectPath = null;
        this.currentProjectCreatedAt = new Date().toISOString();
        this.assets = [];
        this.backgroundAssetId = null;
        this.tempBgFile = null;
        this.tempBgVideoFile = null;
        this.saveParticipantList([]);
        if (initialCategories && Array.isArray(initialCategories) && initialCategories.length > 0) {
            this.prizeCategories = initialCategories;
        } else {
            this.prizeCategories = ["Grand Prizes", "VIP Rounds", "Regular Draw", "Consolation"];
        }
        this.activeCategoryTab = "All";
        this.totalRounds = 1;
        this.roundConfigs = [this.getDefaultRoundConfig(0)];
        this.roundConfigs[0].category = this.prizeCategories[0] || "Regular Draw";
        this.roundResults = [];
        this.historyEvents = [];
        this.allWinners = [];
        this.currentRound = 0;
        this.isDrawing = false;
        this.displaySettings.winnerGlowEnabled = false;
        this.clearDrawState();
        this.syncSettingsFromConfigs();
        this.isHydrating = false;
        this.isDirty = false;
        this.currentProjectSaved = false;
        if (window.DesktopStorage) DesktopStorage.newProjectWorkspace().catch(error => console.error('New workspace failed:', error));
        if (window.Studio && typeof Studio.updateSaveStatusUI === 'function') Studio.updateSaveStatusUI();
    },

    saveToLocalProjectList() {
        return this.exportProjectDocument();
    },

    loadFromLocalProjectList() {
        return false;
    },

    deleteFromLocalProjectList(projectPath) {
        this.savedProjectsList = this.savedProjectsList.filter(p => p.path !== projectPath);
        return this.savedProjectsList;
    },

    exportProjectDocument() {
        return {
            appName: "LuckyDrawProStudio",
            schemaVersion: "7.0",
            projectId: this.currentProjectId,
            projectName: this.currentProjectName,
            createdAt: this.currentProjectCreatedAt,
            updatedAt: new Date().toISOString(),
            prizeCategories: this.prizeCategories,
            categoryThemes: this.categoryThemes || {},
            categoryQuotas: this.categoryQuotas || {},
            audioSettings: this.audioSettings || {},
            activeCategoryTab: this.activeCategoryTab,
            totalRounds: this.totalRounds,
            roundConfigs: this.roundConfigs,
            displaySettings: this.displaySettings,
            fontSizeCache: this.fontSizeCache,
            participants: this.getParticipantList(),
            drawState: this.buildDrawState(),
            assets: this.assets || [],
            background: {
                type: this.displaySettings.bgType || 'none',
                assetId: this.backgroundAssetId
            }
        };
    },

    exportProjectAsJson() {
        return JSON.stringify(this.exportProjectDocument(), null, 2);
    },

    setBackgroundAsset(asset) {
        if (!asset || !asset.id || !asset.url) return false;
        this.assets = (this.assets || []).filter(item => item.id !== this.backgroundAssetId && item.id !== asset.id);
        this.assets.push(asset);
        this.backgroundAssetId = asset.id;
        this.displaySettings.bgType = asset.kind === 'video' ? 'video' : 'image';
        this.tempBgFile = asset.kind === 'image' ? asset.url : null;
        this.tempBgVideoFile = asset.kind === 'video' ? asset.url : null;
        this.syncSettingsFromConfigs();
        this.autoSaveAllSettings();
        return true;
    },

    clearBackgroundAsset() {
        this.assets = (this.assets || []).filter(item => item.id !== this.backgroundAssetId);
        this.backgroundAssetId = null;
        this.tempBgFile = null;
        this.tempBgVideoFile = null;
        this.displaySettings.bgType = 'image';
        this.syncSettingsFromConfigs();
        this.autoSaveAllSettings();
    },

    applyProjectDocument(data, context = {}) {
        if (!data || typeof data !== 'object') return false;
        this.isHydrating = true;
        try {
            this.currentProjectId = data.projectId || ((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `project_${Date.now()}`);
            this.currentProjectName = data.projectName || data.name || "Imported VJ Project";
            this.currentProjectPath = context.path || (data.runtime && data.runtime.projectPath) || null;
            this.currentProjectCreatedAt = data.createdAt || new Date().toISOString();
            if (Array.isArray(data.prizeCategories)) this.prizeCategories = data.prizeCategories;
            if (data.categoryThemes) this.categoryThemes = data.categoryThemes;
            else this.prizeCategories.forEach(c => this.getCategoryThemeObj(c));
            if (data.categoryQuotas) this.categoryQuotas = { ...this.categoryQuotas, ...data.categoryQuotas };
            if (data.audioSettings) this.audioSettings = { ...this.audioSettings, ...data.audioSettings };
            if (data.displaySettings) this.displaySettings = { ...this.displaySettings, ...data.displaySettings };
            if (data.activeCategoryTab) this.activeCategoryTab = data.activeCategoryTab;
            if (data.totalRounds) this.totalRounds = data.totalRounds;
            if (Array.isArray(data.roundConfigs)) this.roundConfigs = data.roundConfigs;
            if (data.fontSizeCache) this.fontSizeCache = data.fontSizeCache;
            this.saveParticipantList(Array.isArray(data.participants) ? data.participants : []);

            this.assets = Array.isArray(data.assets) ? data.assets : [];
            this.backgroundAssetId = data.background ? data.background.assetId : null;
            const backgroundAsset = this.assets.find(asset => asset.id === this.backgroundAssetId);
            this.tempBgFile = backgroundAsset && backgroundAsset.kind === 'image' ? backgroundAsset.url : null;
            this.tempBgVideoFile = backgroundAsset && backgroundAsset.kind === 'video' ? backgroundAsset.url : null;
            if (backgroundAsset) this.displaySettings.bgType = backgroundAsset.kind;

            this.ensureRoundConfigs(this.totalRounds || 1);
            this.syncSettingsFromConfigs();
            const hasDrawState = data.drawState
                && typeof data.drawState === 'object'
                && Object.keys(data.drawState).length > 0;
            this.drawState = hasDrawState ? data.drawState : null;
            if (this.drawState) this.restoreDrawStateData();
            else {
                this.roundResults = [];
                this.historyEvents = [];
                this.allWinners = [];
                this.currentRound = 0;
                this.drawCompletedThisRound = false;
            }
            this.currentProjectSaved = !!this.currentProjectPath;
            this.isDirty = false;
            if (window.Studio && typeof Studio.updateSaveStatusUI === 'function') Studio.updateSaveStatusUI();
            return true;
        } finally {
            this.isHydrating = false;
        }
    },

    importProjectFromJson(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (!data || (!data.roundConfigs && !data.prizeCategories)) return false;
            return this.applyProjectDocument(data, { path: null });
        } catch (e) {
            console.error("Failed to import project:", e);
            return false;
        }
    },

    // ---- Category Management Helper Methods ----
    getCategoryColor(categoryName) {
        if (!categoryName) return '#06b6d4';
        const colorMap = {
            gold: '#f59e0b',
            purple: '#a855f7',
            cyan: '#06b6d4',
            green: '#10b981',
            orange: '#f97316',
            red: '#ef4444'
        };
        const theme = this.categoryThemes && this.categoryThemes[categoryName];
        if (theme && theme.color && colorMap[theme.color]) return colorMap[theme.color];
        
        if (categoryName.toLowerCase().includes('grand') || categoryName.toLowerCase().includes('1st')) return '#f59e0b';
        if (categoryName.toLowerCase().includes('vip') || categoryName.toLowerCase().includes('2nd')) return '#a855f7';
        if (categoryName.toLowerCase().includes('consolation') || categoryName.toLowerCase().includes('3rd')) return '#10b981';
        return '#06b6d4';
    },

    getCategoryThemeObj(categoryName) {
        if (!this.categoryThemes) this.categoryThemes = {};
        if (!this.categoryThemes[categoryName]) {
            let defColor = 'cyan';
            let defPool = 'numeric';
            if (categoryName.toLowerCase().includes('grand') || categoryName.toLowerCase().includes('1st')) defColor = 'gold';
            else if (categoryName.toLowerCase().includes('vip') || categoryName.toLowerCase().includes('2nd')) { defColor = 'purple'; defPool = 'list'; }
            else if (categoryName.toLowerCase().includes('regular')) { defColor = 'cyan'; defPool = 'list'; }
            else if (categoryName.toLowerCase().includes('consolation') || categoryName.toLowerCase().includes('3rd')) defColor = 'green';
            this.categoryThemes[categoryName] = { color: defColor, defaultPool: defPool };
        }
        return this.categoryThemes[categoryName];
    },

    saveCategorySettings(name, color, pool) {
        if (!name) return;
        if (!this.categoryThemes) this.categoryThemes = {};
        this.categoryThemes[name] = { color: color || 'cyan', defaultPool: pool || 'numeric' };
        if (!this.prizeCategories.includes(name)) {
            this.prizeCategories.push(name);
        }
        this.autoSaveAllSettings();
    },

    renameCategory(oldName, newName, color, pool) {
        if (!oldName || !newName) return false;
        const idx = this.prizeCategories.indexOf(oldName);
        if (idx !== -1) {
            this.prizeCategories[idx] = newName;
        } else if (!this.prizeCategories.includes(newName)) {
            this.prizeCategories.push(newName);
        }
        if (!this.categoryThemes) this.categoryThemes = {};
        delete this.categoryThemes[oldName];
        this.categoryThemes[newName] = { color: color || 'cyan', defaultPool: pool || 'numeric' };

        this.roundConfigs.forEach(rc => {
            if (rc.category === oldName) rc.category = newName;
        });
        if (this.activeCategoryTab === oldName) this.activeCategoryTab = newName;
        this.autoSaveAllSettings();
        return true;
    },

    deleteCategory(name) {
        if (this.prizeCategories.length <= 1) {
            alert("You must keep at least 1 prize category.");
            return;
        }
        this.prizeCategories = this.prizeCategories.filter(c => c !== name);
        if (this.categoryThemes) delete this.categoryThemes[name];
        if (this.activeCategoryTab === name) this.activeCategoryTab = "All";
        const fallback = this.prizeCategories[0] || "Regular Draw";
        this.roundConfigs.forEach(rc => {
            if (rc.category === name) rc.category = fallback;
        });
        this.autoSaveAllSettings();
    },

    reorderCategory(index, direction) {
        if (direction === -1 && index > 0) {
            const temp = this.prizeCategories[index - 1];
            this.prizeCategories[index - 1] = this.prizeCategories[index];
            this.prizeCategories[index] = temp;
        } else if (direction === 1 && index < this.prizeCategories.length - 1) {
            const temp = this.prizeCategories[index + 1];
            this.prizeCategories[index + 1] = this.prizeCategories[index];
            this.prizeCategories[index] = temp;
        }
        this.autoSaveAllSettings();
    },

    reorderPrizeCategories(fromIdx, toIdx) {
        if (fromIdx < 0 || fromIdx >= this.prizeCategories.length || toIdx < 0 || toIdx >= this.prizeCategories.length || fromIdx === toIdx) return false;
        const [moved] = this.prizeCategories.splice(fromIdx, 1);
        this.prizeCategories.splice(toIdx, 0, moved);
        this.autoSaveAllSettings();
        return true;
    }
};
