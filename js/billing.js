/* =========================================================
   billing.js — Billing, Invoice, WhatsApp, Email
   ========================================================= */
'use strict';

const Billing = (() => {
  let medicines   = [];
  let billItems   = [];
  let invoiceNo   = '';
  let taxPercent  = 0;
  let recentBills = [];
  let currentPage = 1;
  const ps        = CONFIG.PAGE_SIZE;

  // ── Init ───────────────────────────────────────────────
  async function init() {
    if (!Auth.requireLogin()) return;
    Sidebar.init();
    invoiceNo = Utils.generateInvoiceNo();
    document.getElementById('inv-no-display').textContent = invoiceNo;
    document.getElementById('inv-date-display').textContent = Utils.formatDate(Utils.today());
    await loadMedicines();
    addBillRow();
    bindEvents();
    await loadRecentBills();
  }

  async function loadMedicines() {
    const res = await API.getMedicines();
    if (res.success) medicines = (res.data || []).filter(m => m.StockQuantity > 0 && !Utils.isExpired(m.ExpiryDate));
  }

  async function loadRecentBills() {
    Loader.show();
    const res = await API.getBills('', '');
    Loader.hide();
    recentBills = res.data || [];
    renderRecentBills();
  }

  // ── Bind Events ────────────────────────────────────────
  function bindEvents() {
    document.getElementById('btn-add-item')?.addEventListener('click', addBillRow);
    document.getElementById('btn-generate-bill')?.addEventListener('click', generateBill);
    document.getElementById('btn-new-bill')?.addEventListener('click', resetBill);
    document.getElementById('btn-print-invoice')?.addEventListener('click', printInvoice);
    document.getElementById('btn-whatsapp')?.addEventListener('click', sendWhatsApp);
    document.getElementById('btn-email')?.addEventListener('click', sendEmail);

    document.getElementById('tax-input')?.addEventListener('input', e => {
      taxPercent = parseFloat(e.target.value) || 0;
      recalcTotals();
    });

    // Customer mobile — auto-fill name from past bills
    document.getElementById('cust-mobile')?.addEventListener('blur', async e => {
      const mobile = e.target.value.trim();
      if (mobile.length === 10) {
        const past = recentBills.find(b => b.Mobile === mobile);
        if (past) {
          document.getElementById('cust-name').value  = past.CustomerName || '';
          document.getElementById('cust-email').value = past.Email || '';
          Toast.info('Customer details auto-filled from previous bill.');
        }
      }
    });
  }

  // ── Add Bill Row ───────────────────────────────────────
  function addBillRow() {
    const id  = Date.now();
    const row = document.createElement('div');
    row.className   = 'bill-item-row';
    row.id          = `row-${id}`;
    row.dataset.rowid = id;

    // Medicine datalist
    const medList = medicines.map(m => `<option value="${Utils.sanitize(m.MedicineName)}" data-qty="${m.StockQuantity}">`).join('');

    row.innerHTML = `
      <div style="grid-column:1/-1;display:none"><datalist id="meds-${id}">${medList}</datalist></div>
      <div>
        <input class="form-control bill-med-name" list="meds-${id}" placeholder="Medicine name…" autocomplete="off"
          oninput="Billing.onMedInput(this, '${id}')">
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px" id="stock-hint-${id}"></div>
      </div>
      <input class="form-control bill-qty" type="number" min="1" placeholder="Qty" value="1"
        oninput="Billing.onQtyPrice('${id}')">
      <input class="form-control bill-price" type="number" min="0" step="0.01" placeholder="Price (₹)"
        oninput="Billing.onQtyPrice('${id}')">
      <button class="btn btn-sm btn-outline-danger" onclick="Billing.removeRow('${id}')" title="Remove">×</button>`;
    document.getElementById('bill-items-wrap').appendChild(row);
    billItems.push({ id, name:'', qty:1, price:0 });
  }

  // ── Medicine Input Handler ─────────────────────────────
  function onMedInput(input, rowId) {
    const name = input.value.trim();
    const med  = medicines.find(m => m.MedicineName.toLowerCase() === name.toLowerCase());
    const hint = document.getElementById(`stock-hint-${rowId}`);
    if (med) {
      hint.textContent = `Available: ${med.StockQuantity} units`;
      hint.style.color = med.StockQuantity <= CONFIG.LOW_STOCK_THRESHOLD ? 'var(--warning)' : 'var(--text-muted)';
      const row = billItems.find(r => r.id == rowId);
      if (row) row.name = med.MedicineName;
    } else {
      hint.textContent = '';
      const row = billItems.find(r => r.id == rowId);
      if (row) row.name = name;
    }
    recalcTotals();
  }

  // ── Qty/Price Handler ──────────────────────────────────
  function onQtyPrice(rowId) {
    const rowEl = document.getElementById(`row-${rowId}`);
    if (!rowEl) return;
    const qty   = parseFloat(rowEl.querySelector('.bill-qty')?.value) || 0;
    const price = parseFloat(rowEl.querySelector('.bill-price')?.value) || 0;
    const row   = billItems.find(r => r.id == rowId);
    if (row) { row.qty = qty; row.price = price; }
    recalcTotals();
  }

  // ── Remove Row ─────────────────────────────────────────
  function removeRow(rowId) {
    document.getElementById(`row-${rowId}`)?.remove();
    billItems = billItems.filter(r => r.id != rowId);
    recalcTotals();
  }

  // ── Recalculate Totals ─────────────────────────────────
  function recalcTotals() {
    // Sync from DOM
    document.querySelectorAll('.bill-item-row').forEach(rowEl => {
      const rid   = rowEl.dataset.rowid;
      const row   = billItems.find(r => r.id == rid);
      if (!row) return;
      row.name  = rowEl.querySelector('.bill-med-name')?.value.trim() || '';
      row.qty   = parseFloat(rowEl.querySelector('.bill-qty')?.value)   || 0;
      row.price = parseFloat(rowEl.querySelector('.bill-price')?.value) || 0;
    });

    const subtotal = billItems.reduce((s, r) => s + (r.qty * r.price), 0);
    const tax      = subtotal * (taxPercent / 100);
    const grand    = subtotal + tax;

    document.getElementById('subtotal-disp').textContent = Utils.formatCurrency(subtotal);
    document.getElementById('tax-disp').textContent      = Utils.formatCurrency(tax);
    document.getElementById('grand-disp').textContent    = Utils.formatCurrency(grand);
  }

  // ── Generate Bill ──────────────────────────────────────
  async function generateBill() {
    const custName   = document.getElementById('cust-name').value.trim();
    const custMobile = document.getElementById('cust-mobile').value.trim();
    const custEmail  = document.getElementById('cust-email').value.trim();

    if (!custName)   { Toast.warning('Enter customer name.'); return; }
    if (!custMobile || !/^\d{10}$/.test(custMobile)) { Toast.warning('Enter valid 10-digit mobile.'); return; }

    // Sync rows
    recalcTotals();

    const validItems = billItems.filter(r => r.name && r.qty > 0 && r.price >= 0);
    if (!validItems.length) { Toast.warning('Add at least one medicine to the bill.'); return; }

    // Stock check
    for (const item of validItems) {
      const med = medicines.find(m => m.MedicineName.toLowerCase() === item.name.toLowerCase());
      if (med && item.qty > med.StockQuantity) {
        Toast.error(`Insufficient stock for ${item.name}. Available: ${med.StockQuantity}`);
        return;
      }
    }

    const subtotal = validItems.reduce((s, r) => s + (r.qty * r.price), 0);
    const tax      = subtotal * (taxPercent / 100);
    const grand    = subtotal + tax;
    const user     = Auth.getUser();

    const bill = {
      InvoiceNo:    invoiceNo,
      Date:         Utils.today(),
      CustomerName: custName,
      Mobile:       custMobile,
      Email:        custEmail,
      TotalAmount:  grand,
      EmployeeName: user?.name || '',
      Tax:          tax,
      Subtotal:     subtotal,
      Items:        validItems,
    };

    Loader.show();
    const res = await API.saveBill(bill);
    Loader.hide();

    if (res.success) {
      Toast.success('Bill generated successfully!');
      renderInvoicePreview(bill);
      document.getElementById('billing-section').style.display = 'none';
      document.getElementById('invoice-section').style.display = 'block';
      await loadRecentBills();
    } else {
      Toast.error(res.error || 'Failed to save bill.');
    }
  }

  // ── Render Invoice Preview ─────────────────────────────
  function renderInvoicePreview(bill) {
    const el = document.getElementById('invoice-preview');
    if (!el) return;
    el.innerHTML = `
      <div class="invoice-header">
        <div>
          <div class="invoice-logo">💊 ${CONFIG.STORE_NAME}<small>${CONFIG.STORE_ADDRESS}</small><small>📞 ${CONFIG.STORE_PHONE}</small></div>
          ${CONFIG.GST_NO ? `<div style="font-size:11px;color:#666;margin-top:4px">${CONFIG.GST_NO}</div>` : ''}
        </div>
        <div class="invoice-meta">
          <div class="invoice-no">${bill.InvoiceNo}</div>
          <div>Date: ${Utils.formatDate(bill.Date)}</div>
          <div>Cashier: ${Utils.sanitize(bill.EmployeeName)}</div>
        </div>
      </div>
      <hr class="invoice-divider">
      <div class="invoice-parties">
        <div>
          <div class="invoice-party-label">Bill To</div>
          <div class="invoice-party-name">${Utils.sanitize(bill.CustomerName)}</div>
          <div class="invoice-party-sub">📱 ${Utils.sanitize(bill.Mobile)}</div>
          ${bill.Email ? `<div class="invoice-party-sub">✉️ ${Utils.sanitize(bill.Email)}</div>` : ''}
        </div>
        <div>
          <div class="invoice-party-label">Store</div>
          <div class="invoice-party-name">${CONFIG.STORE_NAME}</div>
          <div class="invoice-party-sub">${CONFIG.STORE_ADDRESS}</div>
        </div>
      </div>
      <table class="invoice-table">
        <thead><tr><th>#</th><th>Medicine</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
          ${bill.Items.map((item, i) => `
            <tr>
              <td>${i+1}</td>
              <td>${Utils.sanitize(item.name)}</td>
              <td>${item.qty}</td>
              <td>${Utils.formatCurrency(item.price)}</td>
              <td>${Utils.formatCurrency(item.qty * item.price)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="invoice-totals">
        <div>Subtotal: ${Utils.formatCurrency(bill.Subtotal)}</div>
        ${bill.Tax ? `<div>Tax (${taxPercent}%): ${Utils.formatCurrency(bill.Tax)}</div>` : ''}
        <div class="invoice-grand">Grand Total: ${Utils.formatCurrency(bill.TotalAmount)}</div>
      </div>
      <div class="invoice-footer">
        Thank you for your business! • ${CONFIG.STORE_NAME} • ${CONFIG.STORE_PHONE}<br>
        <em>Medicines once sold cannot be returned. Keep this invoice for reference.</em>
      </div>`;
  }

  // ── WhatsApp ───────────────────────────────────────────
  function sendWhatsApp() {
    const custMobile = document.getElementById('cust-mobile').value.trim();
    if (!custMobile) { Toast.warning('No customer mobile number.'); return; }

    const items = billItems.filter(r => r.name && r.qty > 0);
    const itemList = items.map(i => `• ${i.name} × ${i.qty} = ${Utils.formatCurrency(i.qty * i.price)}`).join('%0A');
    const subtotal = items.reduce((s, r) => s + r.qty * r.price, 0);
    const tax      = subtotal * (taxPercent / 100);
    const grand    = subtotal + tax;

    const msg = encodeURIComponent(
      `🏥 *${CONFIG.STORE_NAME}*\n` +
      `📍 ${CONFIG.STORE_ADDRESS}\n\n` +
      `🧾 *Invoice: ${invoiceNo}*\n` +
      `📅 Date: ${Utils.formatDate(Utils.today())}\n\n` +
      `*Medicines:*\n${items.map(i => `• ${i.name} × ${i.qty} = ${Utils.formatCurrency(i.qty * i.price)}`).join('\n')}\n\n` +
      (tax ? `Subtotal: ${Utils.formatCurrency(subtotal)}\nTax: ${Utils.formatCurrency(tax)}\n` : '') +
      `*Total: ${Utils.formatCurrency(grand)}*\n\n` +
      `Thank you for purchasing from us! 🙏`
    );

    window.open(`https://wa.me/91${custMobile}?text=${msg}`, '_blank');
    Toast.success('Opening WhatsApp…');
  }

  // ── Email ──────────────────────────────────────────────
  async function sendEmail() {
    const custEmail = document.getElementById('cust-email').value.trim();
    if (!custEmail || !/\S+@\S+\.\S+/.test(custEmail)) {
      Toast.warning('Enter a valid customer email.');
      return;
    }
    // Build email content
    const items    = billItems.filter(r => r.name && r.qty > 0);
    const subtotal = items.reduce((s, r) => s + r.qty * r.price, 0);
    const tax      = subtotal * (taxPercent / 100);
    const grand    = subtotal + tax;

    const emailData = {
      to:      custEmail,
      subject: `Invoice ${invoiceNo} — ${CONFIG.STORE_NAME}`,
      invoiceNo,
      custName:  document.getElementById('cust-name').value.trim(),
      custEmail,
      date:    Utils.formatDate(Utils.today()),
      items,
      subtotal,
      tax,
      grand,
    };

    Loader.show();
    const res = await API.call('sendEmail', emailData);
    Loader.hide();
    if (res.success) Toast.success('Invoice sent to customer email!');
    else Toast.error(res.error || 'Failed to send email.');
  }

  // ── Print Invoice ──────────────────────────────────────
  function printInvoice() {
    window.print();
  }

  // ── Reset Bill ─────────────────────────────────────────
  function resetBill() {
    billItems = [];
    invoiceNo = Utils.generateInvoiceNo();
    document.getElementById('inv-no-display').textContent = invoiceNo;
    document.getElementById('cust-name').value   = '';
    document.getElementById('cust-mobile').value = '';
    document.getElementById('cust-email').value  = '';
    document.getElementById('bill-items-wrap').innerHTML = '';
    taxPercent = 0;
    document.getElementById('tax-input').value = '';
    recalcTotals();
    addBillRow();
    document.getElementById('billing-section').style.display = 'block';
    document.getElementById('invoice-section').style.display = 'none';
  }

  // ── Recent Bills Table ─────────────────────────────────
  function renderRecentBills() {
    const tbody = document.getElementById('recent-bills-tbody');
    if (!tbody) return;
    const start = (currentPage - 1) * ps;
    const page  = recentBills.slice(start, start + ps);
    tbody.innerHTML = page.length
      ? page.map(b => `
        <tr>
          <td><code style="font-size:11px">${Utils.sanitize(b.InvoiceNo)}</code></td>
          <td>${Utils.formatDate(b.Date)}</td>
          <td>${Utils.sanitize(b.CustomerName)}</td>
          <td>${Utils.sanitize(b.Mobile)}</td>
          <td><strong>${Utils.formatCurrency(b.TotalAmount)}</strong></td>
          <td>${Utils.sanitize(b.EmployeeName)}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary" onclick="Billing.viewBill('${b.InvoiceNo}')">👁️ View</button>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No bills found.</td></tr>`;

    const pagWrap = document.getElementById('bills-pagination');
    if (pagWrap) {
      pagWrap.innerHTML = '';
      pagWrap.appendChild(buildPagination(recentBills.length, currentPage, ps, p => { currentPage = p; renderRecentBills(); }));
    }
  }

  // ── View Existing Bill ─────────────────────────────────
  async function viewBill(invNo) {
    Loader.show();
    const res = await API.getBillItems(invNo);
    Loader.hide();
    const bill    = recentBills.find(b => b.InvoiceNo === invNo);
    const items   = (res.data || []).map(i => ({ name: i.MedicineName, qty: i.Quantity, price: i.Price }));
    if (bill && items.length) {
      renderInvoicePreview({ ...bill, Items: items, Subtotal: bill.TotalAmount, Tax: 0 });
      document.getElementById('billing-section').style.display = 'none';
      document.getElementById('invoice-section').style.display = 'block';
      invoiceNo = invNo;
      // Populate mobile for WhatsApp
      document.getElementById('cust-mobile').value = bill.Mobile || '';
      document.getElementById('cust-email').value  = bill.Email  || '';
      billItems = items.map((i, idx) => ({ id: idx, ...i }));
    }
  }

  return { init, addBillRow, removeRow, onMedInput, onQtyPrice, sendWhatsApp, sendEmail, resetBill, viewBill };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('bill-items-wrap')) Billing.init();
});
