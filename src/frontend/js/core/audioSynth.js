// src/frontend/js/core/audioSynth.js
class WebAudioSynth {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
    }

    initCtx() {
        if (!this.ctx && typeof window.AudioContext !== 'undefined') {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTick() {
        if (this.isMuted) return;
        this.initCtx();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    playFanfare() {
        if (this.isMuted) return;
        this.initCtx();
        if (!this.ctx) return;

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime + (idx * 0.12));

            gain.gain.setValueAtTime(0.2, this.ctx.currentTime + (idx * 0.12));
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + (idx * 0.12) + 0.4);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(this.ctx.currentTime + (idx * 0.12));
            osc.stop(this.ctx.currentTime + (idx * 0.12) + 0.4);
        });
    }

    triggerConfetti() {
        // Disabled per user request (no fireworks/confetti)
    }

    playDrumroll() {
        if (this.isMuted) return;
        this.initCtx();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // 1. Snare roll: 14 rapid, bright, punchy drum beats building up in tempo and volume over 1.6s
        const hits = 14;
        for (let i = 0; i < hits; i++) {
            const time = now + (i * 0.11);
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            // Use sawtooth & square for bright, snappy snare presence clearly audible on PC speakers
            osc.type = (i % 2 === 0) ? 'sawtooth' : 'square';
            osc.frequency.setValueAtTime(380 + (i * 15), time);
            osc.frequency.exponentialRampToValueAtTime(160, time + 0.08);

            const vol = 0.15 + (i * 0.012);
            gain.gain.setValueAtTime(vol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(time);
            osc.stop(time + 0.08);
        }

        // 2. Grand Cymbal Crash at the end of the roll (`1.54s`)
        const crashTime = now + (hits * 0.11);
        [600, 850, 1200, 1650, 2400].forEach((freq) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, crashTime);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.8, crashTime + 0.6);

            gain.gain.setValueAtTime(0.18, crashTime);
            gain.gain.exponentialRampToValueAtTime(0.005, crashTime + 0.6);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(crashTime);
            osc.stop(crashTime + 0.6);
        });
    }

    playApplause() {
        if (this.isMuted) return;
        this.initCtx();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // 1. Jubilant Celebration Chimes / Bell Arpeggio (A Major celebration chord)
        const bells = [880.00, 1108.73, 1318.51, 1760.00, 2217.46, 2637.02];
        bells.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + (idx * 0.1));

            gain.gain.setValueAtTime(0.22, now + (idx * 0.1));
            gain.gain.exponentialRampToValueAtTime(0.008, now + (idx * 0.1) + 0.7);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + (idx * 0.1));
            osc.stop(now + (idx * 0.1) + 0.7);
        });

        // 2. Crowd Clapping & Cheering Chorus (Multiple rhythmic clapping bursts from 400Hz to 1200Hz)
        for (let i = 0; i < 18; i++) {
            const clapTime = now + (i * 0.09) + (Math.random() * 0.03);
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(600 + (Math.random() * 500), clapTime);
            osc.frequency.exponentialRampToValueAtTime(200, clapTime + 0.05);

            gain.gain.setValueAtTime(0.14, clapTime);
            gain.gain.exponentialRampToValueAtTime(0.005, clapTime + 0.05);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(clapTime);
            osc.stop(clapTime + 0.05);
        }
    }

    playHeartbeat() {
        if (this.isMuted) return;
        this.initCtx();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // Dramatic Cinema Stage Double-Pulse (`Lub - Dub ... Lub - Dub ... Lub - Dub`)
        // Using layered mid-bass (280Hz -> 140Hz) and high harmonic punch (560Hz -> 280Hz) so it is 100% audible on all laptop/PC speakers!
        const pulseOffsets = [0, 0.22, 0.75, 0.97, 1.50, 1.72];
        pulseOffsets.forEach((offset) => {
            const time = now + offset;
            [280, 560].forEach((startFreq, layerIdx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = layerIdx === 0 ? 'sawtooth' : 'triangle';
                osc.frequency.setValueAtTime(startFreq, time);
                osc.frequency.exponentialRampToValueAtTime(startFreq * 0.45, time + 0.16);

                gain.gain.setValueAtTime(layerIdx === 0 ? 0.25 : 0.18, time);
                gain.gain.exponentialRampToValueAtTime(0.005, time + 0.16);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(time);
                osc.stop(time + 0.16);
            });
        });
    }

    playSound(name) {
        if (!name) return;
        const n = name.toLowerCase();
        if (n === 'drumroll') this.playDrumroll();
        else if (n === 'applause') this.playApplause();
        else if (n === 'heartbeat') this.playHeartbeat();
        else if (n === 'victory' || n === 'fanfare') this.playFanfare();
        else if (n === 'tick') this.playTick();
    }
}

window.AudioSynth = new WebAudioSynth();
