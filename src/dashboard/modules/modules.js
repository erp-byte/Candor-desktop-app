// ── Modules page logic ──
const { ipcRenderer } = require('electron');

// ── Back arrow ──
setupBackArrow(() => saveState());

// ── State persistence ──
function saveState() {
  const state = { searchQuery: document.getElementById('searchInput').value };
  localStorage.setItem('candor_state_modules', JSON.stringify(state));
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem('candor_state_modules'));
    if (!saved) return;
    if (saved.searchQuery) {
      document.getElementById('searchInput').value = saved.searchQuery;
      renderCards(saved.searchQuery.toLowerCase().trim());
    }
  } catch (_) {}
}

// ── Module data ──
const modules = [
  {
    id: 'purchase',
    title: 'Purchase',
    desc: 'Create and manage purchase orders, track approvals, and monitor vendor deliveries.',
    badge: 'Core',
    accent: 'var(--mod-blue)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    stat: '724 orders',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  },
  {
    id: 'sales',
    title: 'Sales & Orders',
    desc: 'Process orders, manage sales pipelines, and track revenue with real-time dashboards.',
    badge: 'Core',
    accent: 'var(--mod-emerald)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    stat: '189 orders',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
  },
  {
    id: 'production',
    title: 'Production',
    desc: 'Plan production schedules, manage work orders, and track manufacturing progress in real time.',
    badge: 'Core',
    accent: 'var(--mod-amber)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="M5 20V8l5 4V8l5 4V4l5 4v12"/></svg>',
    stat: '38 work orders',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
  },
  {
    id: 'finance',
    title: 'Finance & Billing',
    desc: 'Handle invoicing, expense tracking, tax management, and financial reporting.',
    badge: 'Premium',
    accent: 'var(--mod-rose)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    stat: '$124K revenue',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
  },
  {
    id: 'crm',
    title: 'Customer Relations',
    desc: 'Centralize customer data, track interactions, and manage support tickets.',
    badge: 'Core',
    accent: 'var(--mod-violet)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    stat: '1,890 contacts',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>'
  },
  {
    id: 'logistics',
    title: 'Logistics & Shipping',
    desc: 'Coordinate shipments, track deliveries, and optimize distribution routes.',
    badge: 'Add-on',
    accent: 'var(--mod-cyan)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    stat: '312 shipments',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
  },
  {
    id: 'hr',
    title: 'Human Resources',
    desc: 'Employee management, payroll processing, leave tracking, and performance reviews.',
    badge: 'Premium',
    accent: 'var(--mod-coral)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    stat: '48 employees',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>'
  },
  {
    id: 'quality',
    title: 'Quality Control',
    desc: 'Define inspection criteria, manage audits, and ensure compliance standards.',
    badge: 'Add-on',
    accent: 'var(--mod-teal)',
    icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    stat: '99.2% pass rate',
    statIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>'
  }
];

// ── Render cards ──
const grid = document.getElementById('moduleGrid');

function renderCards(filter = '') {
  const filtered = modules.filter(m =>
    m.title.toLowerCase().includes(filter) ||
    m.desc.toLowerCase().includes(filter) ||
    m.badge.toLowerCase().includes(filter)
  );

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="no-results">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p>No modules found matching your search</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map((mod, i) => `
    <div class="module-card"
         style="--card-accent: ${mod.accent}; animation-delay: ${0.08 + i * 0.06}s"
         data-id="${mod.id}">
      <div class="card-top">
        <div class="card-icon">${mod.icon}</div>
        <span class="card-badge">${mod.badge}</span>
      </div>
      <div class="card-title">${mod.title}</div>
      <div class="card-desc">${mod.desc}</div>
      <div class="card-footer">
        <span class="card-stat">${mod.statIcon} ${mod.stat}</span>
        <span class="card-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </span>
      </div>
    </div>
  `).join('');

  // Fix icon-bg
  grid.querySelectorAll('.module-card').forEach(card => {
    const accent = getComputedStyle(card).getPropertyValue('--card-accent').trim();
    const iconEl = card.querySelector('.card-icon');
    const badgeEl = card.querySelector('.card-badge');
    if (iconEl) iconEl.style.background = `color-mix(in srgb, ${accent} 12%, transparent)`;
    if (badgeEl) badgeEl.style.background = `color-mix(in srgb, ${accent} 10%, transparent)`;
  });
}

renderCards();

// ── Search ──
document.getElementById('searchInput').addEventListener('input', (e) => {
  renderCards(e.target.value.toLowerCase().trim());
});

// ── Logout ──
setupLogout('logoutBtn');

// ── Card click ──
grid.addEventListener('click', (e) => {
  const card = e.target.closest('.module-card');
  if (card) {
    const id = card.dataset.id;
    card.style.transform = 'scale(0.97)';
    setTimeout(() => { card.style.transform = ''; }, 200);
    if (id === 'production') {
      saveState();
      setTimeout(() => ipcRenderer.send('navigate-to-production', { from: 'modules' }), 250);
    }
  }
});

// ── Restore state on load ──
restoreState();
