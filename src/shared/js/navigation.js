// ── Navigation helpers ──
// Provides back-arrow setup, logout handler, and state persistence utilities.
// Exposes globals: PAGE_LABELS, setupBackArrow(), setupLogout(), clearAllPageStates(), getEnv()

const { ipcRenderer: _navIpc } = require('electron');

const PAGE_LABELS = {
  login: 'Login',
  modules: 'Modules',
  production: 'Production',
  'so-creation': 'SO Creation',
  'production-gst': 'GST Summary',
  'production-wo': 'Work Orders',
};

/**
 * Sets up the back-arrow button in the titlebar.
 * Call with a beforeNavigate callback to save state before going back.
 */
async function setupBackArrow(beforeNavigate) {
  const navInfo = await _navIpc.invoke('get-nav-info');
  if (navInfo.previous) {
    const backArrow = document.getElementById('backArrow');
    const backSep = document.getElementById('backSep');
    if (!backArrow) return navInfo;
    document.getElementById('backLabel').textContent = PAGE_LABELS[navInfo.previous] || 'Back';
    backArrow.classList.add('show');
    if (backSep) backSep.classList.add('show');
    backArrow.addEventListener('click', () => {
      if (beforeNavigate) beforeNavigate();
      _navIpc.send('navigate-back');
    });
  }
  return navInfo;
}

/**
 * Wires up one or more logout buttons by ID.
 * Clears all page states and navigates to login.
 */
function setupLogout(...buttonIds) {
  buttonIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        clearAllPageStates();
        _navIpc.send('navigate-to-login');
      });
    }
  });
}

function clearAllPageStates() {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('candor_state_')) localStorage.removeItem(k);
  });
}

/**
 * Fetches environment variables from the main process.
 * Returns an object with allowed env vars (API_BASE_URL, MOCK_AUTH_EMAIL, etc.)
 */
let _envCache = null;
async function getEnv() {
  if (!_envCache) {
    _envCache = await _navIpc.invoke('get-env');
  }
  return _envCache;
}
