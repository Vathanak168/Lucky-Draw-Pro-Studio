/**
 * virtual_scaler.js - 1-to-1 Video Player Viewport Fitter
 * Fits one fixed 1920x1080 stage inside any viewport container using CSS transform: scale().
 * Used identically by Laptop Mini Screen (#stageOutputScreen) and Projector Stage.
 */
window.VirtualStageFitter = {
    VIRTUAL_WIDTH: 1920,
    VIRTUAL_HEIGHT: 1080,

    /**
     * Attaches a ResizeObserver to automatically scale the 1920x1080 shell to fit inside viewportEl.
     * @param {HTMLElement} viewportEl - Outer .stage-viewport wrapper
     * @param {HTMLElement} shellEl - Inner .virtual-canvas-shell
     */
    attach(viewportEl, shellEl) {
        if (!viewportEl || !shellEl) return null;

        const fit = () => {
            const bounds = viewportEl.getBoundingClientRect();
            const availableWidth = Math.max(0, bounds.width);
            const availableHeight = Math.max(0, bounds.height);

            if (availableWidth === 0 || availableHeight === 0) return;

            const scaleX = availableWidth / this.VIRTUAL_WIDTH;
            const scaleY = availableHeight / this.VIRTUAL_HEIGHT;
            const scale = Math.min(scaleX, scaleY); // Enforce zero cropping (object-fit: contain)

            shellEl.style.setProperty('--stage-scale', scale.toFixed(6));
            shellEl.style.transform = `scale(${scale.toFixed(6)})`;
        };

        const observer = new ResizeObserver(() => {
            requestAnimationFrame(fit);
        });

        observer.observe(viewportEl);
        window.addEventListener('resize', fit);
        fit();

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', fit);
        };
    },

    /**
     * Calculates the deterministic, zero-overflow grid dimensions inside 1920x1080.
     * @param {number} winnerCount - Number of winners to display
     */
    calculateLayout(winnerCount) {
        const N = Math.max(1, Math.min(25, winnerCount || 1));

        let columns = 1;
        let gap = 32;
        let cardWidth = 1100;
        let cardHeight = 360;
        let fontSize = 140;

        if (N === 1) {
            // 1 ប្រអប់៖ ១ ជួរធំកណ្តាល
            columns = 1; gap = 32; cardWidth = 1200; cardHeight = 380; fontSize = 160;
        } else if (N === 2) {
            // ២ ប្រអប់៖ ១ ជួរធំកណ្តាល (2 columns in 1 horizontal row)
            columns = 2; gap = 40; cardWidth = 840; cardHeight = 340; fontSize = 140;
        } else if (N === 3) {
            // ៣ ប្រអប់៖ ១ ជួរធំកណ្តាល (3 columns in 1 horizontal row)
            columns = 3; gap = 36; cardWidth = 580; cardHeight = 320; fontSize = 120;
        } else if (N >= 4 && N <= 6) {
            // ៤ - ៦ ប្រអប់៖ បង្ហាញជា ២ Column
            columns = 2; gap = 32; cardWidth = 800; cardHeight = 260; fontSize = 115;
        } else if (N >= 7 && N <= 9) {
            // ៧ - ៩ ប្រអប់៖ បង្ហាញជា ៣ Column
            columns = 3; gap = 26; cardWidth = 560; cardHeight = 220; fontSize = 92;
        } else if (N === 10) {
            // ១០ ប្រអប់៖ បង្ហាញជា ២ Column (៥ ជួរ)
            columns = 2; gap = 20; cardWidth = 760; cardHeight = 180; fontSize = 78;
        } else if (N >= 11 && N <= 20) {
            // ១១ - ២០ ប្រអប់៖ បង្ហាញជា ៤ Column (ឬ ៣ Column)
            columns = 4; gap = 20; cardWidth = 430; cardHeight = 175; fontSize = 64;
        } else {
            // ២១ - ២៥ ប្រអប់៖ បង្ហាញជា ៥ Column
            columns = 5; gap = 16; cardWidth = 340; cardHeight = 160; fontSize = 52;
        }

        return { columns, gap, cardWidth, cardHeight, fontSize };
    }
};
