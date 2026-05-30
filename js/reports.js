/* =========================================================
   reports.js — Reports & Analytics (Admin)
   ========================================================= */
'use strict';

const Reports = (() => {
  let activeTab = 'daily';
  let reportData = {};

  async function init() {
    if (!Auth.requireLogin()) return;
    if (!Auth.requireAdmin()) return;
    Sidebar.init();
    bindTabs();
    bindDateInputs();
    await loadReport('daily');
  }

  function bindTabs() {
    document.querySelectorAll('.report-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.report-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        await loadReport(activeTab);
      });
    });
  }

  function bindDateInputs() {
    document.getElementById('rpt-from')?.addEventListener('change', () => loadReport(activeTab));
    document.getElementById('rpt-to')?.addEventListener('change', () => loadReport(activeTab));
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('btn-export-excel')?.addEventListener('click', exportExcel);
  }

  async function loadReport(type) {
    const from = document.getElementById('rpt-from')?.value || '';
    const to   = document.getElementById('rpt-to')?.value   || '';

    Loader.show();
    const res = await API.getReport(type, from, to);
    Loader.hide();

    reportData = res.data || {};

    switch (type) {
      case 'daily':   renderDailyReport(reportData);   break;
      case 'weekly':  renderWeeklyReport(reportData);  break;
      case 'monthly': renderMonthlyReport(reportData); break;
      case 'medicine':renderMedicineReport(reportData);break;
      case 'stock':   renderStockReport(reportData);   break;
    }
  }

  // ── Summary Cards ──────────────────────────────────────
  function renderSummaryCards(items) {
    const wrap = document.getElementById('rpt-summary');
    if (!wrap) return;
    wrap.innerHTML = items.map(c => `
      <div class="stat-card">
        <div class="stat-icon ${c.color}"><span>${c.icon}</span></div>
        <div class="stat-info">
          <div class="stat-value">${c.value}</div>
          <div class="stat-label">${c.label}</div>
        </div>
      </div>`).join('');
  }

  // ── Daily Report ───────────────────────────────────────
  function renderDailyReport(data) {
    const bills   = data.bills   || [];
    const revenue = bills.reduce((s, b) => s + (parseFloat(b.TotalAmount) || 0), 0);

    renderSummaryCards([
      { icon:'🧾', color:'green',  value: bills.length,              label:'Bills Today' },
      { icon:'💰', color:'blue',   value: Utils.formatCurrency(revenue), label:'Revenue Today' },
      { icon:'💊', color:'orange', value: data.itemsSold || 0,        label:'Items Sold' },
      { icon:'👥', color:'green',  value: data.customers || 0,        label:'Customers Served' },
    ]);

    renderBillsTable(bills);
    renderBarChart('rpt-chart', bills.map(b => ({ label: b.InvoiceNo?.slice(-4), value: parseFloat(b.TotalAmount) || 0 })), 'Bill Amount (₹)');
  }

  // ── Weekly Report ──────────────────────────────────────
  function renderWeeklyReport(data) {
    const bills   = data.bills || [];
    const revenue = bills.reduce((s, b) => s + (parseFloat(b.TotalAmount) || 0), 0);
    renderSummaryCards([
      { icon:'🧾', color:'green',  value: bills.length,                  label:'Bills This Week' },
      { icon:'💰', color:'blue',   value: Utils.formatCurrency(revenue), label:'Weekly Revenue' },
      { icon:'📈', color:'orange', value: Utils.formatCurrency(revenue / 7), label:'Avg Daily Revenue' },
    ]);
    renderBillsTable(bills);
    const byDay = groupByDay(bills);
    renderBarChart('rpt-chart', Object.entries(byDay).map(([d, v]) => ({ label: d, value: v })), 'Daily Revenue (₹)');
  }

  // ── Monthly Report ─────────────────────────────────────
  function renderMonthlyReport(data) {
    const bills   = data.bills || [];
    const revenue = bills.reduce((s, b) => s + (parseFloat(b.TotalAmount) || 0), 0);
    renderSummaryCards([
      { icon:'🧾', color:'green',  value: bills.length,                  label:'Bills This Month' },
      { icon:'💰', color:'blue',   value: Utils.formatCurrency(revenue), label:'Monthly Revenue' },
      { icon:'📊', color:'orange', value: Utils.formatCurrency(revenue / 30), label:'Avg Daily Revenue' },
    ]);
    renderBillsTable(bills);
    const byDay = groupByDay(bills);
    renderBarChart('rpt-chart', Object.entries(byDay).map(([d, v]) => ({ label: d, value: v })), 'Daily Revenue (₹)');
  }

  // ── Medicine Usage Report ──────────────────────────────
  function renderMedicineReport(data) {
    const items = data.items || [];
    renderSummaryCards([
      { icon:'💊', color:'green',  value: items.length,  label:'Medicines Sold' },
      { icon:'📦', color:'blue',   value: items.reduce((s,i) => s + (parseInt(i.TotalQty)||0), 0), label:'Total Units' },
      { icon:'💰', color:'orange', value: Utils.formatCurrency(items.reduce((s,i) => s + (parseFloat(i.TotalRevenue)||0), 0)), label:'Total Revenue' },
    ]);

    const tbody = document.getElementById('rpt-tbody');
    if (!tbody) return;
    tbody.innerHTML = items.length
      ? items.slice(0, 50).map((i, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${Utils.sanitize(i.MedicineName)}</td>
          <td>${i.TotalQty || 0}</td>
          <td>${Utils.formatCurrency(i.TotalRevenue)}</td>
          <td><div style="background:var(--bg);border-radius:4px;height:8px;overflow:hidden"><div style="background:var(--primary);height:8px;width:${Math.min(100,(i.TotalQty/items[0]?.TotalQty)*100)||0}%"></div></div></td>
        </tr>`).join('')
      : `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No data for selected period.</td></tr>`;
  }

  // ── Stock Report ───────────────────────────────────────
  function renderStockReport(data) {
    const history = data.history || [];
    renderSummaryCards([
      { icon:'📦', color:'green',  value: history.filter(h => h.AddedQuantity > 0).length, label:'Stock Additions' },
      { icon:'📉', color:'orange', value: history.filter(h => h.AddedQuantity < 0).length, label:'Stock Reductions' },
    ]);
    const tbody = document.getElementById('rpt-tbody');
    if (!tbody) return;
    tbody.innerHTML = history.length
      ? history.slice(0, 50).map(h => `
        <tr>
          <td>${Utils.formatDate(h.Date)}</td>
          <td>${Utils.sanitize(h.MedicineName)}</td>
          <td>${h.PreviousStock}</td>
          <td>${h.AddedQuantity > 0 ? `<span class="badge badge-success">+${h.AddedQuantity}</span>` : `<span class="badge badge-danger">${h.AddedQuantity}</span>`}</td>
          <td><strong>${h.NewStock}</strong></td>
          <td>${Utils.sanitize(h.Employee)}</td>
        </tr>`).join('')
      : `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No stock history.</td></tr>`;
  }

  // ── Bills Table ────────────────────────────────────────
  function renderBillsTable(bills) {
    const tbody = document.getElementById('rpt-tbody');
    if (!tbody) return;
    tbody.innerHTML = bills.length
      ? bills.slice(0, 50).map(b => `
        <tr>
          <td><code style="font-size:11px">${Utils.sanitize(b.InvoiceNo)}</code></td>
          <td>${Utils.formatDate(b.Date)}</td>
          <td>${Utils.sanitize(b.CustomerName)}</td>
          <td>${Utils.sanitize(b.Mobile)}</td>
          <td><strong>${Utils.formatCurrency(b.TotalAmount)}</strong></td>
          <td>${Utils.sanitize(b.EmployeeName)}</td>
        </tr>`).join('')
      : `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No bills for selected period.</td></tr>`;
  }

  // ── Bar Chart (canvas-free SVG) ─────────────────────────
  function renderBarChart(canvasId, data, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data.length) return;

    const max   = Math.max(...data.map(d => d.value), 1);
    const W     = 600, H = 200, pad = 40;
    const bw    = Math.max(8, Math.floor((W - pad * 2) / data.length) - 4);
    const items = data.slice(-20); // last 20

    let bars = '';
    items.forEach((d, i) => {
      const bh  = Math.max(2, ((d.value / max) * (H - pad)));
      const x   = pad + i * ((W - pad * 2) / items.length);
      const y   = H - pad - bh;
      bars += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="var(--primary)" opacity="0.8"/>`;
      if (items.length <= 10) bars += `<text x="${x + bw/2}" y="${H - pad + 14}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${d.label}</text>`;
    });

    canvas.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
      <text x="${W/2}" y="14" text-anchor="middle" font-size="11" fill="var(--text-secondary)">${label}</text>
      <line x1="${pad}" y1="${H-pad}" x2="${W-pad/2}" y2="${H-pad}" stroke="var(--border)" stroke-width="1"/>
      ${bars}
    </svg>`;
  }

  // ── Group bills by day ─────────────────────────────────
  function groupByDay(bills) {
    return bills.reduce((acc, b) => {
      const d = b.Date?.split('T')[0] || b.Date || '';
      acc[d]  = (acc[d] || 0) + (parseFloat(b.TotalAmount) || 0);
      return acc;
    }, {});
  }

  // ── Export ─────────────────────────────────────────────
  function exportPDF()   {
    Toast.info('Preparing PDF export…');
    window.print();
  }

  function exportExcel() {
    Toast.info('Excel export requires server-side support. Contact admin.');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.report-tab')) Reports.init();
});
