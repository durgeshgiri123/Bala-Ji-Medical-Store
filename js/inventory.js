/* =========================================================
   inventory.js — Medicine Inventory & Stock Management
   ========================================================= */
'use strict';

const Inventory = (() => {
  let allMedicines = [];
  let filtered     = [];
  let currentPage  = 1;
  const ps         = CONFIG.PAGE_SIZE;

  // ── Init ───────────────────────────────────────────────
  async function init() {
    if (!Auth.requireLogin()) return;
    Sidebar.init();
    await loadMedicines();
    bindEvents();
    populateCategoryFilter();
  }

  // ── Load ───────────────────────────────────────────────
  async function loadMedicines() {
    Loader.show();
    const res = await API.getMedicines();
    Loader.hide();
    if (res.success) {
      allMedicines = res.data || [];
      applyFilters();
    } else {
      Toast.error('Failed to load medicines: ' + (res.error || ''));
    }
  }

  // ── Filter & Search ────────────────────────────────────
  function applyFilters() {
    const q    = (document.getElementById('inv-search')?.value || '').toLowerCase();
    const cat  = document.getElementById('inv-cat-filter')?.value || '';
    const stat = document.getElementById('inv-status-filter')?.value || '';

    filtered = allMedicines.filter(m => {
      const status = Utils.getMedStatus(m.StockQuantity, m.ExpiryDate);
      const matchQ   = !q   || m.MedicineName.toLowerCase().includes(q) || m.Company?.toLowerCase().includes(q) || m.BatchNo?.toLowerCase().includes(q);
      const matchCat = !cat || m.Category === cat;
      const matchSt  = !stat|| status === stat;
      return matchQ && matchCat && matchSt;
    });

    currentPage = 1;
    renderTable();
    renderAlerts();
  }

  // ── Render Alerts ──────────────────────────────────────
  function renderAlerts() {
    const alertBox = document.getElementById('inv-alerts');
    if (!alertBox) return;
    const low     = allMedicines.filter(m => m.StockQuantity > 0 && m.StockQuantity <= CONFIG.LOW_STOCK_THRESHOLD && !Utils.isExpired(m.ExpiryDate));
    const expired = allMedicines.filter(m => Utils.isExpired(m.ExpiryDate));
    let html = '';
    if (expired.length) html += `<div class="alert alert-danger">⚠️ <strong>${expired.length}</strong> medicine(s) are <strong>expired</strong>. Please remove them from stock.</div>`;
    if (low.length)     html += `<div class="alert alert-warning">📉 <strong>${low.length}</strong> medicine(s) have <strong>low stock</strong> (≤${CONFIG.LOW_STOCK_THRESHOLD} units).</div>`;
    alertBox.innerHTML = html;
  }

  // ── Render Table ───────────────────────────────────────
  function renderTable() {
    const tbody  = document.getElementById('inv-tbody');
    const pagWrap= document.getElementById('inv-pagination');
    if (!tbody) return;

    const start = (currentPage - 1) * ps;
    const page  = filtered.slice(start, start + ps);

    if (!page.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">No medicines found.</td></tr>`;
    } else {
      tbody.innerHTML = page.map(m => {
        const status = Utils.getMedStatus(m.StockQuantity, m.ExpiryDate);
        const expClass = Utils.isExpired(m.ExpiryDate) ? 'style="color:var(--danger);font-weight:600"' : Utils.isExpiringSoon(m.ExpiryDate) ? 'style="color:var(--warning);font-weight:600"' : '';
        return `
        <tr>
          <td><code style="font-size:11px;background:var(--bg);padding:2px 6px;border-radius:4px">${Utils.sanitize(m.MedicineID)}</code></td>
          <td><strong>${Utils.sanitize(m.MedicineName)}</strong></td>
          <td><span class="badge badge-info">${Utils.sanitize(m.Category)}</span></td>
          <td>${Utils.sanitize(m.Company || '—')}</td>
          <td>${Utils.sanitize(m.BatchNo || '—')}</td>
          <td ${expClass}>${Utils.formatDate(m.ExpiryDate)}</td>
          <td><strong style="font-size:15px">${m.StockQuantity}</strong></td>
          <td>${Utils.getStatusBadge(status)}</td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn-sm btn-success" onclick="Inventory.openAddStock('${m.MedicineID}','${Utils.sanitize(m.MedicineName)}',${m.StockQuantity})">+</button>
              <button class="btn btn-sm btn-warning"  onclick="Inventory.openDecStock('${m.MedicineID}','${Utils.sanitize(m.MedicineName)}',${m.StockQuantity})">−</button>
              <button class="btn btn-sm btn-outline-primary" onclick="Inventory.openEdit('${m.MedicineID}')">✏️</button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // Pagination
    if (pagWrap) {
      pagWrap.innerHTML = '';
      pagWrap.appendChild(buildPagination(filtered.length, currentPage, ps, p => { currentPage = p; renderTable(); }));
    }
  }

  // ── Category Filter Populate ───────────────────────────
  function populateCategoryFilter() {
    const sel = document.getElementById('inv-cat-filter');
    if (!sel) return;
    sel.innerHTML = '<option value="">All Categories</option>' + Utils.categoryOptions();
  }

  // ── Bind Events ────────────────────────────────────────
  function bindEvents() {
    const debounced = Utils.debounce(applyFilters, 300);
    document.getElementById('inv-search')?.addEventListener('input', debounced);
    document.getElementById('inv-cat-filter')?.addEventListener('change', applyFilters);
    document.getElementById('inv-status-filter')?.addEventListener('change', applyFilters);
    document.getElementById('btn-add-medicine')?.addEventListener('click', openAdd);
    document.getElementById('btn-stock-history')?.addEventListener('click', openStockHistory);

    // Add/Edit form submit
    document.getElementById('medicine-form')?.addEventListener('submit', handleSaveMedicine);
    // Stock update form
    document.getElementById('stock-form')?.addEventListener('submit', handleStockUpdate);
  }

  // ── Open Add Modal ─────────────────────────────────────
  function openAdd() {
    document.getElementById('medicine-modal-title').textContent = '➕ Add New Medicine';
    document.getElementById('medicine-form').reset();
    document.getElementById('med-id-field').value = '';
    // Populate category
    const catSel = document.getElementById('med-category');
    if (catSel) catSel.innerHTML = Utils.categoryOptions();
    openModal('medicine-modal');
  }

  // ── Open Edit Modal ────────────────────────────────────
  function openEdit(id) {
    const m = allMedicines.find(x => x.MedicineID === id);
    if (!m) return;
    document.getElementById('medicine-modal-title').textContent = '✏️ Edit Medicine';
    const catSel = document.getElementById('med-category');
    if (catSel) catSel.innerHTML = Utils.categoryOptions();
    fillForm('medicine-form', {
      'med-id-field':    m.MedicineID,
      'med-name':        m.MedicineName,
      'med-category':    m.Category,
      'med-company':     m.Company,
      'med-batch':       m.BatchNo,
      'med-mfg':         m.MFGDate,
      'med-expiry':      m.ExpiryDate,
    });
    openModal('medicine-modal');
  }

  // ── Save Medicine ──────────────────────────────────────
  async function handleSaveMedicine(e) {
    e.preventDefault();
    const isEdit     = !!document.getElementById('med-id-field').value;
    const medicineId = isEdit ? document.getElementById('med-id-field').value : Utils.generateId('MED');
    const data = {
      MedicineID:    medicineId,
      MedicineName:  document.getElementById('med-name').value.trim(),
      Category:      document.getElementById('med-category').value,
      Company:       document.getElementById('med-company').value.trim(),
      BatchNo:       document.getElementById('med-batch').value.trim(),
      MFGDate:       document.getElementById('med-mfg').value,
      ExpiryDate:    document.getElementById('med-expiry').value,
      StockQuantity: isEdit ? (allMedicines.find(m => m.MedicineID === medicineId)?.StockQuantity || 0) : 0,
    };
    if (!data.MedicineName) { Toast.warning('Medicine name is required.'); return; }
    if (!data.Category)     { Toast.warning('Category is required.'); return; }
    if (!data.ExpiryDate)   { Toast.warning('Expiry date is required.'); return; }

    Loader.show();
    const res = isEdit ? await API.updateMedicine(data) : await API.addMedicine(data);
    Loader.hide();

    if (res.success) {
      Toast.success(isEdit ? 'Medicine updated!' : 'Medicine added!');
      closeModal('medicine-modal');
      await loadMedicines();
    } else {
      Toast.error(res.error || 'Failed to save medicine.');
    }
  }

  // ── Add Stock Modal ────────────────────────────────────
  function openAddStock(id, name, currentQty) {
    document.getElementById('stock-modal-title').textContent   = `📦 Add Stock — ${name}`;
    document.getElementById('stock-medicine-id').value         = id;
    document.getElementById('stock-medicine-name-disp').textContent = name;
    document.getElementById('stock-current-qty').textContent   = currentQty;
    document.getElementById('stock-mode').value                = 'add';
    document.getElementById('stock-qty-input').value           = '';
    document.getElementById('stock-qty-input').min             = '1';
    openModal('stock-modal');
  }

  // ── Decrease Stock Modal ───────────────────────────────
  function openDecStock(id, name, currentQty) {
    document.getElementById('stock-modal-title').textContent   = `📉 Decrease Stock — ${name}`;
    document.getElementById('stock-medicine-id').value         = id;
    document.getElementById('stock-medicine-name-disp').textContent = name;
    document.getElementById('stock-current-qty').textContent   = currentQty;
    document.getElementById('stock-mode').value                = 'dec';
    document.getElementById('stock-qty-input').value           = '';
    document.getElementById('stock-qty-input').max             = currentQty;
    openModal('stock-modal');
  }

  // ── Handle Stock Update ────────────────────────────────
  async function handleStockUpdate(e) {
    e.preventDefault();
    const id      = document.getElementById('stock-medicine-id').value;
    const mode    = document.getElementById('stock-mode').value;
    const qty     = parseInt(document.getElementById('stock-qty-input').value);
    const user    = Auth.getUser();
    const med     = allMedicines.find(m => m.MedicineID === id);

    if (!qty || qty <= 0) { Toast.warning('Enter a valid quantity.'); return; }
    if (mode === 'dec' && qty > med.StockQuantity) { Toast.warning('Cannot decrease more than current stock.'); return; }

    const delta = mode === 'add' ? qty : -qty;
    Loader.show();
    const res = await API.updateStock(id, delta, user?.name || 'Unknown');
    Loader.hide();

    if (res.success) {
      Toast.success(`Stock ${mode === 'add' ? 'added' : 'decreased'} successfully!`);
      closeModal('stock-modal');
      await loadMedicines();
    } else {
      Toast.error(res.error || 'Failed to update stock.');
    }
  }

  // ── Stock History Modal ────────────────────────────────
  async function openStockHistory() {
    Loader.show();
    const res = await API.getStockHistory();
    Loader.hide();
    const list = res.data || [];
    const tbody = document.getElementById('stock-history-tbody');
    if (tbody) {
      tbody.innerHTML = list.length
        ? list.slice(0,50).map(h => `
          <tr>
            <td>${Utils.formatDate(h.Date)}</td>
            <td>${Utils.sanitize(h.MedicineName)}</td>
            <td>${h.PreviousStock}</td>
            <td>${h.AddedQuantity > 0 ? '<span class="badge badge-success">+'+h.AddedQuantity+'</span>' : '<span class="badge badge-danger">'+h.AddedQuantity+'</span>'}</td>
            <td><strong>${h.NewStock}</strong></td>
            <td>${Utils.sanitize(h.Employee)}</td>
          </tr>`).join('')
        : `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No stock history found.</td></tr>`;
    }
    openModal('stock-history-modal');
  }

  // ── Modal Helpers ──────────────────────────────────────
  function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

  function fillForm(formId, data) {
    Object.entries(data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    });
  }

  // ── Public API ─────────────────────────────────────────
  return { init, openEdit, openAddStock, openDecStock, openStockHistory, closeModal };
})();

// Close modals on overlay click
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });
  if (document.getElementById('inv-search')) Inventory.init();
});
