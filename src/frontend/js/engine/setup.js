/**
 * setup.js
 * Preserves 100% of the exact index16 Setup Mode handlers, category management,
 * preset autocomplete, duplicate round, and Excel/Report modal functions.
 */
import { EngineState } from './state.js';
import { resetDisplayForNewRound } from './display.js';

export function setupNavigation() {
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link[data-target]');
    const tabPanels = document.querySelectorAll('.setup-body .settings-tab-panel');
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            if (link.classList.contains('active')) return;
            const targetId = link.getAttribute('data-target');
            navLinks.forEach(navLink => navLink.classList.remove('active'));
            link.classList.add('active');
            tabPanels.forEach(panel => {
                panel.classList.toggle('active', panel.id === targetId);
            });
            if (targetId === 'panel-participants') {
                renderParticipantPreviewTable();
            }
        });
    });
}

export function setupAutoSave() {
    const setupMode = document.getElementById('setupMode');
    if (!setupMode) return;
    setupMode.addEventListener('change', (e) => {
        if (e.target.matches('input, select, textarea')) {
            autoSaveAllSettings();
        }
    });

    setupMode.addEventListener('click', (e) => {
        if (e.target.matches('.btn-toggle')) {
            setTimeout(autoSaveAllSettings, 100);
        }
    });
}

export function autoSaveAllSettings() {
    try {
        const setupData = {
            version: "4.9.6",
            timestamp: new Date().toISOString(),
            prizeCategories: EngineState.prizeCategories,
            roundCount: parseInt(document.getElementById('roundCount')?.value) || 1,
            numericRange: {
                start: document.getElementById('startNumber')?.value || '1',
                end: document.getElementById('endNumber')?.value || '1000',
                exclude: document.getElementById('excludeListInput')?.value || '',
                numDigits: document.getElementById('numDigitsInput')?.value || '',
                detailsOpen: document.getElementById('global-numeric-details')?.open || false
            },
            display: {
                animationEnabled: document.getElementById('animationEnabledBtn')?.classList.contains('active') || false,
                winnerGlowEnabled: document.getElementById('winnerGlowEnabledBtn')?.classList.contains('active') || false,
                winnerGlowColor: document.getElementById('winnerGlowColor')?.value || '#00ff87',
                allowDuplicates: document.getElementById('allowDuplicatesBtn')?.classList.contains('active') || false,
                textColor: document.getElementById('textColor')?.value || '#FFFFFF',
            },
            background: {
                type: document.getElementById('bgType')?.value || 'image',
            },
            fontSizeCache: EngineState.fontSizeCache,
            rounds: []
        };

        const roundCount = setupData.roundCount;
        for (let i = 1; i <= roundCount; i++) {
            const dsElement = document.getElementById(`preset-r${i}-datasource`);
            const wcElement = document.getElementById(`preset-r${i}-wincount`);
            const lyElement = document.getElementById(`preset-r${i}-layout`);
            const anElement = document.getElementById(`preset-r${i}-animation`);
            const durElement = document.getElementById(`preset-r${i}-duration`);
            const catElement = document.getElementById(`preset-r${i}-category`);
            const detailsElement = document.querySelector(`#rounds-container details:nth-child(${i})`);

            if (!dsElement || !wcElement || !lyElement || !anElement || !durElement || !catElement) continue;

            const roundSettings = {
                dataSource: dsElement.value,
                winnerCount: parseInt(wcElement.value) || 1,
                layoutMode: 'grid',
                animationStyle: 'simultaneous',
                duration: durElement.value,
                category: catElement.value,
                detailsOpen: detailsElement?.open || false,
                presets: []
            };

            for (let j = 1; j <= roundSettings.winnerCount; j++) {
                const presetInput = document.getElementById(`preset-r${i}-w${j}`);
                roundSettings.presets.push(presetInput?.value || '');
            }

            setupData.rounds.push(roundSettings);
        }

        if (window.EngineState && typeof EngineState.autoSaveAllSettings === 'function') EngineState.autoSaveAllSettings();
    } catch (e) {
        console.error("Error auto-saving settings:", e);
    }
}

export function loadAllSavedData() {
    try {
        const savedData = null;
        if (!savedData) return;

        const setupData = JSON.parse(savedData);

        if (Array.isArray(setupData.prizeCategories)) {
            EngineState.prizeCategories = setupData.prizeCategories;
        }

        if (setupData.numericRange) {
            const numeric = setupData.numericRange;
            if (document.getElementById('startNumber')) document.getElementById('startNumber').value = numeric.start || '1';
            if (document.getElementById('endNumber')) document.getElementById('endNumber').value = numeric.end || '1000';
            if (document.getElementById('excludeListInput')) document.getElementById('excludeListInput').value = numeric.exclude || '';
            if (document.getElementById('numDigitsInput')) document.getElementById('numDigitsInput').value = numeric.numDigits || '';

            const numericDetails = document.getElementById('global-numeric-details');
            if (numericDetails && numeric.detailsOpen) {
                numericDetails.open = true;
                EngineState.openRoundDetails.add('numeric-global');
            }
        }

        if (setupData.display) {
            const display = setupData.display;
            if (display.animationEnabled) document.getElementById('animationEnabledBtn')?.classList.add('active');
            else document.getElementById('animationEnabledBtn')?.classList.remove('active');

            if (display.winnerGlowEnabled) document.getElementById('winnerGlowEnabledBtn')?.classList.add('active');
            else document.getElementById('winnerGlowEnabledBtn')?.classList.remove('active');

            if (display.allowDuplicates) document.getElementById('allowDuplicatesBtn')?.classList.add('active');
            else document.getElementById('allowDuplicatesBtn')?.classList.remove('active');

            if (document.getElementById('winnerGlowColor')) document.getElementById('winnerGlowColor').value = display.winnerGlowColor || '#00ff87';
            if (document.getElementById('textColor')) document.getElementById('textColor').value = display.textColor || '#000000';
        }

        if (setupData.background) {
            const bgType = setupData.background.type || 'image';
            if (document.getElementById('bgType')) document.getElementById('bgType').value = bgType;
            const bgButton = document.querySelector(`.toggle-btn-group button[onclick*="'${bgType}'"]`);
            if (bgButton) selectBgType(bgButton, bgType);
        }

        if (setupData.fontSizeCache) {
            EngineState.fontSizeCache = setupData.fontSizeCache;
        }

        if (setupData.roundCount) {
            if (document.getElementById('roundCount')) document.getElementById('roundCount').value = setupData.roundCount;
        }

        if (Array.isArray(setupData.rounds)) {
            window.savedRoundsData = setupData.rounds;
        }

    } catch (e) {
        console.error("Error loading saved data:", e);
    }
}

export function renderParticipantPreviewTable() {
    const tbody = document.getElementById('participantPreviewBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const participants = EngineState.getParticipantList();
    const searchTerm = document.getElementById('participantSearch')?.value.toLowerCase() || '';

    participants.forEach((p, index) => {
        if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) return;
        const tr = document.createElement('tr');
        tr.style.opacity = p.hidden ? '0.5' : '1';
        const hideBtnText = p.hidden ? 'Show' : 'Hide';
        const hideBtnClass = p.hidden ? 'btn-secondary' : 'btn-danger';

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${p.name} ${p.hidden ? '<span style="color: var(--danger-color); font-size: 0.9em;">(Hidden)</span>' : ''}</td>
            <td style="white-space: nowrap;">
                <button class="btn btn-secondary btn-small" onclick="editParticipant(${index})">Edit</button>
                <button class="btn ${hideBtnClass} btn-small" onclick="toggleHideParticipant(${index})">${hideBtnText}</button>
                <button class="btn btn-danger btn-small" onclick="deleteParticipant(${index})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

export function toggleHideParticipant(index) {
    const allParticipants = EngineState.getParticipantList();
    if (allParticipants[index]) {
        allParticipants[index].hidden = !allParticipants[index].hidden;
        EngineState.saveParticipantList(allParticipants);
        updateAllPresetOptions();
    }
}

export function toggleParticipantHidden(index) {
    toggleHideParticipant(index);
}

export function editParticipant(index) {
    const allParticipants = EngineState.getParticipantList();
    if (!allParticipants[index]) return;
    const oldName = allParticipants[index].name;
    const newName = prompt(`Enter new name for "${oldName}":`, oldName);

    if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
        const newNameTrimmed = newName.trim();
        const normalizeName = (name) => name ? name.toLowerCase().replace(/\s+/g, '') : '';
        const normalizedNewName = normalizeName(newNameTrimmed);

        const isDuplicate = allParticipants.some((p, i) => i !== index && normalizeName(p.name) === normalizedNewName);

        if (isDuplicate) {
            return;
        }
        allParticipants[index].name = newNameTrimmed;
        EngineState.saveParticipantList(allParticipants);
        updateAllPresetOptions();
    }
}

export function deleteParticipant(index) {
    if (!confirm('Are you sure you want to delete this participant?')) return;
    const allParticipants = EngineState.getParticipantList();
    allParticipants.splice(index, 1);
    EngineState.saveParticipantList(allParticipants);
    updateAllPresetOptions();
}

export function saveSettingsToFile() {
    try {
        const setupData = {
            version: "4.9.6",
            timestamp: new Date().toISOString(),
            prizeCategories: EngineState.prizeCategories,
            roundCount: parseInt(document.getElementById('roundCount')?.value) || 1,
            numericRange: {
                start: document.getElementById('startNumber')?.value || '1',
                end: document.getElementById('endNumber')?.value || '1000',
                exclude: document.getElementById('excludeListInput')?.value || '',
                numDigits: document.getElementById('numDigitsInput')?.value || '',
                detailsOpen: document.getElementById('global-numeric-details')?.open || false
            },
            display: {
                animationEnabled: document.getElementById('animationEnabledBtn')?.classList.contains('active') || false,
                winnerGlowEnabled: document.getElementById('winnerGlowEnabledBtn')?.classList.contains('active') || false,
                winnerGlowColor: document.getElementById('winnerGlowColor')?.value || '#00ff87',
                allowDuplicates: document.getElementById('allowDuplicatesBtn')?.classList.contains('active') || false,
                textColor: document.getElementById('textColor')?.value || '#000000',
            },
            background: {
                type: document.getElementById('bgType')?.value || 'image',
            },
            fontSizeCache: EngineState.fontSizeCache,
            rounds: []
        };

        const roundCount = setupData.roundCount;
        for (let i = 1; i <= roundCount; i++) {
            const dsElement = document.getElementById(`preset-r${i}-datasource`);
            const wcElement = document.getElementById(`preset-r${i}-wincount`);
            const lyElement = document.getElementById(`preset-r${i}-layout`);
            const anElement = document.getElementById(`preset-r${i}-animation`);
            const durElement = document.getElementById(`preset-r${i}-duration`);
            const catElement = document.getElementById(`preset-r${i}-category`);
            const detailsElement = document.querySelector(`#rounds-container details:nth-child(${i})`);

            if (!dsElement || !wcElement || !lyElement || !anElement || !durElement || !catElement) continue;

            const roundSettings = {
                dataSource: dsElement.value,
                winnerCount: parseInt(wcElement.value) || 1,
                layoutMode: 'grid',
                animationStyle: 'simultaneous',
                duration: durElement.value,
                category: catElement.value,
                detailsOpen: detailsElement?.open || false,
                presets: []
            };

            for (let j = 1; j <= roundSettings.winnerCount; j++) {
                const presetInput = document.getElementById(`preset-r${i}-w${j}`);
                roundSettings.presets.push(presetInput?.value || '');
            }

            setupData.rounds.push(roundSettings);
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(setupData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `lucky_draw_settings_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    } catch (e) {
        console.error("Error saving settings to file:", e);
    }
}

export function handleSettingsFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const setupData = JSON.parse(e.target.result);
            if (!EngineState.applyProjectDocument(setupData, { path: null })) throw new Error('Invalid settings data');
            alert('Settings loaded successfully!');
        } catch (err) {
            alert('Invalid settings JSON file.');
            console.error(err);
        }
        event.target.value = null;
    };
    reader.onerror = function () {
        event.target.value = null;
    };
    reader.readAsText(file);
}

export function hideErrorMessage() {
    const errorModal = document.getElementById('displayErrorMessage');
    if (errorModal) errorModal.classList.remove('show');
}

export function showErrorMessage(message) {
    const errorModal = document.getElementById('displayErrorMessage');
    const errorText = document.getElementById('errorText');
    if (errorText) errorText.textContent = message;
    if (errorModal) errorModal.classList.add('show');
}

export function showLoadingScreen(message = 'Preparing display...') {
    const loadingScreen = document.getElementById('displayLoadingScreen');
    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) loadingMessage.textContent = message;
    if (loadingScreen) loadingScreen.classList.add('show');
}

export function hideLoadingScreen() {
    const loadingScreen = document.getElementById('displayLoadingScreen');
    if (loadingScreen) loadingScreen.classList.remove('show');
}

export function addParticipants() {
    const input = document.getElementById('newParticipantsInput');
    if (!input) return;
    const newNames = input.value.split(',').map(name => name.trim()).filter(name => name.length > 0);
    if (newNames.length === 0) return;

    const currentList = EngineState.getParticipantList();
    const existingNames = new Set(currentList.map(p => p.name.toLowerCase().replace(/\s+/g, '')));

    let addedCount = 0;
    newNames.forEach(name => {
        const norm = name.toLowerCase().replace(/\s+/g, '');
        if (!existingNames.has(norm)) {
            currentList.push({ name: name, hidden: false });
            existingNames.add(norm);
            addedCount++;
        }
    });

    EngineState.saveParticipantList(currentList);
    input.value = '';
    renderParticipantPreviewTable();
    updateAllPresetOptions();
}

export function handleCsvImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
        if (lines.length <= 1) {
            event.target.value = null;
            return;
        }

        const normalizeName = (name) => name ? name.toLowerCase().replace(/\s+/g, '') : '';
        const headerLine = lines[0].toLowerCase().split(',');
        const nameIndex = headerLine.findIndex(h => normalizeName(h) === 'name');
        const hiddenIndex = headerLine.findIndex(h => normalizeName(h) === 'hidden');

        if (nameIndex === -1) {
            event.target.value = null;
            return;
        }

        const importedParticipants = [];
        const existingNames = new Set();

        for (let i = 1; i < lines.length; i++) {
            const data = lines[i].split(',');
            const name = data[nameIndex] ? data[nameIndex].trim().replace(/^"|"$/g, '') : '';

            if (name) {
                const normalizedName = normalizeName(name);
                if (!existingNames.has(normalizedName)) {
                    let isHidden = false;
                    if (hiddenIndex !== -1 && data[hiddenIndex]) {
                        const hiddenValue = data[hiddenIndex].trim().toUpperCase().replace(/^"|"$/g, '');
                        isHidden = (hiddenValue === 'TRUE' || hiddenValue === 'YES' || hiddenValue === '1');
                    }
                    importedParticipants.push({ name: name, hidden: isHidden });
                    existingNames.add(normalizedName);
                }
            }
        }

        if (importedParticipants.length > 0) {
            if (confirm(`Found ${importedParticipants.length} valid, unique participants in the CSV.\nDo you want to replace the current list with these?`)) {
                EngineState.saveParticipantList(importedParticipants);
                updateAllPresetOptions();
            }
        }
        event.target.value = null;
    };
    reader.onerror = function () {
        event.target.value = null;
    };
    reader.readAsText(file);
}

export function exportParticipantsToCsv() {
    const participants = EngineState.getParticipantList();
    if (participants.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Name,Hidden\r\n";

    participants.forEach(p => {
        const name = `"${p.name.replace(/"/g, '""')}"`;
        const hidden = p.hidden ? 'TRUE' : 'FALSE';
        csvContent += `${name},${hidden}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "lucky_draw_participants.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function handleImageUpload(e) {
    const t = e.target.files[0];
    if (t) {
        const asset = await DesktopStorage.uploadBackgroundAsset(t, 'image');
        EngineState.setBackgroundAsset(asset);
    }
}

export async function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const asset = await DesktopStorage.uploadBackgroundAsset(file, 'video');
        EngineState.setBackgroundAsset(asset);
    }
}

export function toggleBtn(btn) {
    if (btn) btn.classList.toggle('active');
}

export function selectBgType(btn, type) {
    if (!btn) return;
    const parent = btn.parentElement;
    if (parent) {
        const active = parent.querySelector('.btn.active');
        if (active) active.classList.remove('active');
    }
    btn.classList.add('active');
    const bgTypeEl = document.getElementById('bgType');
    if (bgTypeEl) bgTypeEl.value = type;
    const imgBg = document.getElementById('image-bg-inputs');
    const vidBg = document.getElementById('video-bg-inputs');
    if (imgBg) imgBg.style.display = (type === 'image') ? 'block' : 'none';
    if (vidBg) vidBg.style.display = (type === 'video') ? 'block' : 'none';
}

export function renderCategoryList() {
    const container = document.getElementById('categoryListContainer');
    if (!container) return;
    container.innerHTML = '';
    EngineState.prizeCategories.forEach((category, index) => {
        const tag = document.createElement('div');
        tag.className = 'category-tag';
        tag.innerHTML = `
            <span>${category}</span>
            <button onclick="window.deleteCategory(${index})">&times;</button>
        `;
        container.appendChild(tag);
    });
}

export function addCategory() {
    const input = document.getElementById('newCategoryInput');
    if (!input) return;
    const newCategory = input.value.trim();
    if (newCategory === '') return;

    const isDuplicate = EngineState.prizeCategories.some(cat => cat.toLowerCase() === newCategory.toLowerCase());
    if (isDuplicate) return;

    EngineState.prizeCategories.push(newCategory);
    input.value = '';
    renderCategoryList();
    updateCategorySelectors();
    autoSaveAllSettings();
}

export function deleteCategory(index) {
    EngineState.prizeCategories.splice(index, 1);
    renderCategoryList();
    updateCategorySelectors();
    autoSaveAllSettings();
}

export function updateCategorySelectors() {
    const roundCount = parseInt(document.getElementById('roundCount')?.value) || 1;
    for (let i = 1; i <= roundCount; i++) {
        const select = document.getElementById(`preset-r${i}-category`);
        if (!select) continue;
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- None --</option>';
        EngineState.prizeCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            if (cat === currentVal) opt.selected = true;
            select.appendChild(opt);
        });
    }
}

export function handleRoundCountChange() {
    EngineState.openRoundDetails.clear();
    const existingDetails = document.querySelectorAll('#rounds-container details');
    existingDetails.forEach((detail, index) => {
        if (detail.open) { EngineState.openRoundDetails.add(index + 1); }
    });
    const numericDetails = document.getElementById('global-numeric-details');
    if (numericDetails && numericDetails.open) { EngineState.openRoundDetails.add('numeric-global'); }
    generatePresetRoundInputs();
}

export function generatePresetRoundInputs() {
    const container = document.getElementById('rounds-container');
    if (!container) return;
    const roundCount = parseInt(document.getElementById('roundCount')?.value) || 1;

    const oldValues = {};
    const oldPresets = {};
    const existingDetails = document.querySelectorAll('#rounds-container details');
    existingDetails.forEach((detail, index) => {
        const i = index + 1;
        const ds = detail.querySelector(`#preset-r${i}-datasource`);
        const wc = detail.querySelector(`#preset-r${i}-wincount`);
        const ly = detail.querySelector(`#preset-r${i}-layout`);
        const an = detail.querySelector(`#preset-r${i}-animation`);
        const dur = detail.querySelector(`#preset-r${i}-duration`);
        const cat = detail.querySelector(`#preset-r${i}-category`);
        if (ds) {
            oldValues[i] = {
                datasource: ds.value,
                wincount: wc ? wc.value : '1',
                layout: ly ? ly.value : 'grid',
                animation: an ? an.value : 'auto',
                duration: dur ? dur.value : 'default',
                category: cat ? cat.value : ''
            };
            oldPresets[i] = [];
            const winnerCount = parseInt(oldValues[i].wincount);
            for (let j = 1; j <= winnerCount; j++) {
                const input = detail.querySelector(`#preset-r${i}-w${j}`);
                oldPresets[i].push(input ? input.value : '');
            }
        }
    });

    container.innerHTML = '';
    for (let i = 1; i <= roundCount; i++) {
        const details = document.createElement('details');
        details.className = 'preset-round';
        if (EngineState.openRoundDetails.has(i)) { details.open = true; }
        details.addEventListener('toggle', (event) => {
            if (event.target.open) { EngineState.openRoundDetails.add(i); }
            else { EngineState.openRoundDetails.delete(i); }
        });

        const old = oldValues[i] || { datasource: 'list', wincount: '1', layout: 'grid', animation: 'auto', duration: 'default', category: '' };

        let roundHTML = `
            <summary>
                <span>Round ${i}</span>
                <div class="round-actions">
                    <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); window.duplicateRound(${i})" title="Duplicate this round">Duplicate</button>
                </div>
            </summary>
            <div class="preset-round-settings" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                <div class="input-group" style="margin-bottom: 0;">
                    <label for="preset-r${i}-datasource">Data Source:</label>
                    <select id="preset-r${i}-datasource" data-round-index="${i}" onchange="window.checkNumericInputsVisibility(); window.updatePresetOptions(${i})">
                        <option value="list" ${old.datasource === 'list' ? 'selected' : ''}>Name</option>
                        <option value="numeric" ${old.datasource === 'numeric' ? 'selected' : ''}>Number</option>
                    </select>
                </div>
                <div class="input-group" style="margin-bottom: 0;">
                    <label for="preset-r${i}-category">Category:</label>
                    <select id="preset-r${i}-category">
                        <option value="">-- None --</option>
                    </select>
                </div>
                <div class="input-group" style="margin-bottom: 0;">
                    <label for="preset-r${i}-layout">Layout Mode:</label>
                    <select id="preset-r${i}-layout">
                        <option value="grid" ${old.layout === 'grid' ? 'selected' : ''}>Grid</option>
                        <option value="wide-list" ${old.layout === 'wide-list' ? 'selected' : ''}>Wide List</option>
                        <option value="vertical-stack" ${old.layout === 'vertical-stack' ? 'selected' : ''}>Vertical Stack</option>
                        <option value="multi-column-list" ${old.layout === 'multi-column-list' ? 'selected' : ''}>Multi-Column List</option>
                        <option value="simple-grid" ${old.layout === 'simple-grid' ? 'selected' : ''}>Simple Grid</option>
                    </select>
                </div>
                <div class="input-group" style="margin-bottom: 0;">
                    <label for="preset-r${i}-wincount">Winners:</label>
                    <input type="number" id="preset-r${i}-wincount" min="1" value="${old.wincount}" data-round-index="${i}" oninput="window.generatePresetWinnerInputsForRound(this)">
                </div>
                <div class="input-group" style="margin-bottom: 0;">
                    <label for="preset-r${i}-animation">Animation:</label>
                    <select id="preset-r${i}-animation">
                        <option value="auto" ${old.animation === 'auto' ? 'selected' : ''}>Auto (Smart)</option>
                        <option value="shuffle" ${old.animation === 'shuffle' ? 'selected' : ''}>Shuffle (Sequential)</option>
                        <option value="simultaneous" ${old.animation === 'simultaneous' ? 'selected' : ''}>Shuffle (Simultaneous)</option>
                        <option value="random" ${old.animation === 'random' ? 'selected' : ''}>Random Reveal</option>
                    </select>
                </div>
                <div class="input-group" style="margin-bottom: 0;">
                    <label for="preset-r${i}-duration">Animation Duration:</label>
                    <select id="preset-r${i}-duration">
                        <option value="default" ${old.duration === 'default' ? 'selected' : ''}>Default</option>
                        <option value="3000" ${old.duration === '3000' ? 'selected' : ''}>3 Seconds</option>
                        <option value="5000" ${old.duration === '5000' ? 'selected' : ''}>5 Seconds</option>
                        <option value="7000" ${old.duration === '7000' ? 'selected' : ''}>7 Seconds</option>
                        <option value="10000" ${old.duration === '10000' ? 'selected' : ''}>10 Seconds</option>
                        <option value="15000" ${old.duration === '15000' ? 'selected' : ''}>15 Seconds</option>
                        <option value="20000" ${old.duration === '20000' ? 'selected' : ''}>20 Seconds</option>
                    </select>
                </div>
            </div>
            <details class="preset-winners-section" id="preset-winners-r${i}">
                <summary>Preset Winners (Optional)</summary>
                <div class="preset-winners-grid" id="preset-r${i}-grid"></div>
            </details>
        `;
        details.innerHTML = roundHTML;
        container.appendChild(details);

        const wincountInput = document.getElementById(`preset-r${i}-wincount`);
        generatePresetWinnerInputsForRound(wincountInput, oldPresets[i] || []);
    }

    updateCategorySelectors();
    if (window.savedRoundsData) {
        window.savedRoundsData.forEach((rData, idx) => {
            const rNum = idx + 1;
            const ds = document.getElementById(`preset-r${rNum}-datasource`);
            const wc = document.getElementById(`preset-r${rNum}-wincount`);
            const ly = document.getElementById(`preset-r${rNum}-layout`);
            const an = document.getElementById(`preset-r${rNum}-animation`);
            const dur = document.getElementById(`preset-r${rNum}-duration`);
            const cat = document.getElementById(`preset-r${rNum}-category`);
            if (ds && rData.dataSource) ds.value = rData.dataSource;
            if (wc && rData.winnerCount) wc.value = rData.winnerCount;
            if (ly && rData.layoutMode) ly.value = rData.layoutMode;
            if (an && rData.animationStyle) an.value = rData.animationStyle;
            if (dur && rData.duration) dur.value = rData.duration;
            if (cat && rData.category) cat.value = rData.category;

            generatePresetWinnerInputsForRound(wc, rData.presets || []);
        });
        window.savedRoundsData = null;
    }
}

export function generatePresetWinnerInputsForRound(inputElement, oldValues = []) {
    if (!inputElement) return;
    const roundIndex = inputElement.getAttribute('data-round-index');
    const winnerCount = parseInt(inputElement.value) || 0;
    const grid = document.getElementById(`preset-r${roundIndex}-grid`);
    if (!grid) return;

    grid.innerHTML = '';
    for (let i = 1; i <= winnerCount; i++) {
        const inputId = `preset-r${roundIndex}-w${i}`;
        const autocompleteListId = `autocomplete-list-r${roundIndex}-w${i}`;
        const oldValue = oldValues[i - 1] || '';

        const container = document.createElement('div');
        container.className = 'input-group preset-winner-input-group autocomplete-container';

        const label = document.createElement('label');
        label.htmlFor = inputId;
        label.textContent = `Winner ${i} (Name or Number):`;

        const input = document.createElement('input');
        input.type = 'text';
        input.id = inputId;
        input.placeholder = 'Enter Name or Number';
        input.value = oldValue;
        input.setAttribute('autocomplete', 'off');
        input.oninput = (event) => showAutocomplete(event.target, roundIndex);
        input.onfocus = (event) => showAutocomplete(event.target, roundIndex);
        input.onblur = () => setTimeout(() => closeAutocompleteList(autocompleteListId), 150);

        const autocompleteList = document.createElement('div');
        autocompleteList.id = autocompleteListId;
        autocompleteList.className = 'autocomplete-list';

        container.appendChild(label);
        container.appendChild(input);
        container.appendChild(autocompleteList);
        grid.appendChild(container);
    }
}

export function showAutocomplete(inputElement, roundIndex) {
    const filter = inputElement.value.toLowerCase();
    const listId = inputElement.id.replace('preset-r', 'autocomplete-list').replace(/-w\d+$/, `-w${inputElement.id.split('-w')[1]}`);
    const listElement = document.getElementById(listId);
    if (!listElement) return;

    closeAllAutocompleteLists(listId);
    listElement.innerHTML = '';
    listElement.style.display = 'none';

    const dataSourceSelect = document.getElementById(`preset-r${roundIndex}-datasource`);
    if (!dataSourceSelect) return;
    const dataSourceType = dataSourceSelect.value;
    let suggestions = [];

    if (dataSourceType === 'list') {
        const participants = EngineState.getParticipantList().filter(p => !p.hidden);
        suggestions = participants
            .filter(p => filter === '' || p.name.toLowerCase().includes(filter))
            .map(p => p.name);
    } else {
        const startNum = parseInt(document.getElementById('startNumber')?.value || 1);
        const endNum = parseInt(document.getElementById('endNumber')?.value || 1000);
        const excludeNumbers = new Set(
            (document.getElementById('excludeListInput')?.value || '').split(',').map(s => s.trim()).filter(s => s)
        );
        if (!isNaN(startNum) && !isNaN(endNum) && endNum >= startNum) {
            const forcedDigits = parseInt(document.getElementById('numDigitsInput')?.value) || 0;
            const numDigits = (forcedDigits > 0) ? forcedDigits : Math.max(1, endNum.toString().length);
            for (let i = startNum; i <= endNum; i++) {
                const numStr = i.toString().padStart(numDigits, '0');
                if (!excludeNumbers.has(numStr) && (filter === '' || numStr.includes(filter))) {
                    suggestions.push(numStr);
                }
            }
        }
    }

    if (suggestions.length > 0) {
        suggestions.slice(0, 10).forEach(item => {
            const div = document.createElement('div');
            div.textContent = item;
            div.onmousedown = () => {
                inputElement.value = item;
                listElement.style.display = 'none';
            };
            listElement.appendChild(div);
        });
        listElement.style.display = 'block';
    }
}

export function closeAutocompleteList(listId) {
    const listElement = document.getElementById(listId);
    if (listElement) {
        const container = listElement.closest('.autocomplete-container');
        setTimeout(() => {
            if (container && !container.contains(document.activeElement)) {
                listElement.style.display = 'none';
            }
        }, 0);
    }
}

export function closeAllAutocompleteLists(excludeId = null) {
    document.querySelectorAll('.autocomplete-list').forEach(list => {
        if (list.id !== excludeId) {
            list.style.display = 'none';
        }
    });
}

export function updatePresetOptions(roundIndex) {}

export function updateAllPresetOptions() {
    const roundCount = parseInt(document.getElementById('roundCount')?.value) || 1;
    for (let i = 1; i <= roundCount; i++) {
        updatePresetOptions(i);
    }
}

export function checkNumericInputsVisibility() {
    const roundCount = parseInt(document.getElementById('roundCount')?.value) || 1;
    let showNumeric = false;
    for (let i = 1; i <= roundCount; i++) {
        const dsSelect = document.getElementById(`preset-r${i}-datasource`);
        if (dsSelect && dsSelect.value === 'numeric') {
            showNumeric = true;
            break;
        }
    }
    const detailsElement = document.getElementById('global-numeric-details');
    const inputsDiv = document.getElementById('global-numeric-inputs');
    if (detailsElement && inputsDiv) {
        inputsDiv.style.display = showNumeric ? 'block' : 'none';
        if (!detailsElement.hasAttribute('data-listener-added')) {
            detailsElement.addEventListener('toggle', (event) => {
                if (event.target.open) {
                    EngineState.openRoundDetails.add('numeric-global');
                } else {
                    EngineState.openRoundDetails.delete('numeric-global');
                }
            });
            detailsElement.setAttribute('data-listener-added', 'true');
        }
    }
}

export function duplicateRound(sourceRoundIndex) {
    const roundCount = parseInt(document.getElementById('roundCount')?.value) || 1;
    const sourceDS = document.getElementById(`preset-r${sourceRoundIndex}-datasource`);
    const sourceWC = document.getElementById(`preset-r${sourceRoundIndex}-wincount`);
    const sourceLY = document.getElementById(`preset-r${sourceRoundIndex}-layout`);
    const sourceAN = document.getElementById(`preset-r${sourceRoundIndex}-animation`);
    const sourceDUR = document.getElementById(`preset-r${sourceRoundIndex}-duration`);
    const sourceCAT = document.getElementById(`preset-r${sourceRoundIndex}-category`);

    if (!sourceDS || !sourceWC || !sourceLY || !sourceAN || !sourceDUR || !sourceCAT) return;

    const sourceSettings = {
        datasource: sourceDS.value,
        wincount: sourceWC.value,
        layout: sourceLY.value,
        animation: sourceAN.value,
        duration: sourceDUR.value,
        category: sourceCAT.value
    };

    const sourcePresets = [];
    const winnerCount = parseInt(sourceSettings.wincount);
    for (let j = 1; j <= winnerCount; j++) {
        const input = document.getElementById(`preset-r${sourceRoundIndex}-w${j}`);
        sourcePresets.push(input ? input.value : '');
    }

    const targetInput = prompt(`Duplicate Round ${sourceRoundIndex} settings to which rounds?\n\nYou can enter:\n• Single round: 5\n• Multiple rounds: 2,3,4,5\n• Range: 2-10\n• Mix: 2,5-8,10\n\n(Excluding Round ${sourceRoundIndex})`);
    if (!targetInput || targetInput.trim() === '') return;

    const targetRounds = parseRoundInput(targetInput.trim(), roundCount, sourceRoundIndex);
    if (targetRounds.length === 0) return;

    if (!confirm(`Copy Round ${sourceRoundIndex} settings to ${targetRounds.length} round(s):\n${targetRounds.join(', ')}\n\nContinue?`)) return;

    targetRounds.forEach(targetRoundIndex => {
        const targetDS = document.getElementById(`preset-r${targetRoundIndex}-datasource`);
        const targetWC = document.getElementById(`preset-r${targetRoundIndex}-wincount`);
        const targetLY = document.getElementById(`preset-r${targetRoundIndex}-layout`);
        const targetAN = document.getElementById(`preset-r${targetRoundIndex}-animation`);
        const targetDUR = document.getElementById(`preset-r${targetRoundIndex}-duration`);
        const targetCAT = document.getElementById(`preset-r${targetRoundIndex}-category`);

        if (targetDS && targetWC && targetLY && targetAN && targetDUR && targetCAT) {
            targetDS.value = sourceSettings.datasource;
            targetWC.value = sourceSettings.wincount;
            targetLY.value = sourceSettings.layout;
            targetAN.value = sourceSettings.animation;
            targetDUR.value = sourceSettings.duration;
            targetCAT.value = sourceSettings.category;

            generatePresetWinnerInputsForRound(targetWC, sourcePresets);
            updatePresetOptions(targetRoundIndex);
        }
    });

    checkNumericInputsVisibility();
}

export function parseRoundInput(input, maxRound, excludeRound) {
    const rounds = new Set();
    const parts = input.split(',');

    parts.forEach(part => {
        part = part.trim();
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    if (i >= 1 && i <= maxRound && i !== excludeRound) {
                        rounds.add(i);
                    }
                }
            }
        } else {
            const num = parseInt(part);
            if (!isNaN(num) && num >= 1 && num <= maxRound && num !== excludeRound) {
                rounds.add(num);
            }
        }
    });

    return Array.from(rounds).sort((a, b) => a - b);
}

export function showReport() {
    const modal = document.getElementById('reportModal');
    const body = document.getElementById('report-body');
    if (!modal || !body) return;

    if (EngineState.roundResults.length === 0) {
        body.innerHTML = '<p>No results yet.</p>';
    } else {
        let tableHTML = '<table><thead><tr><th>Round</th><th>Category</th><th>Type</th><th>Result</th></tr></thead><tbody>';
        EngineState.roundResults.forEach(r => {
            const roundType = r.type === 'list' ? 'Name' : 'Number';
            const categoryName = r.category || '<i>(None)</i>';
            r.winners.forEach((w, i) => {
                const winnerName = w ? w.name : '<i>N/A</i>';
                tableHTML += `
                    <tr>
                        <td>${i === 0 ? r.round : ''}</td>
                        <td>${i === 0 ? categoryName : ''}</td>
                        <td>${roundType}</td>
                        <td>${winnerName}</td>
                    </tr>
                `;
            });
        });
        tableHTML += '</tbody></table>';
        body.innerHTML = tableHTML;
    }
    modal.style.display = 'flex';
}

export function closeReport() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
}

export function printReport() {
    window.print();
}

export function clearReport() {
    if (!confirm('Are you sure you want to clear all report data?\nThis will reset all winner lists and pools. This action cannot be undone.')) return;

    EngineState.roundResults = [];
    EngineState.allWinners = [];
    if (EngineState.masterListPool.length > 0 || EngineState.masterNumericPool.length > 0) {
        EngineState.drawListPool = [...EngineState.masterListPool];
        EngineState.drawNumericPool = [...EngineState.masterNumericPool];
    }

    EngineState.clearDrawState();
    showReport();
}

export function exportReportToExcel() {
    if (EngineState.roundResults.length === 0) return;

    const totalWinners = EngineState.roundResults.reduce((acc, r) => acc + r.winners.length, 0);
    const reportDate = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'medium' });

    const summaryHTML = `
        <table style="width: 100%;">
            <thead>
                <tr><th colspan="2" style="background-color: #4f5dff; color: #ffffff; padding: 10px; font-size: 1.2em;">Draw Summary</th></tr>
            </thead>
            <tbody>
                <tr><td style="padding: 8px; border: 1px solid #999; font-weight: bold;">Program Name</td><td style="padding: 8px; border: 1px solid #999;">Lucky Draw Pro v4.9.6</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #999; font-weight: bold;">Report Date</td><td style="padding: 8px; border: 1px solid #999;">${reportDate}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #999; font-weight: bold;">Total Rounds</td><td style="padding: 8px; border: 1px solid #999;">${EngineState.totalRounds}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #999; font-weight: bold;">Total Winners</td><td style="padding: 8px; border: 1px solid #999;">${totalWinners}</td></tr>
            </tbody>
        </table>
    `;

    let tableHTML = '<table style="width: 100%;"><thead><tr><th>Round</th><th>Category</th><th>Type</th><th>Result</th></tr></thead><tbody>';
    EngineState.roundResults.forEach(r => {
        const roundType = r.type === 'list' ? 'Name' : 'Number';
        const categoryName = r.category || '(None)';
        r.winners.forEach((w, i) => {
            const name = w && w.name ? w.name.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'N/A';
            const roundCell = i === 0 ? `<td rowspan="${r.winners.length}" style="vertical-align: middle; text-align: center;">${r.round}</td>` : '';
            const categoryCell = i === 0 ? `<td rowspan="${r.winners.length}" style="vertical-align: middle;">${categoryName}</td>` : '';
            tableHTML += `<tr>${roundCell}${categoryCell}<td>${roundType}</td><td>${name}</td></tr>`;
        });
    });

    tableHTML += '</tbody></table>';

    const styles = `
        <style>
            body { font-family: 'Arial', sans-serif; }
            table { border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #999999; padding: 8px 12px; text-align: left; vertical-align: top; }
            th { background-color: #f0f0f0; font-weight: bold; color: #333; }
            h1 { color: #4f5dff; }
            h2 { color: #1a1b26; border-bottom: 2px solid #f0f0f0; padding-bottom: 5px; }
        </style>
    `;

    const template = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.TR/REC-html40">
        <head><meta charset="UTF-8">${styles}</head>
        <body>
            <h1>Lucky Draw Report</h1>
            <h2>Summary</h2>${summaryHTML}
            <h2>Winner Details</h2>${tableHTML}
        </body>
        </html>
    `;

    const blob = new Blob([template], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    if (window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(blob, 'lucky_draw_report.xls');
    } else {
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "lucky_draw_report.xls");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

export function openEditRoundModal() {
    if (EngineState.isDrawing) return;

    const modal = document.getElementById('editRoundModal');
    if (!modal) return;
    document.getElementById('editRoundNumber').textContent = EngineState.currentRound + 1;
    document.getElementById('editWinnerCount').value = EngineState.settings.winnerCounts[EngineState.currentRound];

    const categorySelect = document.getElementById('editCategory');
    if (categorySelect) {
        categorySelect.innerHTML = '<option value="">-- None --</option>';
        EngineState.prizeCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            if (cat === EngineState.settings.roundCategories[EngineState.currentRound]) {
                option.selected = true;
            }
            categorySelect.appendChild(option);
        });
    }

    modal.style.display = 'flex';
}

export function closeEditRoundModal() {
    const modal = document.getElementById('editRoundModal');
    if (modal) modal.style.display = 'none';
}

export function applyRoundEdit() {
    const newWinnerCount = parseInt(document.getElementById('editWinnerCount')?.value);
    const newCategory = document.getElementById('editCategory')?.value || '';

    if (newWinnerCount < 1) return;

    if (EngineState.roundResults[EngineState.currentRound]) {
        if (!confirm('This round has already been drawn. Changing settings will clear the current results. Continue?')) {
            closeEditRoundModal();
            return;
        }
        EngineState.roundResults.splice(EngineState.currentRound, 1);
        EngineState.drawCompletedThisRound = false;
    }

    EngineState.settings.winnerCounts[EngineState.currentRound] = newWinnerCount;
    EngineState.settings.roundCategories[EngineState.currentRound] = newCategory;

    resetDisplayForNewRound();
    closeEditRoundModal();
    EngineState.saveDrawState();
}
