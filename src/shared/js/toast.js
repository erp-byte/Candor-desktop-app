// ── Toast notifications ──
// Requires a toast element in the HTML:
//   <div class="toast" id="toast"><span id="toastIcon"></span><span id="toastMsg"></span></div>
// Exposes global showToast(message, type) function.

let _toastTimer;
function showToast(message, type = 'error') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  clearTimeout(_toastTimer);
  toast.className = `toast ${type}`;
  document.getElementById('toastMsg').textContent = message;
  document.getElementById('toastIcon').innerHTML = type === 'error'
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>';
  requestAnimationFrame(() => toast.classList.add('show'));
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
}
