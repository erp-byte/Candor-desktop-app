// ── SO Creation page logic ──
const { ipcRenderer } = require('electron');

let API_BASE = 'http://127.0.0.1:8000';

// ── Back arrow + navigation ──
setupBackArrow();
setupLogout('logoutBtn');

document.getElementById('backToProduction').addEventListener('click', () => {
  ipcRenderer.send('navigate-to-production', { from: 'so-creation' });
});
document.getElementById('navBackModules').addEventListener('click', () => {
  ipcRenderer.send('navigate-to-modules', { from: 'so-creation' });
});

// ── Method selection ──
const methodSection = document.getElementById('methodSection');
const wizardSection = document.getElementById('wizardSection');
const uploadSection = document.getElementById('uploadSection');

document.getElementById('optCreateManually').addEventListener('click', () => {
  methodSection.style.display = 'none';
  uploadSection.classList.remove('show');
  wizardSection.style.display = 'block';
});

document.getElementById('optUploadExcel').addEventListener('click', () => {
  methodSection.style.display = 'none';
  wizardSection.style.display = 'none';
  uploadSection.classList.add('show');
});

// ── File upload ──
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const fileName = document.getElementById('fileName');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleUpload(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleUpload(fileInput.files[0]);
});

async function handleUpload(file) {
  if (!file.name.endsWith('.xlsx')) {
    showToast('Only Excel files (.xlsx) are accepted');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('File too large. Maximum 50 MB');
    return;
  }

  fileName.textContent = file.name;
  uploadProgress.classList.add('show');
  uploadZone.classList.add('uploading');

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/api/v1/so/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const uploadResult = await res.json();
    showToast(`Processed ${uploadResult.summary.total_sos} Sales Orders successfully`, 'success');

    // Collapse upload zone and refresh SO list from server
    uploadZone.style.padding = '20px 32px';
    uploadSection.style.marginBottom = '20px';
    soView.query.page = 1;
    await soView.fetchAndRender();
  } catch (err) {
    showToast(err.message || 'Failed to upload file');
  } finally {
    uploadProgress.classList.remove('show');
    uploadZone.classList.remove('uploading');
    fileInput.value = '';
  }
}

// ── Fetch and display existing SOs ──
const soLoader = document.getElementById('soLoader');

async function initAndLoad() {
  try {
    const env = await getEnv();
    if (env && env.API_BASE_URL) API_BASE = env.API_BASE_URL;
  } catch (_) {}
  soView.apiBase = API_BASE;
  soView.init();
  await refreshSOs();
}

async function refreshSOs() {
  soLoader.classList.remove('hidden');
  await soView.fetchAndRender();
  soLoader.classList.add('hidden');
}

initAndLoad();

// ── Step management ──
let currentStep = 1;
const steps = [
  document.getElementById('step1'),
  document.getElementById('step2'),
  document.getElementById('step3'),
];
const stepItems = document.querySelectorAll('.step-item');
const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';

function goToStep(n) {
  steps.forEach((s, i) => {
    s.style.display = i === n - 1 ? 'block' : 'none';
  });
  stepItems.forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 === n) el.classList.add('active');
    else if (i + 1 < n) {
      el.classList.add('done');
      el.querySelector('.step-num').innerHTML = checkSvg;
    } else {
      el.querySelector('.step-num').textContent = i + 1;
    }
  });
  currentStep = n;
  document.querySelector('.main-content').scrollTo({ top: 0, behavior: 'smooth' });
}

// Clickable step items (only go back to completed steps)
stepItems.forEach(el => {
  el.addEventListener('click', () => {
    const target = parseInt(el.dataset.step);
    if (target < currentStep) goToStep(target);
  });
});

// ── Step 1 → 2 ──
document.getElementById('toStep2').addEventListener('click', () => {
  if (!validateStep1()) return;
  goToStep(2);
  if (lines.length === 0) addLine();
});

// ── Step 2 → 3 ──
document.getElementById('toStep3').addEventListener('click', () => {
  if (lines.length === 0) {
    showToast('Add at least one line item');
    return;
  }
  if (!validateStep2()) return;
  renderReview();
  goToStep(3);
});

// ── Back buttons ──
document.getElementById('backToStep1').addEventListener('click', () => goToStep(1));
document.getElementById('backToStep2').addEventListener('click', () => goToStep(2));

// ── Validation ──
function validateStep1() {
  let valid = true;
  const required = ['soNumber', 'soDate', 'customerName', 'company'];
  required.forEach(id => {
    const el = document.getElementById(id);
    if (!el.value.trim()) {
      el.classList.add('has-error');
      valid = false;
    } else {
      el.classList.remove('has-error');
    }
  });
  if (!valid) showToast('Please fill in all required fields');
  return valid;
}

// Clear error on input
['soNumber', 'soDate', 'customerName', 'commonCustomerName', 'company', 'voucherType'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', function () {
    this.classList.remove('has-error');
  });
});

function validateStep2() {
  let valid = true;
  lines.forEach((line, i) => {
    if (!line.skuName.trim()) {
      const input = document.querySelector(`[data-line="${i}"][data-field="skuName"]`);
      if (input) input.style.borderColor = 'var(--clr-mismatch)';
      valid = false;
    }
  });
  if (!valid) showToast('SKU Name is required for all line items');
  return valid;
}

// ── Line items ──
let lines = [];

function addLine() {
  lines.push({
    skuName: '',
    category: '',
    uom: '',
    quantity: '',
    rate: '',
    gstPct: '',
  });
  renderLines();
}

function removeLine(idx) {
  lines.splice(idx, 1);
  renderLines();
}

function updateLine(idx, field, value) {
  lines[idx][field] = value;
  // Recompute amount and total cells
  const qty = parseFloat(lines[idx].quantity) || 0;
  const rate = parseFloat(lines[idx].rate) || 0;
  const gst = parseFloat(lines[idx].gstPct) || 0;
  const amount = qty * rate;
  const total = amount + amount * (gst / 100);
  const row = document.querySelector(`tr[data-row="${idx}"]`);
  if (row) {
    row.querySelector('.cell-amount').textContent = amount > 0 ? '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    row.querySelector('.cell-total').textContent = total > 0 ? '₹' + total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  }
}

function renderLines() {
  const body = document.getElementById('linesBody');
  const empty = document.getElementById('emptyLines');
  const table = document.getElementById('linesTable');

  if (lines.length === 0) {
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  table.style.display = 'table';
  empty.style.display = 'none';

  body.innerHTML = lines.map((l, i) => {
    const qty = parseFloat(l.quantity) || 0;
    const rate = parseFloat(l.rate) || 0;
    const gst = parseFloat(l.gstPct) || 0;
    const amount = qty * rate;
    const total = amount + amount * (gst / 100);
    const fmt = (n) => n > 0 ? '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    return `
      <tr data-row="${i}">
        <td class="line-num-cell">${i + 1}</td>
        <td><input class="line-input" data-line="${i}" data-field="skuName" value="${esc(l.skuName)}" placeholder="Article name" spellcheck="false" /></td>
        <td><input class="line-input" data-line="${i}" data-field="category" value="${esc(l.category)}" placeholder="Category" style="width:110px" spellcheck="false" /></td>
        <td><input class="line-input mono narrow" data-line="${i}" data-field="uom" value="${esc(l.uom)}" placeholder="Kg" spellcheck="false" /></td>
        <td><input class="line-input mono narrow" data-line="${i}" data-field="quantity" type="number" value="${l.quantity}" placeholder="0" min="0" step="any" /></td>
        <td><input class="line-input mono medium" data-line="${i}" data-field="rate" type="number" value="${l.rate}" placeholder="0.00" min="0" step="any" /></td>
        <td><input class="line-input mono narrow" data-line="${i}" data-field="gstPct" type="number" value="${l.gstPct}" placeholder="%" min="0" max="100" step="any" /></td>
        <td><div class="computed-value cell-amount">${fmt(amount)}</div></td>
        <td><div class="computed-value cell-total">${fmt(total)}</div></td>
        <td>
          <button class="remove-line-btn" data-remove="${i}" title="Remove line">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function esc(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

document.getElementById('addLineBtn').addEventListener('click', addLine);

// Delegate input and remove events
document.getElementById('linesContainer').addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.line != null && el.dataset.field) {
    updateLine(parseInt(el.dataset.line), el.dataset.field, el.value);
  }
});

document.getElementById('linesContainer').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove]');
  if (btn) removeLine(parseInt(btn.dataset.remove));
});

// ── Review ──
function getHeaderData() {
  return {
    soNumber: document.getElementById('soNumber').value.trim(),
    soDate: document.getElementById('soDate').value,
    customerName: document.getElementById('customerName').value.trim(),
    commonCustomerName: document.getElementById('commonCustomerName').value.trim(),
    company: document.getElementById('company').value.trim(),
    voucherType: document.getElementById('voucherType').value,
  };
}

function renderReview() {
  const h = getHeaderData();
  const fmtDate = h.soDate ? h.soDate.split('-').reverse().join('/') : '—';

  let totalAmount = 0;
  let totalGst = 0;
  const lineRows = lines.map((l, i) => {
    const qty = parseFloat(l.quantity) || 0;
    const rate = parseFloat(l.rate) || 0;
    const gst = parseFloat(l.gstPct) || 0;
    const amount = qty * rate;
    const gstAmt = amount * (gst / 100);
    totalAmount += amount;
    totalGst += gstAmt;
    const fmt = (n) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `
      <tr>
        <td class="mono" style="color:var(--text-muted)">${i + 1}</td>
        <td>${l.skuName || '—'}</td>
        <td>${l.category || '—'}</td>
        <td class="mono">${l.uom || '—'}</td>
        <td class="mono">${qty || '—'}</td>
        <td class="mono">${rate ? fmt(rate) : '—'}</td>
        <td class="mono">${gst ? gst + '%' : '—'}</td>
        <td class="mono">${amount ? fmt(amount) : '—'}</td>
        <td class="mono" style="font-weight:500">${fmt(amount + gstAmt)}</td>
      </tr>
    `;
  }).join('');

  const fmt = (n) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.getElementById('reviewContent').innerHTML = `
    <div class="review-card">
      <div class="review-header">
        <span class="review-header-title">SO Header</span>
        <span class="review-header-badge">${h.soNumber}</span>
      </div>
      <div class="review-grid">
        <div><div class="review-label">SO Number</div><div class="review-value mono accent">${h.soNumber}</div></div>
        <div><div class="review-label">SO Date</div><div class="review-value mono">${fmtDate}</div></div>
        <div><div class="review-label">Customer</div><div class="review-value">${h.customerName}</div></div>
        <div><div class="review-label">Common Name</div><div class="review-value">${h.commonCustomerName || '—'}</div></div>
        <div><div class="review-label">Company</div><div class="review-value">${h.company}</div></div>
        <div><div class="review-label">Voucher Type</div><div class="review-value">${h.voucherType || '—'}</div></div>
      </div>
    </div>

    <div class="review-card">
      <div class="review-header">
        <span class="review-header-title">Line Items</span>
        <span class="review-header-badge">${lines.length} line${lines.length !== 1 ? 's' : ''}</span>
      </div>
      <table class="review-lines-table">
        <thead>
          <tr>
            <th>#</th><th>SKU Name</th><th>Category</th><th>UOM</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th><th>Total</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>
    </div>

    <div class="review-card">
      <div class="review-header">
        <span class="review-header-title">Totals</span>
      </div>
      <div class="review-grid">
        <div><div class="review-label">Subtotal</div><div class="review-value mono">${fmt(totalAmount)}</div></div>
        <div><div class="review-label">GST Amount</div><div class="review-value mono">${fmt(totalGst)}</div></div>
        <div><div class="review-label">Grand Total</div><div class="review-value mono accent" style="font-size:16px">${fmt(totalAmount + totalGst)}</div></div>
        <div><div class="review-label">Total Lines</div><div class="review-value mono">${lines.length}</div></div>
      </div>
    </div>
  `;
}

// ── Submit ──
document.getElementById('submitSO').addEventListener('click', async () => {
  const btn = document.getElementById('submitSO');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const header = getHeaderData();
  const payload = {
    so_number: header.soNumber,
    so_date: header.soDate,
    customer_name: header.customerName,
    common_customer_name: header.commonCustomerName || null,
    company: header.company,
    voucher_type: header.voucherType || null,
    lines: lines.map((l, i) => ({
      line_number: i + 1,
      sku_name: l.skuName,
      item_category: l.category || null,
      uom: l.uom || null,
      quantity: parseFloat(l.quantity) || 0,
      rate_inr: parseFloat(l.rate) || 0,
      gst_rate: (parseFloat(l.gstPct) || 0) / 100,
    })),
  };

  try {
    const res = await fetch(`${API_BASE}/api/v1/so/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Submission failed' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    showToast(`Sales Order ${header.soNumber} created successfully`, 'success');

    // Reset wizard and show method selection with refreshed SO list
    setTimeout(() => {
      wizardSection.style.display = 'none';
      methodSection.style.display = '';
      goToStep(1);
      document.getElementById('loginForm')?.reset();
      lines = [];
      renderLines();
      refreshSOs();
      document.querySelector('.main-content').scrollTo({ top: 0, behavior: 'smooth' });
    }, 1000);
  } catch (err) {
    showToast(err.message || 'Failed to create Sales Order');
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      Submit Sales Order
    `;
  }
});
