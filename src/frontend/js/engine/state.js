/**
 * state.js - Core State Management (Global, non-module)
 * Preserves 100% of original index16 state schema + localStorage persistence.
 * Upgraded for Resolume Arena 7 structure: category tabs, individual winner re-draw.
 */
window.EngineState = {
    // Participant pools
    masterListPool: [],
    masterNumericPool: [],
    drawListPool: [],
    drawNumericPool: [],

    // Winners and rounds state
    allWinners: [],
    presetWinners: [],
    roundResults: [],
    prizeCategories: ["Grand Prizes", "VIP Rounds", "Regular Draw", "Consolation"],
    activeCategoryTab: "All", // "All" or a specific category

    // Active draw status
    isDrawing: false,
    drawCompletedThisRound: false,
    currentRound: 0,
    totalRounds: 1,
    settings: {},

    // Media & Cache
    tempBgFile: null,
    tempBgVideoFile: null,
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
        winnerGlowEnabled: true,
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
            return Array.isArray(data) ? data : [];
        } catch (e) {
            const names = (typeof masterList.value === 'string' && masterList.value.length > 0) ? masterList.value.split('\n') : [];
            return names.map(name => ({ name: name.trim(), hidden: false }));
        }
    },

    saveParticipantList(participantArray) {
        const validParticipants = participantArray.filter(p => p && typeof p.name === 'string' && p.name.trim() !== '');
        const masterList = document.getElementById('customList');
        if (masterList) masterList.value = JSON.stringify(validParticipants, null, 2);
        localStorage.setItem('luckyDrawParticipants', JSON.stringify(validParticipants, null, 2));
    },

    loadParticipantsFromStorage() {
        const savedListJSON = localStorage.getItem('luckyDrawParticipants');
        const masterList = document.getElementById('customList');
        if (savedListJSON && masterList) {
            try {
                const parsedData = JSON.parse(savedListJSON);
                if (Array.isArray(parsedData)) {
                    masterList.value = savedListJSON;
                }
            } catch (e) {
                const names = (typeof savedListJSON === 'string' && savedListJSON.length > 0) ? savedListJSON.split('\n').filter(n => n.trim() !== '') : [];
                const participantObjects = names.map(name => ({ name: name.trim(), hidden: false }));
                this.saveParticipantList(participantObjects);
            }
        } else if (masterList) {
            masterList.value = '[]';
        }
    },

    // ---- Round Config Management ----
    getDefaultRoundConfig(index) {
        return {
            dataSource: 'list',
            winnerCount: 1,
            layoutMode: 'grid',
            animationStyle: 'simultaneous',
            duration: 'default',
            category: 'Regular Draw',
            presets: []
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
            rc.layoutMode = 'grid';
            rc.animationStyle = 'simultaneous';
            this.settings.winnerCounts.push(rc.winnerCount);
            this.settings.roundDataSources.push(rc.dataSource);
            this.settings.roundLayoutModes.push(rc.layoutMode);
            this.settings.roundAnimationStyles.push(rc.animationStyle);
            this.settings.roundDurations.push(rc.duration);
            this.settings.roundCategories.push(rc.category || 'Regular Draw');
            this.presetWinners.push([...(rc.presets || [])]);
        }

        document.documentElement.style.setProperty('--winner-glow-color', this.settings.winnerGlowColor || '#00e5a3');
    },

    // ---- Draw State Persistence ----
    saveDrawState() {
        this.drawState = {
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            allWinners: this.allWinners,
            roundResults: this.roundResults,
            drawListPool: this.drawListPool,
            drawNumericPool: this.drawNumericPool,
            masterListPool: this.masterListPool,
            masterNumericPool: this.masterNumericPool,
            settings: this.settings,
            presetWinners: this.presetWinners,
            fontSizeCache: this.fontSizeCache
        };
        localStorage.setItem('luckyDrawState', JSON.stringify(this.drawState));
    },

    restoreDrawStateData() {
        const savedState = localStorage.getItem('luckyDrawState');
        if (!savedState) return null;
        try { return JSON.parse(savedState); }
        catch (e) { console.error('Error restoring draw state:', e); return null; }
    },

    clearDrawState() {
        this.drawState = null;
        localStorage.removeItem('luckyDrawState');
    },

    // ---- Auto-Save All Settings ----
    autoSaveAllSettings() {
        try {
            const saveData = {
                version: "5.0",
                timestamp: new Date().toISOString(),
                prizeCategories: this.prizeCategories,
                roundConfigs: this.roundConfigs,
                displaySettings: this.displaySettings,
                fontSizeCache: this.fontSizeCache,
                totalRounds: this.totalRounds,
                activeCategoryTab: this.activeCategoryTab
            };
            localStorage.setItem('luckyDrawSetupData', JSON.stringify(saveData));
        } catch (e) {
            console.error("Auto-save error:", e);
        }
    },

    loadAllSavedData() {
        try {
            const saved = localStorage.getItem('luckyDrawSetupData');
            if (!saved) return false;
            const data = JSON.parse(saved);

            if (Array.isArray(data.prizeCategories)) this.prizeCategories = data.prizeCategories;
            if (data.displaySettings) this.displaySettings = { ...this.displaySettings, ...data.displaySettings };
            if (data.fontSizeCache) this.fontSizeCache = data.fontSizeCache;
            if (data.totalRounds) this.totalRounds = data.totalRounds;
            if (data.activeCategoryTab) this.activeCategoryTab = data.activeCategoryTab;
            if (Array.isArray(data.roundConfigs)) {
                this.roundConfigs = data.roundConfigs;
            }
            this.ensureRoundConfigs(this.totalRounds);
            return true;
        } catch (e) {
            console.error("Load saved data error:", e);
            return false;
        }
    }
};
