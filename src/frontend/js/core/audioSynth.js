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
}

window.AudioSynth = new WebAudioSynth();
