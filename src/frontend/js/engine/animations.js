/**
 * animations.js - Draw Animations inside 1920x1080 Virtual Canvas
 * Ensures 100% consistent font family (JetBrains Mono) and font size during spinning AND final display.
 */
window.Animations = {
    adjustFontSizeToFit(element) {
        if (!element) return;
        // Do NOT alter font size if it's our virtual stage winner value (pre-calculated by VirtualStageFitter)
        if (element.classList.contains('virtual-winner-value') || (element.closest && element.closest('.virtual-winner-card'))) {
            return;
        }
        const S = EngineState;
        if (S.manualFontSize) { element.style.fontSize = S.manualFontSize; return; }
        let container = element.closest('.number-box') || element.closest('li') || element.closest('span');
        if (!container && element.parentElement) container = element.parentElement;
        if (container) {
            const maxFontSize = 64;
            const minFontSize = 12;
            element.style.fontSize = `${maxFontSize}px`;
            while ((element.scrollWidth > container.clientWidth * 0.9 || element.scrollHeight > container.clientHeight * 0.9) && parseFloat(element.style.fontSize) > minFontSize) {
                const currentSize = parseFloat(element.style.fontSize);
                element.style.fontSize = `${currentSize - 1}px`;
            }
        } else {
            element.style.fontSize = '24px';
        }
    },

    runTextShuffleAnimation(displayEl, winner, duration, roundIdx) {
        const S = EngineState;
        const targetRound = (typeof roundIdx === 'number') ? roundIdx : S.currentRound;
        const rc = (S.roundConfigs && S.roundConfigs[targetRound]) ? S.roundConfigs[targetRound] : {};
        const currentDataSource = rc.dataSource || S.settings.roundDataSources[targetRound] || 'numeric';
        const currentPool = (currentDataSource === 'list') ? S.drawListPool : ((currentDataSource === 'id') ? (S.drawIdPool || S.masterIdPool || []) : S.drawNumericPool);
        if (!currentPool || currentPool.length === 0) {
            displayEl.innerHTML = winner.name;
            this.adjustFontSizeToFit(displayEl);
            if (window.Display) Display.syncToProjectorMirror();
            return;
        }

        const isVirtual = displayEl.classList.contains('virtual-winner-value') || (displayEl.closest && displayEl.closest('.virtual-winner-card'));
        if (!isVirtual) {
            displayEl.style.fontSize = S.manualFontSize || '24px';
        }

        const interval = setInterval(() => {
            if (currentPool.length > 0) {
                const rp = currentPool[Math.floor(Math.random() * currentPool.length)];
                if (document.body.contains(displayEl)) {
                    displayEl.innerHTML = rp.name;
                    if (window.Display && Math.random() < 0.4) Display.syncToProjectorMirror();
                } else {
                    clearInterval(interval);
                }
            }
        }, 60);

        S.shuffleIntervals.push(interval);
        setTimeout(() => {
            clearInterval(interval);
            if (document.body.contains(displayEl)) {
                displayEl.innerHTML = winner.name;
                this.adjustFontSizeToFit(displayEl);
                if (window.Display) Display.syncToProjectorMirror();
            }
        }, duration);
    },

    getAnimationDuration(roundIdx) {
        const S = EngineState;
        const targetRound = (typeof roundIdx === 'number') ? roundIdx : S.currentRound;
        const rc = (S.roundConfigs && S.roundConfigs[targetRound]) ? S.roundConfigs[targetRound] : null;
        const selectedDuration = rc ? rc.duration : (S.settings.roundDurations[targetRound] || S.settings.roundDurations[S.currentRound]);
        if (selectedDuration && selectedDuration !== 'default') return parseInt(selectedDuration);

        const speed = S.displaySettings.drawSpeed || 'normal';
        if (speed === 'fast') return 1200;
        if (speed === 'suspense') return 6000;
        return 3000;
    },

    animateDraw(winners, onComplete) {
        const S = EngineState;
        const DURATION = this.getAnimationDuration(S.currentRound);

        S.AnimationManager.clearAll();
        S.shuffleIntervals.forEach(clearInterval);
        S.shuffleIntervals = [];

        document.querySelectorAll('.virtual-winner-card, .winner-item, .number-box').forEach(el => {
            el.classList.remove('drawing', 'completed', 'has-glow');
            if (el.classList.contains('winner-item') || el.classList.contains('virtual-winner-value')) {
                const spans = el.querySelectorAll('span.char');
                if (spans.length > 0) el.textContent = '';
            }
        });

        const self = this;

        // ចុចម្តង Draw ទាំងអស់គ្រប់ប្រអប់ (Simultaneous All-Box Draw with 0ms start delay across all boxes)
        winners.forEach((winner, i) => self.runAnimationForBox(i, winner, DURATION, S.currentRound));

        S.AnimationManager.addTimeout(setTimeout(() => {
            if (onComplete) onComplete(winners);
        }, DURATION + 400));
    },

    runAnimationForBox(index, winnerObject, duration, roundIdx, onComplete) {
        const S = EngineState;
        const itemElement = document.getElementById(`item-${index}`);
        if (!itemElement || !winnerObject) {
            if (onComplete) onComplete();
            return;
        }

        const isVirtualCard = itemElement.classList.contains('virtual-winner-card');
        const isBox = itemElement.classList.contains('number-box');
        const displayElement = isVirtualCard ? (itemElement.querySelector('.virtual-winner-value') || itemElement) : (isBox ? itemElement.querySelector('.number-display') : itemElement);
        if (!displayElement) {
            if (onComplete) onComplete();
            return;
        }

        displayElement.innerHTML = '';
        displayElement.style.opacity = 1;

        if (isBox || isVirtualCard) itemElement.classList.add('drawing');
        else displayElement.classList.add('drawing');

        if (!isVirtualCard) {
            displayElement.style.fontSize = S.manualFontSize || '24px';
        }
        this.adjustFontSizeToFit(displayElement);

        // Always execute Simultaneous Text Shuffle strictly using Column settings
        this.runTextShuffleAnimation(displayElement, winnerObject, duration, roundIdx);

        setTimeout(() => {
            if (document.body.contains(displayElement)) {
                displayElement.innerHTML = winnerObject.name;
                this.adjustFontSizeToFit(displayElement);

                if (isBox || isVirtualCard) { itemElement.classList.remove('drawing'); itemElement.classList.add('completed'); }
                else { displayElement.classList.remove('drawing'); displayElement.classList.add('completed'); }

                if (S.settings.winnerGlowEnabled) {
                    if (isBox || isVirtualCard) itemElement.classList.add('has-glow');
                    else displayElement.classList.add('has-glow');
                }
                if (window.Display) Display.syncToProjectorMirror();
            }
            if (onComplete) onComplete();
        }, duration);
    }
};
