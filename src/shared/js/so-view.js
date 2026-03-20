// ── Shared SO View — server-side pagination/filtering/sorting ──
// Every user interaction builds query params and fetches from GET /api/v1/so/view.
// Exposes global: soView

const soView = {
  // ── Server query state ──
  query: {
    page: 1,
    page_size: 50,
    search: '',
    status: '',           // '' | 'ok' | 'mismatch' | 'warning'
    sort_by: 'so_date',
    sort_order: 'asc',
    date_from: '',
    date_to: '',
    // SO-level filters
    company: '',
    voucher_type: '',
    customer_name: '',
    common_customer_name: '',
    // Line-level filters
    item_category: '',
    sub_category: '',
    uom: '',
    grp_code: '',
    rate_type: '',
    item_type: '',
    sales_group: '',
    match_source: '',
    line_status: '',
  },

  // ── Response from server ──
  response: null, // { page, page_size, total, total_pages, summary, filter_options, sales_orders }

  // ── UI state ──
  apiBase: 'http://127.0.0.1:8000',
  expandedSOs: new Set(),
  advFilters: {},         // { fieldKey: Set of selected values }
  loading: false,
  _fetchController: null,
  _debounceTimer: null,
  _advPanelBuilt: false,

  // ── DOM refs ──
  els: {},

  // ── Advanced filter field definitions ──
  advFields: [
    // SO-level
    { key: 'company',              label: 'Company',        optionKey: 'companies' },
    { key: 'customer_name',        label: 'Customer',       optionKey: 'customer_names' },
    { key: 'common_customer_name', label: 'Common Name',    optionKey: 'common_customer_names' },
    { key: 'voucher_type',         label: 'Voucher Type',   optionKey: 'voucher_types' },
    // Line-level
    { key: 'item_category',        label: 'Item Category',  optionKey: 'item_categories' },
    { key: 'sub_category',         label: 'Sub Category',   optionKey: 'sub_categories' },
    { key: 'uom',                  label: 'UOM',            optionKey: 'uoms' },
    { key: 'grp_code',             label: 'GRP Code',       optionKey: 'grp_codes' },
    { key: 'rate_type',            label: 'Rate Type',      optionKey: 'rate_types' },
    { key: 'item_type',            label: 'Item Type',      optionKey: 'item_types' },
    { key: 'sales_group',          label: 'Sales Group',    optionKey: 'sales_groups' },
    { key: 'match_source',         label: 'Match Source',   optionKey: 'match_sources' },
    { key: 'line_status',          label: 'Line Status',    optionKey: 'statuses' },
  ],

  // ── Init ──
  init(overrides) {
    Object.assign(this, overrides || {});
    this.els = {
      summarySection: document.getElementById('summarySection'),
      toolbar: document.getElementById('toolbar'),
      soTableSection: document.getElementById('soTableSection'),
      soTableBody: document.getElementById('soTableBody'),
      pagination: document.getElementById('pagination'),
      emptyState: document.getElementById('emptyState'),
      advPanel: document.getElementById('advFilterPanel'),
      advToggle: document.getElementById('advFilterToggle'),
      tableLoading: document.getElementById('soTableLoading'),
      dateToggle: document.getElementById('dateFilterToggle'),
      datePanel: document.getElementById('dateFilterPanel'),
    };
    this.bindFilters();
    this.bindSearch();
    this.bindExpand();
    this.bindAdvancedFilter();
    this.bindSort();
    this.bindDateFilter();
    this.bindExport();
  },

  // ══════════════════════════════════════════
  //  CORE: fetch from server and render
  // ══════════════════════════════════════════

  async fetchAndRender() {
    // Abort any in-flight request
    if (this._fetchController) this._fetchController.abort();
    this._fetchController = new AbortController();

    this.setLoading(true);
    this.syncAdvFiltersToQuery();

    // Build URL with non-empty params
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(this.query)) {
      if (v !== '' && v != null) params.set(k, v);
    }
    const url = `${this.apiBase}/api/v1/so/view?${params.toString()}`;

    try {
      const res = await fetch(url, { signal: this._fetchController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.response = await res.json();
      this.renderFromResponse();
    } catch (err) {
      if (err.name === 'AbortError') return; // superseded by newer request
      console.error('[soView] Fetch error:', err.message);
    } finally {
      this.setLoading(false);
    }
  },

  setLoading(on) {
    this.loading = on;
    if (this.els.tableLoading) {
      this.els.tableLoading.classList.toggle('show', on);
    }
  },

  // Serialize advFilters Sets → comma-separated query strings
  syncAdvFiltersToQuery() {
    for (const field of this.advFields) {
      const selected = this.advFilters[field.key];
      this.query[field.key] = (selected && selected.size > 0)
        ? Array.from(selected).join(',')
        : '';
    }
  },

  // ══════════════════════════════════════════
  //  RENDER from server response
  // ══════════════════════════════════════════

  renderFromResponse() {
    if (!this.response) return;
    const r = this.response;
    const s = r.summary;

    // Summary cards
    document.getElementById('sumTotalSOs').textContent = s.total_sos.toLocaleString();
    document.getElementById('sumTotalLines').textContent = s.total_lines.toLocaleString();
    document.getElementById('sumGstOk').textContent = s.gst_ok.toLocaleString();
    document.getElementById('sumGstMismatch').textContent = s.gst_mismatch.toLocaleString();
    document.getElementById('sumGstWarning').textContent = s.gst_warning.toLocaleString();
    document.getElementById('sumUnmatched').textContent = s.unmatched_lines.toLocaleString();

    // Filter count badges (SO-level counts)
    document.getElementById('fcOk').textContent = s.so_ok || 0;
    document.getElementById('fcMismatch').textContent = s.so_mismatch || 0;
    document.getElementById('fcWarning').textContent = s.so_warning || 0;

    // Show sections
    this.els.summarySection.classList.add('show');
    this.els.toolbar.classList.add('show');

    // Build advanced filter panel once (from filter_options which never changes)
    if (!this._advPanelBuilt && r.filter_options) {
      this.buildAdvPanel(r.filter_options);
      this._advPanelBuilt = true;
    }

    // Table rows — response.sales_orders is already the correct page
    this.renderTable(r.sales_orders, r.total, r.total_pages);

    // Sort indicators
    this.updateSortIndicators();
  },

  // ── Render table from page data ──
  renderTable(salesOrders, total, totalPages) {
    const sos = salesOrders || [];

    this.els.emptyState.classList.toggle('show', sos.length === 0);
    this.els.soTableSection.style.display = sos.length === 0 ? 'none' : 'block';

    if (sos.length > 0) this.els.soTableSection.classList.add('show');

    this.els.soTableBody.innerHTML = sos.map(so => {
      const isExpanded = this.expandedSOs.has(so.so_id);
      return `
        <tr class="so-row ${isExpanded ? 'expanded' : ''}" data-so-id="${so.so_id}">
          <td><span class="expand-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></span></td>
          <td><span class="so-number">${so.so_number}</span></td>
          <td><span class="so-date">${this.fmtDate(so.so_date)}</span></td>
          <td><span class="so-customer" title="${so.customer_name}">${so.common_customer_name || so.customer_name}</span></td>
          <td><span class="so-company">${so.company || '—'}</span></td>
          <td><span class="line-mono">${so.total_lines}</span></td>
          <td>
            <div class="status-badges">
              ${so.gst_ok ? `<span class="badge ok">${so.gst_ok} OK</span>` : ''}
              ${so.gst_mismatch ? `<span class="badge mismatch">${so.gst_mismatch} Err</span>` : ''}
              ${so.gst_warning ? `<span class="badge warning">${so.gst_warning} Warn</span>` : ''}
            </div>
          </td>
        </tr>
        <tr class="line-detail-row ${isExpanded ? 'show' : ''}" data-detail-for="${so.so_id}">
          <td colspan="7" class="line-detail-cell">${isExpanded ? this.renderLineDetails(so) : ''}</td>
        </tr>`;
    }).join('');

    this.renderPagination(total || 0, totalPages || 1);
  },

  // ══════════════════════════════════════════
  //  INTERACTION BINDINGS
  // ══════════════════════════════════════════

  // ── Status filter buttons ──
  bindFilters() {
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        this.query.status = (f === 'all') ? '' : f;
        this.query.page = 1;
        this.expandedSOs.clear();
        this.fetchAndRender();
      });
    });
    document.getElementById('filterAll')?.classList.add('active');
  },

  // ── Search (debounced) ──
  bindSearch() {
    const input = document.getElementById('soSearch');
    if (!input) return;
    input.addEventListener('input', (e) => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this.query.search = e.target.value.trim();
        this.query.page = 1;
        this.expandedSOs.clear();
        this.fetchAndRender();
      }, 300);
    });
  },

  // ── Expand/collapse SO rows ──
  bindExpand() {
    this.els.soTableBody.addEventListener('click', (e) => {
      const row = e.target.closest('.so-row');
      if (!row) return;
      if (e.target.closest('.line-card-header') || e.target.closest('.line-card-body')) return;
      const soId = parseInt(row.dataset.soId);
      const detailRow = document.querySelector(`[data-detail-for="${soId}"]`);
      if (!detailRow) return;
      if (this.expandedSOs.has(soId)) {
        this.expandedSOs.delete(soId);
        row.classList.remove('expanded');
        detailRow.classList.remove('show');
        detailRow.querySelector('.line-detail-cell').innerHTML = '';
      } else {
        this.expandedSOs.add(soId);
        row.classList.add('expanded');
        const so = this.response.sales_orders.find(s => s.so_id === soId);
        if (so) detailRow.querySelector('.line-detail-cell').innerHTML = this.renderLineDetails(so);
        detailRow.classList.add('show');
      }
    });
  },

  // ── Sortable column headers ──
  bindSort() {
    const thead = document.querySelector('.so-table thead');
    if (!thead) return;
    thead.addEventListener('click', (e) => {
      const th = e.target.closest('[data-sort]');
      if (!th) return;
      const field = th.dataset.sort;
      if (this.query.sort_by === field) {
        this.query.sort_order = this.query.sort_order === 'asc' ? 'desc' : 'asc';
      } else {
        this.query.sort_by = field;
        this.query.sort_order = 'asc';
      }
      this.query.page = 1;
      this.expandedSOs.clear();
      this.fetchAndRender();
    });
  },

  updateSortIndicators() {
    document.querySelectorAll('.so-table th[data-sort]').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      const isActive = th.dataset.sort === this.query.sort_by;
      th.classList.toggle('active', isActive);
      icon.className = 'sort-icon' + (isActive ? ` ${this.query.sort_order}` : '');
    });
  },

  // ── Date range filter ──
  bindDateFilter() {
    const toggle = this.els.dateToggle;
    const panel = this.els.datePanel;
    if (!toggle || !panel) return;

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close advanced panel if open
      if (this.els.advPanel) this.els.advPanel.classList.remove('show');
      const open = panel.classList.toggle('show');
      toggle.classList.toggle('active', open || this.query.date_from || this.query.date_to);
    });

    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== toggle) {
        panel.classList.remove('show');
        if (!this.query.date_from && !this.query.date_to) toggle.classList.remove('active');
      }
    });

    // Apply button
    panel.addEventListener('click', (e) => {
      if (e.target.closest('.date-filter-apply')) {
        const from = document.getElementById('dateFrom').value;
        const to = document.getElementById('dateTo').value;
        this.query.date_from = from || '';
        this.query.date_to = to || '';
        this.query.page = 1;
        this.expandedSOs.clear();
        this._updateDateLabel();
        panel.classList.remove('show');
        this.fetchAndRender();
      }
      if (e.target.closest('.date-filter-clear')) {
        document.getElementById('dateFrom').value = '';
        document.getElementById('dateTo').value = '';
        this.query.date_from = '';
        this.query.date_to = '';
        this.query.page = 1;
        this.expandedSOs.clear();
        this._updateDateLabel();
        panel.classList.remove('show');
        this.fetchAndRender();
      }
    });

    // Stop clicks inside panel from closing it
    panel.addEventListener('click', (e) => e.stopPropagation());
  },

  _updateDateLabel() {
    const toggle = this.els.dateToggle;
    if (!toggle) return;
    const from = this.query.date_from;
    const to = this.query.date_to;
    const hasDate = from || to;
    toggle.classList.toggle('active', !!hasDate);
    const label = toggle.querySelector('.date-btn-label');
    if (label) {
      if (from && to) label.textContent = `${this.fmtDate(from)} – ${this.fmtDate(to)}`;
      else if (from) label.textContent = `From ${this.fmtDate(from)}`;
      else if (to) label.textContent = `Until ${this.fmtDate(to)}`;
      else label.textContent = 'Date';
    }
  },

  // ── Export ──
  // All available CSV columns
  _exportColumns: [
    { key: 'so_number',          label: 'SO Number',      get: (so, l, g) => so.so_number },
    { key: 'so_date',            label: 'Date',            get: (so, l, g) => so.so_date },
    { key: 'customer_name',      label: 'Customer',        get: (so, l, g) => so.customer_name },
    { key: 'common_customer_name', label: 'Common Name',   get: (so, l, g) => so.common_customer_name },
    { key: 'company',            label: 'Company',          get: (so, l, g) => so.company },
    { key: 'voucher_type',       label: 'Voucher Type',     get: (so, l, g) => so.voucher_type },
    { key: 'total_lines',        label: 'Total Lines',      get: (so, l, g) => so.total_lines },
    { key: 'gst_ok',             label: 'GST OK',           get: (so, l, g) => so.gst_ok },
    { key: 'gst_mismatch',       label: 'GST Mismatch',     get: (so, l, g) => so.gst_mismatch },
    { key: 'gst_warning',        label: 'GST Warning',      get: (so, l, g) => so.gst_warning },
    { key: 'line_number',        label: 'Line #',           get: (so, l, g) => l ? l.line_number : '' },
    { key: 'sku_name',           label: 'SKU Name',         get: (so, l, g) => l ? l.sku_name : '' },
    { key: 'item_category',      label: 'Category',         get: (so, l, g) => l ? l.item_category : '' },
    { key: 'sub_category',       label: 'Sub Category',     get: (so, l, g) => l ? l.sub_category : '' },
    { key: 'uom',                label: 'UOM',              get: (so, l, g) => l ? l.uom : '' },
    { key: 'quantity',           label: 'Qty',              get: (so, l, g) => l ? l.quantity : '' },
    { key: 'rate_inr',           label: 'Rate',             get: (so, l, g) => l ? l.rate_inr : '' },
    { key: 'amount_inr',         label: 'Amount',           get: (so, l, g) => l ? l.amount_inr : '' },
    { key: 'igst_amount',        label: 'IGST',             get: (so, l, g) => l ? l.igst_amount : '' },
    { key: 'sgst_amount',        label: 'SGST',             get: (so, l, g) => l ? l.sgst_amount : '' },
    { key: 'cgst_amount',        label: 'CGST',             get: (so, l, g) => l ? l.cgst_amount : '' },
    { key: 'total_amount_inr',   label: 'Total',            get: (so, l, g) => l ? l.total_amount_inr : '' },
    { key: 'item_type',          label: 'Item Type',         get: (so, l, g) => l ? l.item_type : '' },
    { key: 'gst_status',         label: 'GST Status',        get: (so, l, g) => g ? g.status : '' },
  ],
  _selectedExportCols: null, // Set of keys; null = all

  bindExport() {
    const toggle = document.getElementById('exportToggle');
    const panel = document.getElementById('exportPanel');
    if (!toggle || !panel) return;

    // Toggle dropdown
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('show');
      toggle.classList.toggle('active', panel.classList.contains('show'));
    });
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== toggle) {
        panel.classList.remove('show');
        toggle.classList.remove('active');
      }
    });
    panel.addEventListener('click', (e) => e.stopPropagation());

    // Direct export
    document.getElementById('exportDirect')?.addEventListener('click', () => {
      this._selectedExportCols = null;
      panel.classList.remove('show');
      toggle.classList.remove('active');
      this._fetchAndExport();
    });

    // Selective toggle
    const colSection = document.getElementById('exportColumns');
    document.getElementById('exportSelectiveToggle')?.addEventListener('click', () => {
      const visible = colSection.style.display !== 'none';
      colSection.style.display = visible ? 'none' : 'block';
      if (!visible) this._buildColumnList();
    });

    // Column search
    document.getElementById('exportColSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.export-col-item').forEach(item => {
        item.style.display = (item.dataset.label || '').includes(q) ? '' : 'none';
      });
    });

    // Toggle all
    document.getElementById('exportToggleAll')?.addEventListener('click', () => {
      const items = document.querySelectorAll('.export-col-item');
      const allChecked = Array.from(items).every(i => i.classList.contains('checked'));
      items.forEach(i => i.classList.toggle('checked', !allChecked));
    });

    // Column click (delegate)
    document.getElementById('exportColList')?.addEventListener('click', (e) => {
      const item = e.target.closest('.export-col-item');
      if (item) item.classList.toggle('checked');
    });

    // Selective download
    document.getElementById('exportSelectiveDownload')?.addEventListener('click', () => {
      const checked = document.querySelectorAll('.export-col-item.checked');
      if (checked.length === 0) { showToast('Select at least one column'); return; }
      this._selectedExportCols = new Set(Array.from(checked).map(i => i.dataset.key));
      panel.classList.remove('show');
      toggle.classList.remove('active');
      this._fetchAndExport();
    });
  },

  _buildColumnList() {
    const list = document.getElementById('exportColList');
    if (!list) return;
    const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
    list.innerHTML = this._exportColumns.map(col => `
      <div class="export-col-item checked" data-key="${col.key}" data-label="${col.label.toLowerCase()}">
        <span class="export-col-check">${checkSvg}</span>
        ${col.label}
      </div>
    `).join('');
    document.getElementById('exportColSearch').value = '';
  },

  async _fetchAndExport() {
    const toggle = document.getElementById('exportToggle');
    toggle.disabled = true;
    const origHTML = toggle.innerHTML;
    toggle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exporting…';

    this.syncAdvFiltersToQuery();
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(this.query)) {
      if (k === 'page' || k === 'page_size') continue;
      if (v !== '' && v != null) params.set(k, v);
    }

    try {
      const res = await fetch(`${this.apiBase}/api/v1/so/export?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.sales_orders || data.sales_orders.length === 0) {
        showToast('No data to export'); return;
      }

      const cols = this._selectedExportCols
        ? this._exportColumns.filter(c => this._selectedExportCols.has(c.key))
        : this._exportColumns;

      await this._buildAndDownloadExcel(data.sales_orders, data.total, cols);
    } catch (err) {
      showToast(err.message || 'Export failed');
    } finally {
      toggle.disabled = false;
      toggle.innerHTML = origHTML;
    }
  },

  async _buildAndDownloadExcel(salesOrders, total, cols) {
    const XLSX = require('xlsx-js-style');

    // Styles
    const headerStyle = {
      fill: { fgColor: { rgb: '1A1A25' } },
      font: { bold: true, color: { rgb: 'C8AA6E' }, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '3A3A4A' } } },
    };
    const cellStyle = {
      alignment: { horizontal: 'center', vertical: 'center' },
      font: { sz: 10 },
    };
    const altRowStyle = {
      alignment: { horizontal: 'center', vertical: 'center' },
      font: { sz: 10 },
      fill: { fgColor: { rgb: 'F2F2F2' } },
    };
    const mismatchStyle = {
      alignment: { horizontal: 'center', vertical: 'center' },
      font: { sz: 10, bold: true, color: { rgb: 'CC0000' } },
      fill: { fgColor: { rgb: 'FFE0E0' } },
    };
    const warningStyle = {
      alignment: { horizontal: 'center', vertical: 'center' },
      font: { sz: 10, bold: true, color: { rgb: 'B8860B' } },
      fill: { fgColor: { rgb: 'FFF8E0' } },
    };

    const soNumColIdx = cols.findIndex(c => c.key === 'so_number');
    const data = [];

    // Header
    data.push(cols.map(c => ({ v: c.label, s: headerStyle })));

    // Data rows
    let rowIdx = 0;
    for (const so of salesOrders) {
      let soStatus = 'ok';
      if (so.gst_mismatch > 0) soStatus = 'mismatch';
      else if (so.gst_warning > 0) soStatus = 'warning';

      const addRow = (line, gst) => {
        const baseStyle = (rowIdx % 2 === 1) ? altRowStyle : cellStyle;
        const row = cols.map((c, ci) => {
          const v = c.get(so, line, gst);
          let s = baseStyle;
          // SO Number cell — color by status
          if (ci === soNumColIdx && soStatus === 'mismatch') s = mismatchStyle;
          else if (ci === soNumColIdx && soStatus === 'warning') s = warningStyle;
          return { v: v != null ? v : '', s };
        });
        data.push(row);
        rowIdx++;
      };

      if (!so.lines || so.lines.length === 0) {
        addRow(null, null);
      } else {
        for (const entry of so.lines) {
          addRow(entry.line, entry.gst_recon);
        }
      }
    }

    // Build worksheet from array of arrays
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Column widths
    ws['!cols'] = cols.map((c, i) => {
      let maxLen = c.label.length;
      for (const row of data) {
        if (row[i]) {
          const len = String(row[i].v || '').length;
          if (len > maxLen) maxLen = len;
        }
      }
      return { wch: Math.min(maxLen + 4, 40) };
    });

    // Freeze header row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    // Auto-filter
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }) };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Orders');

    // Write to buffer and trigger browser download
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `so-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${total} Sales Orders`, 'success');
  },

  // ── Advanced filter ──
  bindAdvancedFilter() {
    const toggle = this.els.advToggle;
    const panel = this.els.advPanel;
    if (!toggle || !panel) return;

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = panel.classList.toggle('show');
      toggle.classList.toggle('active', open || this._hasActiveAdvFilters());
    });

    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== toggle) {
        panel.classList.remove('show');
        if (!this._hasActiveAdvFilters()) toggle.classList.remove('active');
      }
    });

    panel.addEventListener('click', (e) => {
      const chip = e.target.closest('.adv-filter-chip');
      if (chip) {
        const field = chip.dataset.field;
        const value = chip.dataset.value;
        if (!this.advFilters[field]) this.advFilters[field] = new Set();
        if (chip.classList.contains('checked')) {
          chip.classList.remove('checked');
          this.advFilters[field].delete(value);
          if (this.advFilters[field].size === 0) delete this.advFilters[field];
        } else {
          chip.classList.add('checked');
          this.advFilters[field].add(value);
        }
        this.updateAdvCount();
        this.query.page = 1;
        this.expandedSOs.clear();
        this.fetchAndRender();
        return;
      }
      if (e.target.closest('.adv-filter-clear')) {
        this.advFilters = {};
        panel.querySelectorAll('.adv-filter-chip.checked').forEach(c => c.classList.remove('checked'));
        this.updateAdvCount();
        this.query.page = 1;
        this.expandedSOs.clear();
        this.fetchAndRender();
      }
    });
  },

  buildAdvPanel(filterOptions) {
    const panel = this.els.advPanel;
    if (!panel || !filterOptions) return;

    const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';

    // Search bar at the top
    let html = `<div class="adv-filter-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="advFilterSearch" placeholder="Search filters..." spellcheck="false" />
    </div>`;

    for (const field of this.advFields) {
      const values = (filterOptions[field.optionKey] || []).filter(Boolean).sort();
      if (values.length === 0) continue;
      const selected = this.advFilters[field.key] || new Set();
      html += `<div class="adv-filter-section" data-section-label="${field.label.toLowerCase()}">
        <div class="adv-filter-section-title">${field.label}</div>
        <div class="adv-filter-options">
          ${values.map(v => `
            <label class="adv-filter-chip ${selected.has(v) ? 'checked' : ''}" data-field="${field.key}" data-value="${v.replace(/"/g, '&quot;')}" data-search-text="${v.toLowerCase()}">
              <span class="adv-chip-box">${checkSvg}</span>
              ${v}
            </label>`).join('')}
        </div>
      </div>`;
    }

    const count = this._countAdvFilters();
    html += `<div class="adv-filter-footer">
      <span class="adv-filter-count" id="advFilterCount">${count > 0 ? count + ' filter' + (count !== 1 ? 's' : '') + ' active' : 'No filters active'}</span>
      <button class="adv-filter-clear">Clear All</button>
    </div>`;

    panel.innerHTML = html;

    // Bind search within the panel
    const searchInput = document.getElementById('advFilterSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        panel.querySelectorAll('.adv-filter-section').forEach(section => {
          const chips = section.querySelectorAll('.adv-filter-chip');
          let sectionHasMatch = false;
          chips.forEach(chip => {
            const text = chip.dataset.searchText || '';
            const match = !q || text.includes(q) || (section.dataset.sectionLabel || '').includes(q);
            chip.style.display = match ? '' : 'none';
            if (match) sectionHasMatch = true;
          });
          section.style.display = sectionHasMatch ? '' : 'none';
        });
      });
      // Stop click from closing panel
      searchInput.addEventListener('click', (e) => e.stopPropagation());
    }
  },

  _hasActiveAdvFilters() {
    return this._countAdvFilters() > 0;
  },

  _countAdvFilters() {
    return Object.values(this.advFilters).reduce((n, s) => n + s.size, 0);
  },

  updateAdvCount() {
    const count = this._countAdvFilters();
    const el = document.getElementById('advFilterCount');
    if (el) el.textContent = count > 0 ? count + ' filter' + (count !== 1 ? 's' : '') + ' active' : 'No filters active';
    if (this.els.advToggle) this.els.advToggle.classList.toggle('active', count > 0);
  },

  // ── Pagination ──
  renderPagination(total, totalPages) {
    const pagInfo = document.getElementById('pagInfo');
    const pagBtns = document.getElementById('pagBtns');
    if (total === 0 || totalPages <= 1) { this.els.pagination.classList.remove('show'); return; }

    this.els.pagination.classList.add('show');
    const page = this.query.page;
    const ps = this.query.page_size;
    const s = (page - 1) * ps + 1;
    const e = Math.min(page * ps, total);
    pagInfo.textContent = `Showing ${s}–${e} of ${total} SOs`;

    let btns = `<button class="page-btn" ${page===1?'disabled':''} data-page="${page-1}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>`;
    const max=7; let sp=Math.max(1,page-3), ep=Math.min(totalPages,sp+max-1); if(ep-sp<max-1) sp=Math.max(1,ep-max+1);
    for(let i=sp;i<=ep;i++) btns+=`<button class="page-btn ${i===page?'active':''}" data-page="${i}">${i}</button>`;
    btns+=`<button class="page-btn" ${page===totalPages?'disabled':''} data-page="${page+1}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>`;

    pagBtns.innerHTML = btns;
    pagBtns.querySelectorAll('.page-btn').forEach(b => {
      b.addEventListener('click', () => {
        const p = parseInt(b.dataset.page);
        if (p >= 1 && p <= totalPages && p !== page) {
          this.query.page = p;
          this.expandedSOs.clear();
          this.fetchAndRender();
          document.querySelector('.main-content').scrollTo({ top: document.getElementById('toolbar').offsetTop - 60, behavior: 'smooth' });
        }
      });
    });
  },

  // ══════════════════════════════════════════
  //  FORMATTERS (unchanged)
  // ══════════════════════════════════════════

  fmtDate(d) {
    if (!d) return '—';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : d;
  },
  fmtCur(n) {
    if (n == null) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  fmtPct(n) { return n == null ? '—' : (n * 100).toFixed(1) + '%'; },
  fmtRate(n) { return n == null ? '—' : n.toFixed(1) + '%'; },
  val(v, fmt) {
    if (v == null || v === '') return '<span class="null-val">null</span>';
    if (fmt === 'currency') return this.fmtCur(v);
    if (fmt === 'pct') return this.fmtPct(v);
    if (fmt === 'date') return this.fmtDate(v);
    if (fmt === 'bool') return v ? 'Yes' : 'No';
    if (fmt === 'num') return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
    return String(v);
  },
  matchInfo(score) {
    if (score == null) return { cls: '', label: 'No match', color: 'highlight-mismatch' };
    if (score >= 1.0) return { cls: 'exact', label: 'Exact', color: 'highlight-ok' };
    if (score >= 0.85) return { cls: 'partial', label: 'Partial', color: 'highlight-warning' };
    return { cls: 'low', label: 'Low', color: 'highlight-mismatch' };
  },

  // ══════════════════════════════════════════
  //  LINE DETAIL RENDERING (unchanged)
  // ══════════════════════════════════════════

  _iconCheck: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
  _iconX: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  _iconWarn: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',

  checkIcon(pass, warn) {
    if (pass) return `<span class="gst-check-icon pass">${this._iconCheck}</span>`;
    if (warn) return `<span class="gst-check-icon warn">${this._iconWarn}</span>`;
    return `<span class="gst-check-icon fail">${this._iconX}</span>`;
  },

  renderLineDetails(so) {
    if (!so.lines || so.lines.length === 0) return '<div class="line-detail-inner"><p style="color:var(--text-muted);font-size:13px">No line items</p></div>';

    const hdr = `<div class="so-header-info">
      <div class="so-info-item"><div class="so-info-label">SO ID</div><div class="so-info-value mono">${so.so_id}</div></div>
      <div class="so-info-item"><div class="so-info-label">SO Number</div><div class="so-info-value mono accent">${so.so_number}</div></div>
      <div class="so-info-item"><div class="so-info-label">SO Date</div><div class="so-info-value mono">${this.val(so.so_date,'date')}</div></div>
      <div class="so-info-item"><div class="so-info-label">Customer Name</div><div class="so-info-value">${so.customer_name||'—'}</div></div>
      <div class="so-info-item"><div class="so-info-label">Common Customer</div><div class="so-info-value">${so.common_customer_name||'—'}</div></div>
      <div class="so-info-item"><div class="so-info-label">Company</div><div class="so-info-value mono">${so.company||'—'}</div></div>
      <div class="so-info-item"><div class="so-info-label">Voucher Type</div><div class="so-info-value">${so.voucher_type||'—'}</div></div>
      <div class="so-info-item"><div class="so-info-label">Total Lines</div><div class="so-info-value mono">${so.total_lines}</div></div>
      <div class="so-info-item"><div class="so-info-label">GST OK</div><div class="so-info-value mono highlight-ok">${so.gst_ok||0}</div></div>
      <div class="so-info-item"><div class="so-info-label">GST Mismatch</div><div class="so-info-value mono ${so.gst_mismatch?'highlight-mismatch':''}">${so.gst_mismatch||0}</div></div>
      <div class="so-info-item"><div class="so-info-label">GST Warning</div><div class="so-info-value mono ${so.gst_warning?'highlight-warning':''}">${so.gst_warning||0}</div></div>
    </div>`;

    const cards = so.lines.map((entry, idx) => {
      const l = entry.line, g = entry.gst_recon;
      const gs = g ? g.status : 'ok';
      const mi = this.matchInfo(l.match_score);
      return `<div class="line-card" data-line-idx="${idx}">
        <div class="line-card-header" onclick="this.parentElement.classList.toggle('open')">
          <div class="line-card-left"><span class="line-num">${l.line_number}</span><span class="line-card-sku" title="${l.sku_name||''}">${l.sku_name||'Unnamed Article'}</span></div>
          <div class="line-card-right">
            <span class="line-card-amount">${this.fmtCur(l.total_amount_inr)}</span>
            <div class="gst-status ${gs}"><span class="gst-dot ${gs}"></span>${gs==='ok'?'OK':gs==='mismatch'?'Mismatch':'Warning'}</div>
            <span class="line-expand-arrow"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></span>
          </div>
        </div>
        <div class="line-card-body">
          ${this._renderLineSection(l)}
          ${this._renderPricingSection(l)}
          ${this._renderMatchSection(l, mi)}
          ${g ? this._renderGstSection(l, g) : this._renderNoGst()}
        </div>
      </div>`;
    }).join('');

    return `<div class="line-detail-inner">${hdr}${cards}</div>`;
  },

  _renderLineSection(l) {
    return `<div class="detail-section">
      <div class="detail-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Line Item Details</div>
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">SO Line ID</div><div class="detail-value mono">${l.so_line_id}</div></div>
        <div class="detail-field"><div class="detail-label">Line Number</div><div class="detail-value mono">${l.line_number}</div></div>
        <div class="detail-field"><div class="detail-label">SKU Name</div><div class="detail-value" title="${l.sku_name||''}">${this.val(l.sku_name)}</div></div>
        <div class="detail-field"><div class="detail-label">Item Category</div><div class="detail-value">${this.val(l.item_category)}</div></div>
        <div class="detail-field"><div class="detail-label">Sub Category</div><div class="detail-value">${this.val(l.sub_category)}</div></div>
        <div class="detail-field"><div class="detail-label">UOM</div><div class="detail-value mono">${this.val(l.uom)}</div></div>
        <div class="detail-field"><div class="detail-label">GRP Code</div><div class="detail-value">${this.val(l.grp_code)}</div></div>
        <div class="detail-field"><div class="detail-label">Status</div><div class="detail-value">${this.val(l.status)}</div></div>
      </div></div>`;
  },

  _renderPricingSection(l) {
    return `<div class="detail-section">
      <div class="detail-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Quantity & Pricing</div>
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">Quantity</div><div class="detail-value mono">${this.val(l.quantity,'num')}</div></div>
        <div class="detail-field"><div class="detail-label">Quantity Units</div><div class="detail-value mono">${this.val(l.quantity_units,'num')}</div></div>
        <div class="detail-field"><div class="detail-label">Rate (INR)</div><div class="detail-value mono">${this.val(l.rate_inr,'currency')}</div></div>
        <div class="detail-field"><div class="detail-label">Rate Type</div><div class="detail-value">${this.val(l.rate_type)}</div></div>
        <div class="detail-field"><div class="detail-label">Amount (INR)</div><div class="detail-value mono">${this.val(l.amount_inr,'currency')}</div></div>
        <div class="detail-field"><div class="detail-label">IGST Amount</div><div class="detail-value mono">${this.val(l.igst_amount,'currency')}</div></div>
        <div class="detail-field"><div class="detail-label">SGST Amount</div><div class="detail-value mono">${this.val(l.sgst_amount,'currency')}</div></div>
        <div class="detail-field"><div class="detail-label">CGST Amount</div><div class="detail-value mono">${this.val(l.cgst_amount,'currency')}</div></div>
        <div class="detail-field"><div class="detail-label">Total Amount (INR)</div><div class="detail-value mono highlight-accent">${this.val(l.total_amount_inr,'currency')}</div></div>
      </div></div>`;
  },

  _renderMatchSection(l, mi) {
    return `<div class="detail-section">
      <div class="detail-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Master Match Info</div>
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">Item Type</div><div class="detail-value ${l.item_type==='rm'||l.item_type==='pm'?'highlight-warning':''}">${this.val(l.item_type)}</div></div>
        <div class="detail-field"><div class="detail-label">Item Description</div><div class="detail-value" title="${l.item_description||''}">${this.val(l.item_description)}</div></div>
        <div class="detail-field"><div class="detail-label">Sales Group</div><div class="detail-value">${this.val(l.sales_group)}</div></div>
        <div class="detail-field"><div class="detail-label">Match Source</div><div class="detail-value">${this.val(l.match_source)}</div></div>
        <div class="detail-field"><div class="detail-label">Match Score</div><div class="detail-value"><div class="match-bar-wrap"><div class="match-bar"><div class="match-bar-fill ${mi.cls}" style="width:${l.match_score!=null?l.match_score*100:0}%"></div></div><span class="match-pct ${mi.color}">${l.match_score!=null?(l.match_score*100).toFixed(1)+'% — '+mi.label:'—'}</span></div></div></div>
      </div></div>`;
  },

  _renderGstSection(l, g) {
    const cmp = (label, excelRaw, masterRaw, excelDisplay, masterDisplay) => {
      const ed = excelDisplay != null ? String(excelDisplay) : null;
      const md = masterDisplay != null ? String(masterDisplay) : null;
      let match = false;
      if (excelRaw != null && masterRaw != null) {
        const nE = parseFloat(excelRaw), nM = parseFloat(masterRaw);
        if (!isNaN(nE) && !isNaN(nM)) { match = Math.abs(nE - nM) < 0.01; }
        else { match = String(excelRaw).toLowerCase() === String(masterRaw).toLowerCase(); }
      }
      const cls = excelRaw == null || masterRaw == null ? 'warn' : (match ? 'pass' : 'fail');
      const icon = match ? this._iconCheck : (excelRaw == null || masterRaw == null ? this._iconWarn : this._iconX);
      return `<tr><td class="field-name">${label}</td><td class="field-val" title="${ed||''}">${ed||'<span class="null-val">null</span>'}</td><td class="match-icon ${cls}">${icon}</td><td class="field-val" title="${md||''}">${md||'<span class="null-val">null</span>'}</td></tr>`;
    };

    const checks = [];
    if (g.expected_gst_rate!=null) { const m=Math.abs((g.expected_gst_rate||0)-(g.actual_gst_rate||0))<0.01; checks.push({pass:m,warn:false,text:`GST Rate — Expected <strong>${this.fmtRate(g.expected_gst_rate)}</strong>, Actual <strong>${this.fmtRate(g.actual_gst_rate)}</strong>`}); }
    if (g.gst_type_valid!=null) checks.push({pass:g.gst_type_valid,warn:false,text:`GST Type — <strong>${g.gst_type||'—'}</strong> ${g.gst_type_valid?'(valid)':'(Both IGST and SGST/CGST non-zero)'}`});
    if (g.sgst_cgst_equal!=null) checks.push({pass:g.sgst_cgst_equal,warn:false,text:`SGST/CGST Equal — SGST <strong>${this.fmtCur(l.sgst_amount)}</strong>, CGST <strong>${this.fmtCur(l.cgst_amount)}</strong>`});
    if (g.total_with_gst_valid!=null) checks.push({pass:g.total_with_gst_valid,warn:false,text:`Total — Amount (<strong>${this.fmtCur(l.amount_inr)}</strong>) + GST (<strong>${this.fmtCur(g.actual_gst_amount)}</strong>) = Total (<strong>${this.fmtCur(l.total_amount_inr)}</strong>) ${g.total_with_gst_valid?'— Matched':'— MISMATCH'}`});
    if (g.uom_match!=null) checks.push({pass:g.uom_match,warn:!g.uom_match,text:`UOM — Excel <strong>${l.uom||'—'}</strong> vs Master <strong>${g.matched_uom!=null?g.matched_uom:'—'}</strong> ${g.uom_match?'— Matched':'— Mismatch'}`});
    if (g.item_type_flag) { const ft=g.item_type_flag==='RM_SOLD'?'Raw Material being sold':'Packaging Material being sold'; checks.push({pass:false,warn:true,text:`Item Type Flag — <strong>${g.item_type_flag}</strong>: ${ft}`}); }
    else if (g.item_type_flag===null&&g.matched_item_type==='fg') checks.push({pass:true,warn:false,text:'Item Type — <strong>FG</strong> (Finished Good) — OK'});
    const checksHtml = checks.map(c=>`<div class="gst-check-row">${this.checkIcon(c.pass,c.warn)}<span class="gst-check-text">${c.text}</span></div>`).join('');

    return `<div class="detail-section">
      <div class="detail-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> GST Reconciliation</div>
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">Recon Status</div><div class="detail-value"><div class="gst-status ${g.status}"><span class="gst-dot ${g.status}"></span>${g.status==='ok'?'OK':g.status==='mismatch'?'Mismatch':'Warning'}</div></div></div>
        <div class="detail-field"><div class="detail-label">Expected GST Rate</div><div class="detail-value mono">${this.fmtRate(g.expected_gst_rate)}</div></div>
        <div class="detail-field"><div class="detail-label">Actual GST Rate</div><div class="detail-value mono">${this.fmtRate(g.actual_gst_rate)}</div></div>
        <div class="detail-field"><div class="detail-label">Expected GST Amount</div><div class="detail-value mono">${this.val(g.expected_gst_amount,'currency')}</div></div>
        <div class="detail-field"><div class="detail-label">Actual GST Amount</div><div class="detail-value mono">${this.val(g.actual_gst_amount,'currency')}</div></div>
        <div class="detail-field"><div class="detail-label">GST Difference</div><div class="detail-value mono ${g.gst_difference&&Math.abs(g.gst_difference)>0.01?'highlight-mismatch':''}">${this.val(g.gst_difference,'currency')}</div></div>
        <div class="detail-field"><div class="detail-label">GST Type</div><div class="detail-value mono">${this.val(g.gst_type)}</div></div>
      </div></div>
    <div class="detail-section">
      <div class="detail-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> Excel vs Master Comparison</div>
      <table class="compare-table"><thead><tr><th>Field</th><th>From Excel</th><th class="match-icon"></th><th>From Master</th></tr></thead><tbody>
        ${cmp('Article Name', l.sku_name, g.matched_item_description, l.sku_name, g.matched_item_description)}
        ${cmp('Item Category', l.item_category, g.matched_item_category, l.item_category, g.matched_item_category)}
        ${cmp('Sub Category', l.sub_category, g.matched_sub_category, l.sub_category, g.matched_sub_category)}
        ${cmp('UOM', l.uom, g.matched_uom, l.uom, g.matched_uom!=null?String(g.matched_uom):null)}
        ${cmp('Sales Group', l.sales_group, g.matched_sales_group, l.sales_group, g.matched_sales_group)}
        ${cmp('Item Type', l.item_type, g.matched_item_type, l.item_type, g.matched_item_type)}
        ${cmp('GST Rate', g.actual_gst_rate, g.expected_gst_rate, g.actual_gst_rate!=null?this.fmtRate(g.actual_gst_rate):null, g.expected_gst_rate!=null?this.fmtRate(g.expected_gst_rate):null)}
        ${cmp('GST Amount', g.actual_gst_amount, g.expected_gst_amount, g.actual_gst_amount!=null?this.fmtCur(g.actual_gst_amount):null, g.expected_gst_amount!=null?this.fmtCur(g.expected_gst_amount):null)}
      </tbody></table></div>
    <div class="detail-section">
      <div class="detail-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> GST Validation Checks</div>
      ${checksHtml}
      ${g.notes?`<div class="notes-block"><div style="font-size:10px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Notes</div>${g.notes.split(';').map(n=>n.trim()).filter(Boolean).map(n=>`<div class="notes-item">${n}</div>`).join('')}</div>`:''}</div>`;
  },

  _renderNoGst() {
    return `<div class="detail-section"><div class="detail-section-title" style="color:var(--clr-unmatched)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> No GST Reconciliation — Article unmatched in master</div></div>`;
  },
};
