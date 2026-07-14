const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const serverSource = fs.readFileSync('GoogleAppsScript_Gmail_Auth.js', 'utf8');
const dashboardHtml = fs.readFileSync('GoogleAppsScript_Admin_Dashboard.html', 'utf8');

assert(serverSource.includes('Review Request'), 'Email must have one review call to action');
assert(!serverSource.includes('Quick Actions'), 'Email still contains duplicate quick actions');
assert(!serverSource.includes('action === "approve"'), 'State-changing GET approve action remains');
assert(!serverSource.includes('action === "reject"'), 'Reject action must not be available');
assert(!serverSource.includes('XFrameOptionsMode.ALLOWALL'), 'Dashboard still allows unrestricted framing');
assert(!serverSource.includes('jsonOutput_({ status: "OK", ...getPasswordPayload_'), 'Public password-hash sync endpoint remains');
assert(!/\bglobal_password\s*:/.test(serverSource), 'Plaintext cloud password response remains');
assert(serverSource.includes('setRequestNotifications'), 'Super Admin notification control is missing');

for (const label of ['Confirm', 'Block', 'Unblock']) {
  assert(dashboardHtml.includes(`>${label}<`) || dashboardHtml.includes(`<span>${label}</span>`), `Missing Admin action: ${label}`);
}
assert(!dashboardHtml.includes('>Reject<'), 'Reject action leaked into the Admin dashboard');
assert(dashboardHtml.includes('@media (max-width: 760px)'), 'Responsive mobile layout is missing');
assert(dashboardHtml.includes('notificationToggle'), 'Notification toggle is missing');

const ids = [...dashboardHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.strictEqual(new Set(ids).size, ids.length, 'Dashboard contains duplicate IDs');
for (const match of dashboardHtml.matchAll(/<label\s+for="([^"]+)"/g)) {
  assert(ids.includes(match[1]), `Dashboard label target is missing: ${match[1]}`);
}

const inlineScripts = [...dashboardHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1].trim())
  .filter(Boolean);
for (const script of inlineScripts) {
  new vm.Script(script);
}

function createProperties(initial = {}) {
  const store = { ...initial };
  return {
    getProperty(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    setProperty(key, value) { store[key] = String(value); return this; },
    deleteProperty(key) { delete store[key]; return this; },
    getProperties() { return { ...store }; },
    store,
  };
}

const properties = createProperties({
  GLOBAL_MASTER_PASSWORD: 'legacy-password',
  GLOBAL_PASSWORD_VERSION: '4',
  REQUEST_NOTIFICATIONS_ENABLED: 'false',
});
const sentEmails = [];

const sandbox = {
  console,
  Date,
  Math,
  Object,
  Array,
  JSON,
  Number,
  String,
  RegExp,
  Error,
  parseInt,
  encodeURIComponent,
  PropertiesService: {
    getScriptProperties() { return properties; },
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(text) {
      return {
        text,
        setMimeType() { return this; },
      };
    },
  },
  HtmlService: {
    createHtmlOutputFromFile(name) {
      return {
        name,
        setTitle() { return this; },
        addMetaTag() { return this; },
      };
    },
  },
  ScriptApp: {
    getService() { return { getUrl() { return 'https://script.google.com/macros/s/test/exec'; } }; },
  },
  Session: {
    getScriptTimeZone() { return 'Asia/Bangkok'; },
  },
  MailApp: {
    sendEmail(message) { sentEmails.push(message); },
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    getUuid() { return crypto.randomUUID(); },
    computeDigest(_algorithm, value) {
      return [...crypto.createHash('sha256').update(String(value)).digest()].map(byte => byte > 127 ? byte - 256 : byte);
    },
    base64EncodeWebSafe(bytes) {
      return Buffer.from(bytes.map(byte => byte < 0 ? byte + 256 : byte)).toString('base64url');
    },
    formatDate(date) { return new Date(date).toISOString(); },
  },
};

vm.createContext(sandbox);
vm.runInContext(serverSource, sandbox);

const requestResponse = sandbox.doPost({
  postData: {
    contents: JSON.stringify({
      action: 'request',
      machine_id: 'LDP-TEST-0001',
      client_name: '<Stage Laptop>',
      timestamp: 1784033502,
    }),
  },
});
const requestPayload = JSON.parse(requestResponse.text);
assert.strictEqual(requestPayload.status, 'SUCCESS');
assert.strictEqual(requestPayload.notification_suppressed, true);
assert.strictEqual(sentEmails.length, 0, 'Email sent while notifications were off');

const superToken = sandbox.getAccessTokenForEmail_('chhaysereyvathanak@gmail.com', properties);
let dashboard = sandbox.getAdminDashboardState(superToken);
assert.strictEqual(dashboard.role, 'superadmin');
assert.strictEqual(dashboard.requests[0].status, 'PENDING');

dashboard = sandbox.runAdminAction(superToken, 'LDP-TEST-0001', 'confirm', 0);
assert.strictEqual(dashboard.requests[0].status, 'CONFIRMED');

const checkResponse = sandbox.doPost({
  postData: { contents: JSON.stringify({ action: 'check', machine_id: 'LDP-TEST-0001' }) },
});
const checkPayload = JSON.parse(checkResponse.text);
assert.strictEqual(checkPayload.approved, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(checkPayload, 'global_password_hash'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(checkPayload, 'global_password'), false);

const verifyResponse = sandbox.doPost({
  postData: { contents: JSON.stringify({ action: 'verify_password', password: 'legacy-password' }) },
});
const verifyPayload = JSON.parse(verifyResponse.text);
assert.strictEqual(verifyPayload.verified, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(verifyPayload, 'global_password_hash'), false);

dashboard = sandbox.runAdminAction(superToken, 'LDP-TEST-0001', 'block', 3600);
assert.strictEqual(dashboard.requests[0].status, 'BLOCKED');
dashboard = sandbox.runAdminAction(superToken, 'LDP-TEST-0001', 'unblock', 0);
assert.strictEqual(dashboard.requests[0].status, 'PENDING');

dashboard = sandbox.setRequestNotifications(superToken, true);
assert.strictEqual(dashboard.notifications_enabled, true);

sandbox.doPost({
  postData: {
    contents: JSON.stringify({
      action: 'request',
      machine_id: 'LDP-TEST-0002',
      client_name: '<script>alert(1)</script>',
      timestamp: 1784033602,
    }),
  },
});
assert.strictEqual(sentEmails.length, 1, 'Enabled request notification was not sent');
assert(!sentEmails[0].htmlBody.includes('<script>alert(1)</script>'), 'Email contains unescaped request data');
assert.strictEqual((sentEmails[0].htmlBody.match(/Review Request/g) || []).length, 1);
assert(!sentEmails[0].htmlBody.includes('>Reject<'));

const passwordResult = sandbox.changeGlobalPassword(superToken, 'updated-password');
assert.strictEqual(passwordResult.ok, true);
assert(/^[a-f0-9]{64}$/.test(properties.store.GLOBAL_MASTER_PASSWORD_HASH));
assert.strictEqual(Object.prototype.hasOwnProperty.call(properties.store, 'GLOBAL_MASTER_PASSWORD'), false);

sandbox.addAuthorizedAdmin(superToken, 'admin@example.com');
const adminToken = sandbox.getAccessTokenForEmail_('admin@example.com', properties);
const adminDashboard = sandbox.getAdminDashboardState(adminToken);
assert.strictEqual(adminDashboard.role, 'admin');
assert.strictEqual(adminDashboard.administrators.length, 0);
assert.throws(() => sandbox.setRequestNotifications(adminToken, false), /Super Admin/);

properties.deleteProperty('GLOBAL_MASTER_PASSWORD_HASH');
properties.deleteProperty('GLOBAL_MASTER_PASSWORD');
const unconfiguredPasswordResponse = sandbox.doPost({
  postData: { contents: JSON.stringify({ action: 'verify_password', password: 'anything' }) },
});
const unconfiguredPasswordPayload = JSON.parse(unconfiguredPasswordResponse.text);
assert.strictEqual(unconfiguredPasswordPayload.status, 'ERROR');
assert.match(unconfiguredPasswordPayload.message, /not configured/i);

console.log('PASS_ADMIN_DASHBOARD_CONTRACT');
