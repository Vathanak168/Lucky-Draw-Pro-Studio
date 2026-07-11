/**
 * index.js (Engine Orchestrator)
 * Connects modular engine to window and DOM so all legacy triggers and new
 * Pro Studio zones operate on the identical core engine.
 */
import { EngineState } from './state.js';
import * as Animations from './animations.js';
import * as Display from './display.js';
import * as Draw from './draw.js';
import * as Setup from './setup.js';

// Expose core state and modules to window for backward compatibility with onclick and studio zones
window.EngineState = EngineState;
window.Animations = Animations;
window.Display = Display;
window.Draw = Draw;
window.Setup = Setup;

// Bind direct functions to window for onclick handlers
window.startDraw = Draw.startDraw;
window.startDisplayMode = Draw.startDisplayMode;
window.nextRound = Display.nextRound;
window.resetCurrentRound = Display.resetCurrentRound;
window.toggleRoundSelector = Display.toggleRoundSelector;
window.manualZoom = Display.manualZoom;
window.togglePreviewData = Display.togglePreviewData;
window.startFreshDraw = Display.startFreshDraw;
window.exitToSetup = Display.exitToSetup;
window.backToSetup = Display.backToSetup;

window.addParticipants = Setup.addParticipants;
window.renderParticipantPreviewTable = Setup.renderParticipantPreviewTable;
window.editParticipant = Setup.editParticipant;
window.toggleHideParticipant = Setup.toggleHideParticipant;
window.toggleParticipantHidden = Setup.toggleParticipantHidden;
window.deleteParticipant = Setup.deleteParticipant;
window.handleCsvImport = Setup.handleCsvImport;
window.exportParticipantsToCsv = Setup.exportParticipantsToCsv;
window.saveSettingsToFile = Setup.saveSettingsToFile;
window.handleSettingsFileLoad = Setup.handleSettingsFileLoad;
window.hideErrorMessage = Setup.hideErrorMessage;
window.showErrorMessage = Setup.showErrorMessage;
window.toggleBtn = Setup.toggleBtn;
window.selectBgType = Setup.selectBgType;
window.addCategory = Setup.addCategory;
window.deleteCategory = Setup.deleteCategory;
window.handleRoundCountChange = Setup.handleRoundCountChange;
window.duplicateRound = Setup.duplicateRound;
window.checkNumericInputsVisibility = Setup.checkNumericInputsVisibility;
window.updatePresetOptions = Setup.updatePresetOptions;
window.generatePresetWinnerInputsForRound = Setup.generatePresetWinnerInputsForRound;
window.showAutocomplete = Setup.showAutocomplete;
window.closeAutocompleteList = Setup.closeAutocompleteList;
window.showReport = Setup.showReport;
window.closeReport = Setup.closeReport;
window.clearReport = Setup.clearReport;
window.printReport = Setup.printReport;
window.exportReportToExcel = Setup.exportReportToExcel;
window.openEditRoundModal = Setup.openEditRoundModal;
window.closeEditRoundModal = Setup.closeEditRoundModal;
window.applyRoundEdit = Setup.applyRoundEdit;
window.jumpToRound = Display.jumpToRound;
window.populateRoundSelector = Display.populateRoundSelector;

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    Setup.setupNavigation();
    Setup.loadAllSavedData();

    const roundCountEl = document.getElementById('roundCount');
    if (roundCountEl) roundCountEl.addEventListener('input', Setup.handleRoundCountChange);

    const bgImageFile = document.getElementById('bgImageFile');
    if (bgImageFile) bgImageFile.addEventListener('change', Setup.handleImageUpload);

    const bgVideoFile = document.getElementById('bgVideoFile');
    if (bgVideoFile) bgVideoFile.addEventListener('change', Setup.handleVideoUpload);

    const newCategoryInput = document.getElementById('newCategoryInput');
    if (newCategoryInput) {
        newCategoryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                Setup.addCategory();
            }
        });
    }

    EngineState.loadParticipantsFromStorage();
    Setup.generatePresetRoundInputs();
    Setup.renderCategoryList();
    Setup.updateAllPresetOptions();
    Setup.setupAutoSave();
});

export { EngineState, Animations, Display, Draw, Setup };
