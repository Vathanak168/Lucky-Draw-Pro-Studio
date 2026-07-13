/**
 * state.js - Core State Management (Global, non-module)
 * Preserves 100% of original index16 state schema + localStorage persistence.
 * Upgraded for Resolume Arena 7 structure: category tabs, individual winner re-draw.
 */
window.EngineState = {
    // Project management
    currentProjectName: "Default VJ Project",
    savedProjectsList: [],
    isDirty: false,
    currentProjectSaved: false,

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
    categoryThemes: {
        "Grand Prizes": { color: "gold", defaultPool: "numeric" },
        "VIP Rounds": { color: "purple", defaultPool: "numeric" },
        "Regular Draw": { color: "cyan", defaultPool: "numeric" },
        "Consolation": { color: "green", defaultPool: "numeric" }
    },
    activeCategoryTab: "All", // "All" or a specific category
    categoryQuotas: JSON.parse(localStorage.getItem('luckyDrawCategoryQuotas') || '{"Grand Prizes": 2, "VIP Rounds": 10, "Regular Draw": 50, "Consolation": 20}'),
    audioSettings: JSON.parse(localStorage.getItem('luckyDrawAudioSettings') || '{"autoSpinStart": false, "autoSpinStop": false}'),
    telegramSettings: JSON.parse(localStorage.getItem('luckyDrawTelegramSettings') || '{"botToken": "", "groupChatId": ""}'),

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
        localStorage.setItem('luckyDrawParticipants', JSON.stringify(validParticipants, null, 2));
    },

    setParticipantList(participantArray) {
        this.saveParticipantList(participantArray);
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
        try {
            const data = JSON.parse(savedState);
            if (data) {
                if (data.currentRound !== undefined) this.currentRound = data.currentRound;
                if (data.totalRounds !== undefined) this.totalRounds = data.totalRounds;
                if (data.allWinners !== undefined) this.allWinners = data.allWinners;
                if (data.roundResults !== undefined) this.roundResults = data.roundResults;
                if (data.drawListPool !== undefined && Array.isArray(data.drawListPool)) this.drawListPool = data.drawListPool;
                if (data.drawNumericPool !== undefined && Array.isArray(data.drawNumericPool)) this.drawNumericPool = data.drawNumericPool;
                if (data.masterListPool !== undefined && Array.isArray(data.masterListPool)) this.masterListPool = data.masterListPool;
                if (data.masterNumericPool !== undefined && Array.isArray(data.masterNumericPool)) this.masterNumericPool = data.masterNumericPool;
                if (data.presetWinners !== undefined) this.presetWinners = data.presetWinners;
                if (data.fontSizeCache !== undefined) this.fontSizeCache = data.fontSizeCache;
                this.isDrawing = false; // Always reset drawing lock when restoring
                try { localStorage.setItem('ldp_is_drawing', 'false'); } catch(e){}
                return data;
            }
            return null;
        }
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
                currentProjectName: this.currentProjectName,
                currentProjectSaved: this.currentProjectSaved,
                lastOpenedProjectId: localStorage.getItem('luckyDrawLastOpenedProjectId') || '',
                prizeCategories: this.prizeCategories,
                categoryQuotas: this.categoryQuotas || {},
                audioSettings: this.audioSettings || { autoSpinStart: true, autoSpinStop: true },
                roundConfigs: this.roundConfigs,
                displaySettings: this.displaySettings,
                fontSizeCache: this.fontSizeCache,
                totalRounds: this.totalRounds,
                activeCategoryTab: this.activeCategoryTab,
                categoryThemes: this.categoryThemes || {}
            };
            localStorage.setItem('luckyDrawSetupData', JSON.stringify(saveData));
            this.isDirty = true;
            if (window.Studio && typeof Studio.updateSaveStatusUI === 'function') Studio.updateSaveStatusUI();
        } catch (e) {
            console.error("Auto-save error:", e);
        }
    },

    loadAllSavedData() {
        try {
            const saved = localStorage.getItem('luckyDrawSetupData');
            if (!saved) return false;
            const data = JSON.parse(saved);

            if (data.currentProjectName) this.currentProjectName = data.currentProjectName;
            if (data.currentProjectSaved !== undefined) this.currentProjectSaved = data.currentProjectSaved;
            if (data.lastOpenedProjectId) try { localStorage.setItem('luckyDrawLastOpenedProjectId', data.lastOpenedProjectId); } catch(e){}
            if (Array.isArray(data.prizeCategories)) this.prizeCategories = data.prizeCategories;
            if (data.categoryQuotas) this.categoryQuotas = { ...this.categoryQuotas, ...data.categoryQuotas };
            if (data.audioSettings) this.audioSettings = { ...this.audioSettings, ...data.audioSettings };
            if (data.displaySettings) this.displaySettings = { ...this.displaySettings, ...data.displaySettings };
            if (data.fontSizeCache) this.fontSizeCache = data.fontSizeCache;
            if (data.totalRounds) this.totalRounds = data.totalRounds;
            if (data.activeCategoryTab) this.activeCategoryTab = data.activeCategoryTab;
            if (Array.isArray(data.roundConfigs)) {
                this.roundConfigs = data.roundConfigs;
            }
            if (data.categoryThemes) this.categoryThemes = data.categoryThemes;
            else {
                this.prizeCategories.forEach(c => this.getCategoryThemeObj(c));
            }
            this.ensureRoundConfigs(this.totalRounds);
            this.loadSavedProjectsList();
            return true;
        } catch (e) {
            console.error("Load saved data error:", e);
            return false;
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
        try {
            const saved = localStorage.getItem('luckyDrawSavedProjects');
            if (saved) {
                this.savedProjectsList = JSON.parse(saved) || [];
            }
        } catch (e) {
            this.savedProjectsList = [];
        }
        if (window.StudioAPI && typeof StudioAPI.getSavedProjectsFromDisk === 'function') {
            StudioAPI.getSavedProjectsFromDisk().then(list => {
                if (list && Array.isArray(list) && list.length > 0) {
                    this.savedProjectsList = list;
                    try { localStorage.setItem('luckyDrawSavedProjects', JSON.stringify(list)); } catch(e){}
                }
            }).catch(()=>{});
        }
        return this.savedProjectsList;
    },

    createNewProject(name, initialCategories) {
        this.currentProjectName = name ? name.trim() : "New Event Project";
        const projectId = this.currentProjectName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        try { localStorage.setItem('luckyDrawLastOpenedProjectId', projectId); } catch(e){}
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
        this.allWinners = [];
        this.currentRound = 0;
        this.isDrawing = false;
        this.displaySettings.winnerGlowEnabled = false;
        this.clearDrawState();
        this.syncSettingsFromConfigs();
        this.autoSaveAllSettings();
        this.isDirty = false;
        this.currentProjectSaved = false;
        if (window.Studio && typeof Studio.updateSaveStatusUI === 'function') Studio.updateSaveStatusUI();
    },

    saveToLocalProjectList() {
        this.loadSavedProjectsList();
        const projectId = this.currentProjectName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        try { localStorage.setItem('luckyDrawLastOpenedProjectId', projectId); } catch(e){}
        const now = new Date().toLocaleString();
        
        const snapshot = {
            id: projectId,
            name: this.currentProjectName,
            updatedAt: now,
            totalRounds: this.totalRounds,
            prizeCategories: [...this.prizeCategories],
            categoryThemes: JSON.parse(JSON.stringify(this.categoryThemes || {})),
            roundConfigs: JSON.parse(JSON.stringify(this.roundConfigs)),
            displaySettings: { ...this.displaySettings },
            participants: this.getParticipantList()
        };

        const existingIdx = this.savedProjectsList.findIndex(p => p.id === projectId || p.name === this.currentProjectName);
        if (existingIdx >= 0) {
            this.savedProjectsList[existingIdx] = snapshot;
        } else {
            this.savedProjectsList.unshift(snapshot);
        }
        localStorage.setItem('luckyDrawSavedProjects', JSON.stringify(this.savedProjectsList));
        if (window.StudioAPI && typeof StudioAPI.saveProjectToDisk === 'function') {
            StudioAPI.saveProjectToDisk(snapshot).catch(()=>{});
        }
        this.isDirty = false;
        this.currentProjectSaved = true;
        if (window.Studio && typeof Studio.updateSaveStatusUI === 'function') Studio.updateSaveStatusUI();
        return snapshot;
    },

    loadFromLocalProjectList(projectId) {
        this.loadSavedProjectsList();
        const proj = this.savedProjectsList.find(p => p.id === projectId || p.name === projectId);
        if (!proj) return false;

        try { localStorage.setItem('luckyDrawLastOpenedProjectId', proj.id || projectId); } catch(e){}
        this.currentProjectName = proj.name || "Loaded Project";
        if (proj.prizeCategories) this.prizeCategories = proj.prizeCategories;
        if (proj.categoryThemes) this.categoryThemes = proj.categoryThemes;
        else this.prizeCategories.forEach(c => this.getCategoryThemeObj(c));
        if (proj.displaySettings) this.displaySettings = { ...this.displaySettings, ...proj.displaySettings };
        if (proj.totalRounds) this.totalRounds = proj.totalRounds;
        if (Array.isArray(proj.roundConfigs)) this.roundConfigs = proj.roundConfigs;
        if (proj.participants) this.saveParticipantList(proj.participants);

        this.ensureRoundConfigs(this.totalRounds);
        this.roundResults = [];
        this.allWinners = [];
        this.currentRound = 0;
        this.clearDrawState();
        this.syncSettingsFromConfigs();
        this.autoSaveAllSettings();
        this.isDirty = false;
        this.currentProjectSaved = true;
        if (window.Studio && typeof Studio.updateSaveStatusUI === 'function') Studio.updateSaveStatusUI();
        return true;
    },

    deleteFromLocalProjectList(projectId) {
        this.loadSavedProjectsList();
        this.savedProjectsList = this.savedProjectsList.filter(p => p.id !== projectId && p.name !== projectId);
        localStorage.setItem('luckyDrawSavedProjects', JSON.stringify(this.savedProjectsList));
        if (window.StudioAPI && typeof StudioAPI.deleteProjectFromDisk === 'function') {
            StudioAPI.deleteProjectFromDisk(projectId).catch(()=>{});
        }
        return this.savedProjectsList;
    },

    exportProjectAsJson() {
        const payload = {
            appName: "LuckyDrawProStudio",
            version: "6.0",
            exportedAt: new Date().toISOString(),
            projectName: this.currentProjectName,
            prizeCategories: this.prizeCategories,
            categoryThemes: this.categoryThemes || {},
            totalRounds: this.totalRounds,
            roundConfigs: this.roundConfigs,
            displaySettings: this.displaySettings,
            participants: this.getParticipantList()
        };
        return JSON.stringify(payload, null, 2);
    },

    importProjectFromJson(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (!data || (!data.roundConfigs && !data.prizeCategories)) return false;

            this.currentProjectName = data.projectName || "Imported VJ Project";
            if (Array.isArray(data.prizeCategories)) this.prizeCategories = data.prizeCategories;
            if (data.categoryThemes) this.categoryThemes = data.categoryThemes;
            else this.prizeCategories.forEach(c => this.getCategoryThemeObj(c));
            if (data.displaySettings) this.displaySettings = { ...this.displaySettings, ...data.displaySettings };
            if (data.totalRounds) this.totalRounds = data.totalRounds;
            if (Array.isArray(data.roundConfigs)) this.roundConfigs = data.roundConfigs;
            if (data.participants) this.saveParticipantList(data.participants);

            this.ensureRoundConfigs(this.totalRounds);
            this.roundResults = [];
            this.allWinners = [];
            this.currentRound = 0;
            this.clearDrawState();
            this.syncSettingsFromConfigs();
            this.autoSaveAllSettings();
            return true;
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
