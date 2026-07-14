window.MacOSUI = {
    refreshQueued: false,

    refreshIcons() {
        if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
        window.lucide.createIcons({
            attrs: {
                width: 15,
                height: 15,
                'stroke-width': 1.8,
                'aria-hidden': 'true'
            }
        });
    },

    queueIconRefresh() {
        if (this.refreshQueued) return;
        this.refreshQueued = true;
        window.requestAnimationFrame(() => {
            this.refreshQueued = false;
            this.refreshIcons();
        });
    },

    init() {
        this.refreshIcons();
        const observer = new MutationObserver(() => this.queueIconRefresh());
        observer.observe(document.body, { childList: true, subtree: true });
    }
};

document.addEventListener('DOMContentLoaded', () => MacOSUI.init());
