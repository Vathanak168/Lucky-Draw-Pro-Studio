const assert = require('assert');
const fs = require('fs');

const loginHtml = fs.readFileSync('src/frontend/login.html', 'utf8');
const indexHtml = fs.readFileSync('src/frontend/index.html', 'utf8');
const loginJs = fs.readFileSync('src/frontend/js/auth/login.js', 'utf8');
const studioJs = fs.readFileSync('src/frontend/js/studio.js', 'utf8');

const ids = [...loginHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.strictEqual(new Set(ids).size, ids.length, 'Production login contains duplicate element IDs');
for (const match of loginHtml.matchAll(/<label\s+for="([^"]+)"/g)) {
    assert(ids.includes(match[1]), `Label target is missing: ${match[1]}`);
}

for (const id of [
    'passwordForm',
    'requestForm',
    'pendingView',
    'machineIdDisplay',
    'authStatus',
    'retryConnectionButton',
]) {
    assert(loginHtml.includes(`id="${id}"`), `Missing login control: ${id}`);
}

assert(loginHtml.includes('assets/asta-mark.svg'), 'Asta mark is missing');
assert(loginHtml.includes('js/auth/login.js'), 'Production login controller is not loaded');
assert(!loginHtml.includes('Simulation Controls'), 'Simulator controls leaked into production login');
assert(!loginHtml.includes('Wi-Fi Password'), 'Sensitive Wi-Fi information leaked into production login');
assert(indexHtml.indexOf('js/api.js') < indexHtml.indexOf('js/studio.js'), 'Auth API must load before Studio');
assert(studioJs.includes('StudioAPI.getAuthSession()'), 'Workspace startup is missing the auth guard');
assert(loginJs.includes("window.location.replace('index.html')"), 'Login does not enter the workspace');
assert(loginJs.includes('startApprovalPolling()'), 'Remote approval polling is missing');
assert(loginJs.includes('startBlockCountdown('), 'Blocked-state countdown is missing');

console.log('PASS_AUTH_FRONTEND_CONTRACT');
