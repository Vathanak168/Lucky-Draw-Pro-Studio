// src/frontend/js/zones/vjConsoleShell.js
class VJConsoleMasterController {
    constructor() {
        this.isDrawing = false;
        this.tickerText = "";
        this.lastWinner = null;
        this.tickerInterval = null;
        this.activeScale = 1.0;
    }

    async init() {
        // Initialize all modular zones
        if (window.ZoneA_Deck) await window.ZoneA_Deck.init();
        if (window.ZoneB_Transport) window.ZoneB_Transport.init();
        if (window.ZoneC_Monitors) await window.ZoneC_Monitors.init();
        if (window.ZoneD_Inspector) await window.ZoneD_Inspector.init();
        if (window.ZoneE_Browser) await window.ZoneE_Browser.init();

        // Check if there is an active slot
        if (window.ZoneA_Deck && window.ZoneA_Deck.activeSlotId) {
            window.ZoneA_Deck.selectSlot(window.ZoneA_Deck.activeSlotId);
        }

        console.log("VJ Console Modular Engine Initialized!");
    }

    async executeLiveDraw(slotId) {
        if (this.isDrawing) return;
        this.isDrawing = true;
        this.lastWinner = null;
        if (window.ZoneC_Monitors) window.ZoneC_Monitors.render();

        // 1. Fetch candidates from active pool (or local EngineState if offline)
        let candidates = [];
        try {
            const res = await fetch("http://127.0.0.1:8926/api/core/pool?status=active");
            if (res.ok) candidates = await res.json();
        } catch (e) {
            console.warn("Backend fetch failed, checking local engine pools:", e);
        }

        if (!candidates.length && window.EngineState && window.EngineState.masterListPool.length) {
            candidates = window.EngineState.masterListPool;
        }

        if (!candidates.length) {
            alert("No active candidates available in the pool! Please import participants first.");
            this.isDrawing = false;
            if (window.ZoneC_Monitors) window.ZoneC_Monitors.render();
            return;
        }

        // 2. Trigger the draw selection right away so we know the final winner(s)
        let drawData = null;
        try {
            const drawRes = await fetch("http://127.0.0.1:8926/api/core/slots/draw", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slot_id: slotId })
            });

            if (!drawRes.ok) {
                const errData = await drawRes.json();
                alert(errData.detail || "Draw Error");
                this.isDrawing = false;
                if (window.ZoneC_Monitors) window.ZoneC_Monitors.render();
                return;
            }
            drawData = await drawRes.json();
        } catch (e) {
            console.warn("Backend draw selection failed, picking local winner via legacy algorithm:", e);
            const randomCand = candidates[Math.floor(Math.random() * candidates.length)];
            drawData = { winner: { ...randomCand, name: randomCand.name || randomCand.ticket_num } };
        }

        const winnerObj = drawData.winner;
        const durationSeconds = 4.5;
        const speedMultiplier = window.ZoneB_Transport ? (1.0 / window.ZoneB_Transport.speed) : 1.0;
        const totalDurationMs = durationSeconds * 1000 * speedMultiplier;

        localStorage.setItem("ldp_is_drawing", "true");
        localStorage.removeItem("ldp_last_winner");

        // 3. Execute exact legacy index16 animation & typography fitting on local monitor and sync to projector
        const monitorEl = document.getElementById("monitorAnimationTicker");
        const liveBox = document.getElementById("liveOutputDisplayBox");

        // Determine configured slot animation or default to legacy shuffle
        const slotObj = window.ZoneA_Deck ? window.ZoneA_Deck.slots.find(s => s.id === slotId) : null;
        const animStyle = slotObj && slotObj.animation_mode ? slotObj.animation_mode : 'shuffle';

        if (monitorEl && window.Animations) {
            if (animStyle === 'char-reveal') {
                window.Animations.runCharacterRevealAnimation(monitorEl, winnerObj, totalDurationMs);
            } else if (animStyle === 'bounce-reveal') {
                window.Animations.runBounceRevealAnimation(monitorEl, winnerObj, totalDurationMs);
            } else if (animStyle === 'flash-reveal') {
                window.Animations.runFlashRevealAnimation(monitorEl, winnerObj, totalDurationMs);
            } else {
                window.Animations.runTextShuffleAnimation(monitorEl, winnerObj, totalDurationMs);
            }
        }

        // Run 80ms loop for projector sync and audio ticks using BroadcastChannel
        if (!this.mirrorChannel && ('BroadcastChannel' in window)) {
            this.mirrorChannel = new BroadcastChannel('ldp_vj_mirror_channel');
        }
        this.tickerInterval = setInterval(() => {
            const randomCand = candidates[Math.floor(Math.random() * candidates.length)];
            const candName = randomCand.name ? `${randomCand.name} (${randomCand.ticket_num || ''})` : (randomCand.ticket_num || 'Participant');
            this.tickerText = candName;
            if (this.mirrorChannel) {
                this.mirrorChannel.postMessage({ type: 'ticker_update', text: this.tickerText });
            } else {
                localStorage.setItem("ldp_ticker_text", this.tickerText);
            }
            if (window.AudioSynth) {
                window.AudioSynth.playTick();
            }
        }, 80);

        // Wait for animation completion
        await new Promise(resolve => setTimeout(resolve, totalDurationMs));
        clearInterval(this.tickerInterval);

        // 4. Finalize Winner Display and state
        this.lastWinner = winnerObj;
        this.isDrawing = false;
        localStorage.setItem("ldp_is_drawing", "false");
        localStorage.setItem("ldp_last_winner", JSON.stringify(this.lastWinner));

        if (monitorEl) {
            monitorEl.innerHTML = winnerObj.name || winnerObj.ticket_num;
            if (window.Animations && window.Animations.adjustFontSizeToFit) {
                window.Animations.adjustFontSizeToFit(monitorEl);
            }
        }

        // Trigger audio celebration & confetti
        if (window.AudioSynth) {
            window.AudioSynth.playFanfare();
        }

        // Refresh all zones with updated winner states
        if (window.ZoneA_Deck) await window.ZoneA_Deck.refresh();
        if (window.ZoneC_Monitors) await window.ZoneC_Monitors.refresh();
        if (window.ZoneE_Browser) await window.ZoneE_Browser.refresh();
    }

    applyTextScale(scaleFactor) {
        this.activeScale = scaleFactor;
        localStorage.setItem("ldp_text_scale", scaleFactor);
        const box = document.getElementById("liveOutputDisplayBox");
        if (box) {
            box.style.transform = `scale(${scaleFactor})`;
            box.style.transformOrigin = "center center";
        }
    }
}

window.VJConsole = new VJConsoleMasterController();
