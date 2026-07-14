(function initializeAstaRuntime() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const runtimeToken = hash.get('runtime_token') || '';
    if (window.location.hash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
        const inputUrl = input instanceof Request ? input.url : input;
        const requestUrl = new URL(inputUrl, window.location.href);
        if (requestUrl.origin !== window.location.origin || !runtimeToken) {
            return originalFetch(input, init);
        }
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('X-Asta-Runtime-Token', runtimeToken);
        return originalFetch(input, { ...init, headers });
    };

    window.AstaRuntime = Object.freeze({
        token: runtimeToken,
        withToken(path) {
            const separator = String(path).includes('#') ? '&' : '#';
            return `${path}${separator}runtime_token=${encodeURIComponent(runtimeToken)}`;
        },
        websocketUrl(path) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const url = new URL(`${protocol}//${window.location.host}${path}`);
            url.searchParams.set('runtime_token', runtimeToken);
            return url.toString();
        }
    });
})();
