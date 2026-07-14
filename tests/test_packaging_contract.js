const assert = require('assert');
const fs = require('fs');

const indexHtml = fs.readFileSync('src/frontend/index.html', 'utf8');
const loginHtml = fs.readFileSync('src/frontend/login.html', 'utf8');
const runner = fs.readFileSync('run_studio.py', 'utf8');
const backendConfig = fs.readFileSync('src/backend/config.py', 'utf8');
const spec = fs.readFileSync('packaging/asta_studio.spec', 'utf8');
const installer = fs.readFileSync('packaging/AstaStudio.iss', 'utf8');

assert(!/https?:\/\//.test(indexHtml), 'Production workspace still depends on a remote frontend asset');
assert(indexHtml.includes('vendor/xlsx.full.min.js'), 'Local SheetJS bundle is missing');
assert(indexHtml.indexOf('js/runtime_session.js') < indexHtml.indexOf('js/api.js'), 'Runtime session must load before API calls');
assert(loginHtml.includes('js/runtime_session.js'), 'Login does not load the runtime session');
assert(!runner.includes('core_router'), 'Legacy code-directory persistence API is still mounted');
assert(runner.includes('gui="edgechromium"'), 'Production runtime does not require WebView2');
assert(runner.includes('SingleInstanceGuard'), 'Single-instance guard is missing');
assert(backendConfig.includes('DEFAULT_MASTER_PASSWORD_HASH = ""'), 'Desktop build still has a built-in password');
assert(spec.includes('name="Asta Studio"'), 'PyInstaller product name is incorrect');
assert(spec.includes('src/frontend/vendor/xlsx.full.min.js'), 'Offline Excel parser is absent from the bundle');
assert(installer.includes('PrivilegesRequired=lowest'), 'Installer is not configured for per-user installation');
assert(installer.includes('Software\\Classes\\.asta'), 'Asta project file association is missing');
assert(installer.includes('MicrosoftEdgeWebview2Setup.exe'), 'WebView2 prerequisite is missing');

console.log('PASS_PACKAGING_CONTRACT');
