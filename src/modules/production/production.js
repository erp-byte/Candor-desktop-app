// ── Production landing page logic ──
const { ipcRenderer } = require('electron');

// ── Back arrow + logout ──
setupBackArrow(() => saveState());
setupLogout('logoutBtn');

// ── State persistence ──
function saveState() {
  // Minimal state for landing page — nothing to save currently
  localStorage.setItem('candor_state_production_landing', JSON.stringify({ visited: true }));
}

// ── Sub-module definitions ──
const submodules = [
  {
    id: 'so-creation',
    title: 'SO Creation',
    desc: 'Create Sales Orders manually or upload a Sales Register Excel for bulk processing with GST reconciliation.',
    badge: 'Core',
    accent: 'var(--accent)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    stat: 'Manual & Excel',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    nav: 'navigate-to-so-creation',
  },
  {
    id: 'gst-summary',
    title: 'GST Summary',
    desc: 'View consolidated GST reconciliation summaries across all processed Sales Orders.',
    badge: 'Soon',
    accent: 'var(--clr-ok)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    stat: 'Coming soon',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    nav: null,
    disabled: true,
  },
  {
    id: 'work-orders',
    title: 'Work Orders',
    desc: 'Plan production schedules, manage work orders, and track manufacturing progress in real time.',
    badge: 'Soon',
    accent: 'var(--clr-warning)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    stat: 'Coming soon',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    nav: null,
    disabled: true,
  },
];

// ── Render cards ──
const grid = document.getElementById('submoduleGrid');

function renderCards() {
  grid.innerHTML = submodules.map((mod, i) => `
    <div class="submodule-card ${mod.disabled ? 'disabled' : ''}"
         style="--card-accent: ${mod.accent}; animation-delay: ${0.08 + i * 0.06}s"
         data-id="${mod.id}" ${mod.nav ? `data-nav="${mod.nav}"` : ''}>
      <div class="card-top">
        <div class="card-icon">${mod.icon}</div>
        <span class="card-badge">${mod.badge}</span>
      </div>
      <div class="card-title">${mod.title}</div>
      <div class="card-desc">${mod.desc}</div>
      <div class="card-footer">
        <span class="card-stat">${mod.statIcon} ${mod.stat}</span>
        ${!mod.disabled ? `
        <span class="card-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </span>` : ''}
      </div>
    </div>
  `).join('');

  // Apply accent-based backgrounds
  grid.querySelectorAll('.submodule-card').forEach(card => {
    const accent = getComputedStyle(card).getPropertyValue('--card-accent').trim();
    const iconEl = card.querySelector('.card-icon');
    const badgeEl = card.querySelector('.card-badge');
    if (iconEl) iconEl.style.background = `color-mix(in srgb, ${accent} 12%, transparent)`;
    if (badgeEl) badgeEl.style.background = `color-mix(in srgb, ${accent} 10%, transparent)`;
    if (badgeEl) badgeEl.style.color = accent;
  });
}

renderCards();

// ── Card click ──
grid.addEventListener('click', (e) => {
  const card = e.target.closest('.submodule-card');
  if (!card || card.classList.contains('disabled')) return;

  const nav = card.dataset.nav;
  if (!nav) return;

  card.style.transform = 'scale(0.97)';
  setTimeout(() => { card.style.transform = ''; }, 200);

  saveState();
  setTimeout(() => ipcRenderer.send(nav, { from: 'production' }), 250);
});

// ── Sidebar nav ──
document.getElementById('navBackModules').addEventListener('click', () => {
  saveState();
  ipcRenderer.send('navigate-to-modules', { from: 'production' });
});
