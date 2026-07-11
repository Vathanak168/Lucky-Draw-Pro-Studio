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
        } else if (N === 4) {
            // ៤ ប្រអប់៖ ២ លើ + ២ ក្រោម (2x2 Grid)
            columns = 2; gap = 36; cardWidth = 800; cardHeight = 280; fontSize = 118;
        } else if (N === 5 || N === 6) {
            // ៥ - ៦ ប្រអប់៖ ៣ ប្រអប់ក្នុង ១ ជួរ (3x2 Grid / 3+2 Centered)
            columns = 3; gap = 32; cardWidth = 580; cardHeight = 270; fontSize = 115;
        } else if (N === 7 || N === 8) {
            // ៧ - ៨ ប្រអប់៖ ៤ ប្រអប់ក្នុង ១ ជួរ (4x2 Grid / 4+3 Centered)
            columns = 4; gap = 24; cardWidth = 430; cardHeight = 240; fontSize = 105;
        } else if (N === 9) {
            // ៩ ប្រអប់៖ ៣ ប្រអប់ក្នុង ១ ជួរ (3x3 Grid)
            columns = 3; gap = 26; cardWidth = 560; cardHeight = 220; fontSize = 96;
        } else if (N >= 10 && N <= 12) {
            // ១០ - ១២ ប្រអប់៖ ៤ ប្រអប់ក្នុង ១ ជួរ (៣ ជួរដេក)
            columns = 4; gap = 24; cardWidth = 430; cardHeight = 200; fontSize = 88;
        } else if (N >= 13 && N <= 16) {
            // ១៣ - ១៦ ប្រអប់៖ ៤ ប្រអប់ក្នុង ១ ជួរ (៤ ជួរដេក)
            columns = 4; gap = 20; cardWidth = 430; cardHeight = 170; fontSize = 74;
        } else if (N >= 17 && N <= 20) {
            // ១៧ - ២០ ប្រអប់៖ ៤ ប្រអប់ក្នុង ១ ជួរ (៥ ជួរដេក)
            columns = 4; gap = 18; cardWidth = 430; cardHeight = 150; fontSize = 64;
        } else {
            // ២១ - ២៥ ប្រអប់៖ ៥ ប្រអប់ក្នុង ១ ជួរ
            columns = 5; gap = 16; cardWidth = 340; cardHeight = 145; fontSize = 56;
        }

        return { columns, gap, cardWidth, cardHeight, fontSize };
    }
};
