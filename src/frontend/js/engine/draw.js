/**
 * draw.js - Draw Logic inside 1920x1080 Virtual Canvas
 * Pre-renders exact geometric virtual cards before animation starts so box size and font never shift.
 */
window.Draw = {
    ensurePoolPrepared() {
        const S = EngineState;
        if (S.masterListPool.length > 0 || S.masterNumericPool.length > 0) return true;
        this.initializePoolsSilently();
        return (S.masterListPool.length > 0 || S.masterNumericPool.length > 0);
    },

    initializePoolsSilently() {
        const S = EngineState;
        S.syncSettingsFromConfigs();
        S.masterListPool = [];
        S.masterNumericPool = [];
        let validIdentifiers = new Set();

        if (S.settings.roundDataSources.includes('list')) {
            S.masterListPool = S.getParticipantList()
                .map((p, i) => ({ ...p, originalIndex: i + 1 }))
                .filter(p => !p.hidden)
                .map(p => ({ id: `l_${p.originalIndex.toString()}`, name: p.name.trim(), type: 'list' }));

            S.masterListPool.forEach(p => { validIdentifiers.add(p.name); validIdentifiers.add(p.id.substring(2)); });
        }

        S.masterIdPool = [];
        if (S.settings.roundDataSources.includes('id')) {
            S.masterIdPool = S.getParticipantList()
                .map((p, i) => ({ ...p, originalIndex: i + 1 }))
                .filter(p => !p.hidden && (p.id || p.ticket || p.name))
                .map(p => {
                    const idStr = (p.id || p.ticket || p.name).toString().trim();
                    return { id: `i_${p.originalIndex.toString()}`, name: idStr, type: 'id', originalParticipant: p };
                });
            S.masterIdPool.forEach(p => { validIdentifiers.add(p.name); validIdentifiers.add(p.id.substring(2)); });
        }

        // Always build numeric pool according to startNumber, endNumber, and numDigits
        const ds = S.displaySettings;
        const startNum = parseInt(ds.startNumber) || 1;
        const endNum = parseInt(ds.endNumber) || 1000;
        if (!isNaN(startNum) && !isNaN(endNum) && endNum >= startNum) {
            const forcedDigits = parseInt(ds.numDigits) || 0;
            const numDigits = (forcedDigits > 0) ? forcedDigits : Math.max(1, endNum.toString().length);
            S.settings.numDigits = numDigits;

            const excludeNumbers = new Set((ds.excludeList || '').split(',').map(s => s.trim()).filter(s => s));
            for (let i = startNum; i <= endNum; i++) {
                const numStr = i.toString().padStart(numDigits, '0');
                if (!excludeNumbers.has(numStr)) {
                    S.masterNumericPool.push({ id: `n_${numStr}`, name: numStr, type: 'numeric' });
                    validIdentifiers.add(numStr);
                }
            }
        }

        S.drawListPool = [...S.masterListPool];
        S.drawNumericPool = [...S.masterNumericPool];
        S.drawIdPool = [...(S.masterIdPool || [])];
    },

    selectWinnerIdsForRound(currentPool, currentMasterPool) {
        const S = EngineState;
        const presetValuesForRound = S.presetWinners[S.currentRound] || [];
        const winnerCountForThisRound = S.settings.winnerCounts[S.currentRound];
        const finalWinnerIds = new Array(winnerCountForThisRound).fill(null);
        const allWinnerIdsSoFar = new Set(S.allWinners.map(w => w.id));

        let availablePool = S.settings.allowDuplicates ? [...currentPool] : currentPool.filter(p => !allWinnerIdsSoFar.has(p.id));
        let presetPool = [...availablePool];

        for (let i = 0; i < winnerCountForThisRound; i++) {
            const presetValue = presetValuesForRound[i];
            if (presetValue && presetValue.toString().trim() !== '') {
                const cleanPreset = presetValue.toString().trim();
                const currentDataSource = S.settings.roundDataSources[S.currentRound];
                let foundWinner = null;
                if (currentDataSource === 'list' || currentDataSource === 'id') {
                    foundWinner = currentMasterPool.find(p => p.name.trim().toLowerCase() === cleanPreset.toLowerCase() || p.id === (currentDataSource === 'list' ? `l_${cleanPreset}` : `i_${cleanPreset}`));
                } else {
                    foundWinner = currentMasterPool.find(p => p.name === cleanPreset || (parseInt(p.name, 10) === parseInt(cleanPreset, 10) && !isNaN(parseInt(cleanPreset, 10))));
                }
                if (!foundWinner) {
                    foundWinner = {
                        id: (currentDataSource === 'list' ? 'l_vip_' : (currentDataSource === 'id' ? 'i_vip_' : 'n_vip_')) + cleanPreset + '_' + i,
                        name: cleanPreset,
                        type: currentDataSource
                    };
                    if (currentDataSource === 'list') S.masterListPool.push(foundWinner);
                    else if (currentDataSource === 'id') S.masterIdPool.push(foundWinner);
                    else S.masterNumericPool.push(foundWinner);
                }
                finalWinnerIds[i] = foundWinner.id;
                presetPool = presetPool.filter(p => p.id !== foundWinner.id);
            }
        }

        let randomPool = [...presetPool];
        for (let i = 0; i < winnerCountForThisRound; i++) {
            if (finalWinnerIds[i] === null) {
                if (randomPool.length === 0) { console.warn(`Pool exhausted for slot ${i + 1}.`); break; }
                const randomIndex = Math.floor(Math.random() * randomPool.length);
                const randomWinner = randomPool.splice(randomIndex, 1)[0];
                if (randomWinner) finalWinnerIds[i] = randomWinner.id;
            }
        }
        return finalWinnerIds;
    },

    startDraw() {
        const S = EngineState;
        // Auto-heal stuck isDrawing state if no active intervals/animations exist
        if (S.isDrawing && (!S.AnimationManager || (S.AnimationManager.intervals && S.AnimationManager.intervals.size === 0))) {
            S.isDrawing = false;
            try { localStorage.setItem('ldp_is_drawing', 'false'); } catch(e){}
        }
        if (S.isDrawing) return;

        // If round was already drawn and user triggers startDraw again, reset completed state to allow fresh spin for this column
        if (S.drawCompletedThisRound) {
            S.drawCompletedThisRound = false;
        }

        if (!this.ensurePoolPrepared()) {
            alert('Please add names or set number range first!');
            return;
        }

        const rcCurrent = S.roundConfigs[S.currentRound] || S.getDefaultRoundConfig(S.currentRound);
        S.syncSettingsFromConfigs();
        const currentDataSource = rcCurrent.dataSource || S.settings.roundDataSources[S.currentRound] || 'numeric';
        let currentPool = (currentDataSource === 'list') ? S.drawListPool : ((currentDataSource === 'id') ? S.drawIdPool : S.drawNumericPool);
        let currentMasterPool = (currentDataSource === 'list') ? S.masterListPool : ((currentDataSource === 'id') ? S.masterIdPool : S.masterNumericPool);

        if (!currentPool || currentPool.length === 0) {
            alert('No participants available in the pool for this round!');
            return;
        }

        const currentPresetValues = new Set((S.presetWinners[S.currentRound] || []).filter(val => val !== null));
        const availableForRandom = currentPool.filter(p => {
            if (currentDataSource === 'list' || currentDataSource === 'id') {
                return !currentPresetValues.has(p.name) && !currentPresetValues.has(p.id.substring(2));
            } else {
                return !currentPresetValues.has(p.name);
            }
        });
        const randomSlotsNeeded = (S.presetWinners[S.currentRound] || []).filter(p => p === null).length;

        if (availableForRandom.length < randomSlotsNeeded) {
            alert('Not enough participants remaining in the pool for this round!');
            return;
        }

        S.isDrawing = true;
        const isStartEnabled = (rcCurrent.audioSpinStart !== undefined) ? rcCurrent.audioSpinStart : (S.audioSettings && S.audioSettings.autoSpinStart);
        if (window.AudioSynth && isStartEnabled) {
            AudioSynth.playSound(rcCurrent.soundSpinStart || 'drumroll');
        }
        if (window.ZoneB) ZoneB.render();

        // Sync to projector
        localStorage.setItem('ldp_is_drawing', 'true');
        localStorage.removeItem('ldp_last_winner');

        const roundWinnerIds = this.selectWinnerIdsForRound(currentPool, currentMasterPool);
        const roundWinnerObjects = roundWinnerIds.map(id =>
            [...S.masterListPool, ...S.masterNumericPool, ...(S.masterIdPool || [])].find(p => p.id === id) || { id: id, name: 'N/A', type: 'unknown' }
        );

        S.allWinners.push(...roundWinnerObjects.filter(Boolean));

        if (!S.settings.allowDuplicates) {
            if (currentDataSource === 'list') {
                S.drawListPool = S.drawListPool.filter(p => !roundWinnerIds.includes(p.id));
            } else if (currentDataSource === 'id') {
                if (S.drawIdPool) S.drawIdPool = S.drawIdPool.filter(p => !roundWinnerIds.includes(p.id));
            } else {
                S.drawNumericPool = S.drawNumericPool.filter(p => !roundWinnerIds.includes(p.id));
            }
        }

        S.roundResults[S.currentRound] = {
            round: S.currentRound + 1,
            winners: roundWinnerObjects,
            type: S.settings.roundDataSources[S.currentRound],
            category: S.settings.roundCategories[S.currentRound] || 'Regular Draw'
        };

        // Pre-render exact geometric virtual stage cards before animation so size & font are 100% identical!
        if (window.Display) {
            const rc = S.roundConfigs[S.currentRound] || S.getDefaultRoundConfig(S.currentRound);
            const dummyWinners = roundWinnerObjects.map((_, idx) => ({ id: `dummy_${idx}`, name: '----' }));
            Display.renderGridMode(dummyWinners, rc);
        }

        // Audio tick during animation
        if (window.AudioSynth && isStartEnabled) {
            const tickInterval = setInterval(() => {
                if (!S.isDrawing) {
                    clearInterval(tickInterval);
                    if (S.AnimationManager && S.AnimationManager.intervals) S.AnimationManager.intervals.delete(tickInterval);
                    return;
                }
                AudioSynth.playTick();
            }, 120);
            S.AnimationManager.addInterval(tickInterval);
        }

        if (S.settings.animationEnabled) {
            Animations.animateDraw(roundWinnerObjects, (winners) => {
                Display.finalizeDraw(winners);
            });
        } else {
            Display.showWinnersInstantly(roundWinnerObjects);
        }
    },

    // Individual Re-draw / Replace specific slot without wiping the rest of the round!
    replaceWinnerAt(roundIdx, winnerIdx) {
        const S = EngineState;
        const roundResult = S.roundResults[roundIdx];
        if (!roundResult || !roundResult.winners || !roundResult.winners[winnerIdx]) return;

        const rc = S.roundConfigs[roundIdx] || S.getDefaultRoundConfig(roundIdx);
        S.syncSettingsFromConfigs();

        const oldWinner = roundResult.winners[winnerIdx];
        const currentDataSource = rc.dataSource || roundResult.type || S.settings.roundDataSources[roundIdx] || 'numeric';
        let currentPool = (currentDataSource === 'list') ? S.drawListPool : ((currentDataSource === 'id') ? S.drawIdPool : S.drawNumericPool);
        let currentMasterPool = (currentDataSource === 'list') ? S.masterListPool : ((currentDataSource === 'id') ? S.masterIdPool : S.masterNumericPool);

        if (!currentPool || currentPool.length === 0) {
            alert("No more participants available in the pool to replace this winner!");
            return;
        }

        if (!S.settings.allowDuplicates && oldWinner && oldWinner.id) {
            const masterObj = currentMasterPool.find(p => p.id === oldWinner.id);
            if (masterObj) {
                if (currentDataSource === 'list') S.drawListPool.push(masterObj);
                else if (currentDataSource === 'id' && S.drawIdPool) S.drawIdPool.push(masterObj);
                else S.drawNumericPool.push(masterObj);
            }
            const allIdx = S.allWinners.findIndex(w => w.id === oldWinner.id);
            if (allIdx !== -1) S.allWinners.splice(allIdx, 1);
        }

        const randomIndex = Math.floor(Math.random() * currentPool.length);
        const newWinner = currentPool.splice(randomIndex, 1)[0];
        if (!newWinner) return;

        S.allWinners.push(newWinner);
        roundResult.winners[winnerIdx] = newWinner;
        roundResult.type = currentDataSource;
        roundResult.category = rc.category || S.settings.roundCategories[roundIdx] || 'Regular Draw';
        S.saveDrawState();

        const isStartEnabled = (rc.audioSpinStart !== undefined) ? rc.audioSpinStart : (S.audioSettings && S.audioSettings.autoSpinStart);
        const isStopEnabled = (rc.audioSpinStop !== undefined) ? rc.audioSpinStop : (S.audioSettings && S.audioSettings.autoSpinStop);

        const onFinishRedraw = () => {
            if (window.AudioSynth && isStopEnabled) {
                AudioSynth.playSound(rc.soundSpinStop || 'victory');
            }
            if (window.ZoneETelegramBot && newWinner) {
                const category = roundResult.category;
                if (rc.telegramAutoGroup) {
                    ZoneETelegramBot.executeAutoRoundBroadcast([newWinner], category);
                }
                if (rc.telegramAutoDirect) {
                    ZoneETelegramBot.executeAutoDirectMessages([newWinner], category);
                }
            }
        };

        if (roundIdx === S.currentRound) {
            if (S.settings.animationEnabled && window.Animations && typeof Animations.runAnimationForBox === 'function') {
                if (window.AudioSynth && isStartEnabled) {
                    AudioSynth.playSound(rc.soundSpinStart || 'drumroll');
                }
                const duration = Animations.getAnimationDuration(roundIdx);
                Animations.runAnimationForBox(winnerIdx, newWinner, duration, roundIdx, () => {
                    onFinishRedraw();
                });
            } else {
                const itemEl = document.getElementById(`item-${winnerIdx}`);
                if (itemEl) {
                    const valueEl = itemEl.querySelector('.virtual-winner-value') || itemEl.querySelector('.winner-item') || itemEl;
                    if (valueEl) {
                        valueEl.innerHTML = newWinner.name;
                        if (!itemEl.classList.contains('virtual-winner-card')) {
                            Animations.adjustFontSizeToFit(valueEl);
                        }
                    }
                }
                if (window.Display) Display.syncToProjectorMirror();
                onFinishRedraw();
            }
        } else {
            onFinishRedraw();
        }

        if (window.ZoneA) ZoneA.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneC) ZoneC.render();
        if (window.ZoneD) ZoneD.render();
        if (window.ZoneE) ZoneE.render();
    },

    initializeDisplayMode(forceNewDraw) {
        const S = EngineState;
        const hasSavedState = localStorage.getItem('luckyDrawState');
        if (hasSavedState && !forceNewDraw) {
            const tempDrawState = S.restoreDrawStateData();
            if (tempDrawState) {
                S.syncSettingsFromConfigs();
                if (!S.drawListPool || S.drawListPool.length === 0 || !S.drawNumericPool || S.drawNumericPool.length === 0) {
                    this.initializePoolsSilently();
                }
                if (window.ZoneA) ZoneA.render();
                if (window.ZoneB) ZoneB.render();
                if (window.ZoneD) ZoneD.render();
                if (window.ZoneE) ZoneE.render();
                if (S.roundResults && S.roundResults[S.currentRound] && S.roundResults[S.currentRound].winners) {
                    S.drawCompletedThisRound = true;
                    Display.showWinnersInstantly(S.roundResults[S.currentRound].winners);
                } else {
                    S.drawCompletedThisRound = false;
                    Display.resetDisplayForNewRound();
                }
                return;
            }
        }

        S.syncSettingsFromConfigs();
        S.currentRound = 0;
        S.drawCompletedThisRound = false;
        S.isDrawing = false;
        try { localStorage.setItem('ldp_is_drawing', 'false'); } catch(e){}
        S.allWinners = [];
        S.roundResults = {};
        this.initializePoolsSilently();
        S.saveDrawState();

        if (window.ZoneA) ZoneA.render();
        if (window.ZoneB) ZoneB.render();
        if (window.ZoneD) ZoneD.render();
        if (window.ZoneE) ZoneE.render();
        Display.resetDisplayForNewRound();
    }
};
