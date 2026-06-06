/* Bala Ji Medical Store - Vanilla JS frontend with Google Apps Script REST API support. */
'use strict';

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbz_axrblMSt9ckKDm66chUF5ckXEXTnZR6umhg_sz9Z9I80ExDOFAxDYg_8atpB7ScH/exec',
  API_TOKEN: 'BJMS_2026_LAKHIMPUR_9x72_ved_secure_token',
  SESSION_KEY: 'bjms_session_v1',
  CSRF_KEY: 'bjms_csrf_v1',
  THEME_KEY: 'bjms_theme_v1',
  AUTO_LOGOUT_MS: 30 * 60 * 1000,
  GST_RATE: 0.12,
  LOW_STOCK: 10,
  SHOP: {
    name: 'Bala Ji Medical Store',
    address: 'Lakhimpur, Uttar Pradesh, India',
    phone: '+91-6387499392',
    email: 'balajimedical@gmail.com'
  }
};

const DEFAULT_CATEGORIES = ['Tablet', 'Injection', 'Drop', 'Tube', 'Syrup', 'Bandage', 'Powder', 'Others'];
const state = { medicines: [], employees: [], customers: [], bills: [], billItems: [], lastInvoice: null };
const page = document.body?.dataset.page || 'home';

document.addEventListener('DOMContentLoaded', initApp);

defaultSeed();

function initApp() {
  applyTheme();
  setYear();
  ensureCsrf();
  bindGlobalActions();
  protectRoute();
  showCurrentUser();
  loadInitialData().then(() => routePage()).catch((error) => notify(error.message, 'danger'));
  setupInactivityTimer();
}

function defaultSeed() {
  if (!localStorage.getItem('bjms_demo_seed')) {
    localStorage.setItem('bjms_medicines', JSON.stringify([
      { MedicineID: 'MED-1001', MedicineName: 'Paracetamol', Category: 'Tablet', AvailableQuantity: 24, AddedDate: today(), LastUpdated: today(), Remarks: 'Demo stock' },
      { MedicineID: 'MED-1002', MedicineName: 'Cough Syrup', Category: 'Syrup', AvailableQuantity: 8, AddedDate: today(), LastUpdated: today(), Remarks: 'Low stock' },
      { MedicineID: 'MED-1003', MedicineName: 'Betadine Ointment', Category: 'Tube', AvailableQuantity: 18, AddedDate: today(), LastUpdated: today(), Remarks: '' }
    ]));
    localStorage.setItem('bjms_employees', JSON.stringify([{ EmployeeID: 'EMP-1001', Name: 'Admin User', Username: 'admin', PasswordHash: 'demo', Role: 'Admin', Phone: '9999999999', Email: 'admin@example.com', Status: 'Active', CreatedDate: today() }]));
    localStorage.setItem('bjms_customers', JSON.stringify([]));
    localStorage.setItem('bjms_bills', JSON.stringify([]));
    localStorage.setItem('bjms_bill_items', JSON.stringify([]));
    localStorage.setItem('bjms_demo_seed', 'true');
  }
}

async function loadInitialData() {
  if (isApiConfigured()) {
    const data = await api('bootstrap', {}, Boolean(getSession()));
    Object.assign(state, data);
  } else {
    state.medicines = readStore('bjms_medicines');
    state.employees = readStore('bjms_employees');
    state.customers = readStore('bjms_customers');
    state.bills = readStore('bjms_bills');
    state.billItems = readStore('bjms_bill_items');
  }
}

function routePage() {
  if (page === 'home') initHome();
  if (page === 'login') initLogin();
  if (page === 'admin') initAdmin();
  if (page === 'inventory') initInventory();
  if (page === 'billing') initBilling();
  if (page === 'employees') initEmployees();
  if (page === 'customers') initCustomers();
}

function bindGlobalActions() {
  document.querySelectorAll('[data-action="toggle-theme"]').forEach((btn) => btn.addEventListener('click', toggleTheme));
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => btn.addEventListener('click', logout));
}

function applyTheme() { document.documentElement.dataset.theme = localStorage.getItem(CONFIG.THEME_KEY) || 'light'; }
function toggleTheme() { localStorage.setItem(CONFIG.THEME_KEY, document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); applyTheme(); }
function setYear() { document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); }); }
function ensureCsrf() { if (!sessionStorage.getItem(CONFIG.CSRF_KEY)) sessionStorage.setItem(CONFIG.CSRF_KEY, cryptoRandom()); document.querySelectorAll('[data-csrf]').forEach((el) => { el.value = sessionStorage.getItem(CONFIG.CSRF_KEY); }); }
function cryptoRandom() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join(''); }
function today() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function money(value) { return `₹${Number(value || 0).toFixed(2)}`; }
function readStore(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
function writeStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function isApiConfigured() { return CONFIG.API_URL.startsWith('https://') && !CONFIG.API_URL.includes('PASTE_'); }

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function api(action, payload = {}, requireAuth = true) {
  const session = getSession();
  const response = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, token: CONFIG.API_TOKEN, sessionToken: requireAuth ? session?.sessionToken : '', csrf: sessionStorage.getItem(CONFIG.CSRF_KEY), payload })
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || 'API request failed');
  return data.data;
}

function getSession() { try { return JSON.parse(sessionStorage.getItem(CONFIG.SESSION_KEY) || 'null'); } catch { return null; } }
function setSession(session) { sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify({ ...session, lastActive: Date.now() })); }
function clearSession() { sessionStorage.removeItem(CONFIG.SESSION_KEY); }
function logout() { clearSession(); location.href = 'login.html'; }
function hasRole(allowed) { const session = getSession(); return session && allowed.includes(session.role); }

function protectRoute() {
  const roles = document.body?.dataset.roles;
  if (!roles) return;
  const allowed = roles.split(',').map((r) => r.trim());
  const session = getSession();
  if (!session || Date.now() - Number(session.lastActive || 0) > CONFIG.AUTO_LOGOUT_MS) return logout();
  if (!allowed.includes(session.role)) {
    notify('You are not authorized to access this page.', 'danger');
    setTimeout(() => { location.href = session.role === 'Admin' ? 'admin.html' : 'inventory.html'; }, 800);
  }
  setSession(session);
  document.querySelectorAll('[data-role-link="Admin"]').forEach((el) => { if (session.role !== 'Admin') el.remove(); });
}

function setupInactivityTimer() {
  if (!getSession()) return;
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach((event) => document.addEventListener(event, () => {
    const session = getSession();
    if (session) setSession(session);
  }, { passive: true }));
  setInterval(() => {
    const session = getSession();
    if (session && Date.now() - Number(session.lastActive || 0) > CONFIG.AUTO_LOGOUT_MS) logout();
  }, 60000);
}

function showCurrentUser() {
  const session = getSession();
  document.querySelectorAll('[data-current-user]').forEach((el) => { el.textContent = session ? `${session.name} · ${session.role}` : ''; });
}

function notify(message, type = 'success') {
  const area = document.getElementById('notificationArea');
  if (!area) return;
  area.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${escapeHtml(message)}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
}

function initHome() {
  populateCategoryFilter();
  ['searchMedicine', 'categoryFilter', 'sortMedicine'].forEach((id) => document.getElementById(id)?.addEventListener('input', renderPublicInventory));
  document.getElementById('refreshPublicInventory')?.addEventListener('click', async () => { await loadInitialData(); renderPublicInventory(); });
  renderPublicInventory();
}

function populateCategoryFilter() {
  const select = document.getElementById('categoryFilter');
  if (!select) return;
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...state.medicines.map((m) => m.Category).filter(Boolean)])];
  select.innerHTML = '<option value="">All Categories</option>' + categories.map((cat) => `<option>${escapeHtml(cat)}</option>`).join('');
}

function renderPublicInventory() {
  const grid = document.getElementById('publicInventoryGrid');
  if (!grid) return;
  const term = document.getElementById('searchMedicine')?.value.toLowerCase() || '';
  const category = document.getElementById('categoryFilter')?.value || '';
  const sort = document.getElementById('sortMedicine')?.value || 'az';
  let list = state.medicines.filter((m) => m.MedicineName.toLowerCase().includes(term) && (!category || m.Category === category));
  list.sort((a, b) => sort === 'za' ? b.MedicineName.localeCompare(a.MedicineName) : sort === 'stockHigh' ? b.AvailableQuantity - a.AvailableQuantity : sort === 'stockLow' ? a.AvailableQuantity - b.AvailableQuantity : a.MedicineName.localeCompare(b.MedicineName));
  grid.innerHTML = list.length ? list.map((m) => `<article class="col-sm-6 col-lg-4"><div class="card medicine-card ${Number(m.AvailableQuantity) < CONFIG.LOW_STOCK ? 'low-stock' : ''} border-0 shadow-sm h-100"><div class="card-body"><div class="d-flex justify-content-between"><h2 class="h5">${escapeHtml(m.MedicineName)}</h2><span class="badge ${Number(m.AvailableQuantity) < CONFIG.LOW_STOCK ? 'badge-low' : 'badge-ok'}">${Number(m.AvailableQuantity) < CONFIG.LOW_STOCK ? 'Low' : 'Available'}</span></div><p class="text-muted mb-2">${escapeHtml(m.Category)}</p><p class="display-6 fw-bold mb-0">${escapeHtml(m.AvailableQuantity)}</p><small class="text-muted">Available quantity</small></div></div></article>`).join('') : '<div class="col-12"><div class="alert alert-info">No medicines found.</div></div>';
}

function initLogin() {
  document.getElementById('loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    const username = form.username.value.trim();
    const passwordHash = await sha256(form.password.value);
    try {
      let session;
      if (isApiConfigured()) session = await api('login', { username, passwordHash }, false);
      else {
        const employee = state.employees.find((e) => e.Username === username && (e.PasswordHash === passwordHash || (e.Username === 'admin' && form.password.value === 'admin123')) && e.Status === 'Active');
        if (!employee) throw new Error('Invalid username or password. Demo login: admin / admin123');
        session = { employeeId: employee.EmployeeID, name: employee.Name, role: employee.Role, sessionToken: cryptoRandom() };
      }
      setSession(session);
      location.href = session.role === 'Admin' ? 'admin.html' : 'inventory.html';
    } catch (error) { notify(error.message, 'danger'); }
  });
}

function initAdmin() {
  const totalStock = state.medicines.reduce((sum, m) => sum + Number(m.AvailableQuantity || 0), 0);
  const cards = [ ['Medicines', state.medicines.length, 'Rx'], ['Total Stock', totalStock, 'Σ'], ['Employees', state.employees.length, '👥'], ['Customers', state.customers.length, '☎'], ['Bills', state.bills.length, '₹'] ];
  document.getElementById('dashboardCards').innerHTML = cards.map(([label, value, icon]) => `<div class="col-sm-6 col-xl"><div class="card stat-card"><div class="card-body d-flex align-items-center justify-content-between"><div><p class="text-muted mb-1">${label}</p><h3 class="mb-0">${value}</h3></div><div class="stat-icon">${icon}</div></div></div></div>`).join('');
  document.getElementById('lowStockAlerts').innerHTML = state.medicines.filter((m) => Number(m.AvailableQuantity) < CONFIG.LOW_STOCK).map((m) => `<span class="badge text-bg-danger me-2 mb-2">${escapeHtml(m.MedicineName)}: ${m.AvailableQuantity}</span>`).join('') || '<span class="badge text-bg-success">No low stock alerts</span>';
  document.getElementById('activityLog').innerHTML = '<ul><li>System loaded dashboard safely.</li><li>Audit logs are recorded in Google Sheet when API is configured.</li></ul>';
  document.getElementById('backupDataBtn')?.addEventListener('click', () => downloadFile('bjms-backup.json', JSON.stringify(state, null, 2), 'application/json'));
  renderCharts();
}

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const byCategory = state.medicines.reduce((acc, m) => (acc[m.Category] = (acc[m.Category] || 0) + Number(m.AvailableQuantity || 0), acc), {});
  new Chart(document.getElementById('stockCategoryChart'), { type: 'doughnut', data: { labels: Object.keys(byCategory), datasets: [{ data: Object.values(byCategory), backgroundColor: ['#0D6EFD','#198754','#ffc107','#dc3545','#6f42c1','#20c997'] }] } });
  new Chart(document.getElementById('monthlyBillsChart'), { type: 'bar', data: { labels: ['Jan','Feb','Mar','Apr','May','Jun'], datasets: [{ label: 'Bills', data: [0,0,0,0,0,state.bills.length], backgroundColor: '#0D6EFD' }] } });
  new Chart(document.getElementById('topSellingChart'), { type: 'bar', data: { labels: state.medicines.slice(0, 5).map((m) => m.MedicineName), datasets: [{ label: 'Units', data: state.medicines.slice(0, 5).map((m) => Math.max(1, 20 - Number(m.AvailableQuantity || 0))), backgroundColor: '#198754' }] }, options: { indexAxis: 'y' } });
}

function initInventory() {
  document.querySelector('input[name="Date"]') && (document.querySelector('input[name="Date"]').value = today());
  populateMedicineControls();
  renderInventoryTable();
  document.getElementById('inventorySearch')?.addEventListener('input', renderInventoryTable);
  document.getElementById('medicineForm')?.addEventListener('submit', saveMedicine);
  document.getElementById('stockForm')?.addEventListener('submit', addStock);
  document.getElementById('exportInventoryCsv')?.addEventListener('click', exportInventoryCsv);
}

function populateMedicineControls() {
  const datalist = document.getElementById('categoryOptions');
  if (datalist) datalist.innerHTML = [...new Set([...DEFAULT_CATEGORIES, ...state.medicines.map((m) => m.Category)])].map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
  const stockSelect = document.getElementById('stockMedicineSelect');
  if (stockSelect) stockSelect.innerHTML = '<option value="">Select medicine</option>' + state.medicines.map((m) => `<option value="${m.MedicineID}">${escapeHtml(m.MedicineName)} (${m.AvailableQuantity})</option>`).join('');
}

function renderInventoryTable() {
  const tbody = document.getElementById('inventoryTable');
  if (!tbody) return;
  const term = document.getElementById('inventorySearch')?.value.toLowerCase() || '';
  tbody.innerHTML = state.medicines.filter((m) => m.MedicineName.toLowerCase().includes(term)).map((m) => `<tr><td>${m.MedicineID}</td><td>${escapeHtml(m.MedicineName)}</td><td>${escapeHtml(m.Category)}</td><td>${m.AvailableQuantity} ${Number(m.AvailableQuantity) < CONFIG.LOW_STOCK ? '<span class="badge text-bg-danger">Low</span>' : ''}</td><td>${escapeHtml(m.LastUpdated || '')}</td><td>${escapeHtml(m.Remarks || '')}</td><td><button class="btn btn-sm btn-outline-primary" data-edit-med="${m.MedicineID}">Edit</button> ${hasRole(['Admin','Manager']) ? `<button class="btn btn-sm btn-outline-danger" data-delete-med="${m.MedicineID}">Delete</button>` : ''}</td></tr>`).join('');
  tbody.querySelectorAll('[data-edit-med]').forEach((btn) => btn.addEventListener('click', () => editMedicine(btn.dataset.editMed)));
  tbody.querySelectorAll('[data-delete-med]').forEach((btn) => btn.addEventListener('click', () => deleteMedicine(btn.dataset.deleteMed)));
}

async function saveMedicine(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const data = Object.fromEntries(new FormData(form));
  if (isApiConfigured()) await api('saveMedicine', data);
  else {
    const index = state.medicines.findIndex((m) => m.MedicineID === data.MedicineID);
    const row = { MedicineID: data.MedicineID || `MED-${Date.now()}`, MedicineName: data.MedicineName.trim(), Category: data.Category.trim(), AvailableQuantity: index >= 0 ? state.medicines[index].AvailableQuantity : 0, AddedDate: index >= 0 ? state.medicines[index].AddedDate : today(), LastUpdated: today(), Remarks: data.Remarks || '' };
    index >= 0 ? state.medicines.splice(index, 1, row) : state.medicines.push(row);
    writeStore('bjms_medicines', state.medicines);
  }
  form.reset(); await loadInitialData(); populateMedicineControls(); renderInventoryTable(); notify('Medicine saved successfully.');
}

function editMedicine(id) { const m = state.medicines.find((item) => item.MedicineID === id); if (!m) return; const form = document.getElementById('medicineForm'); ['MedicineID','MedicineName','Category','Remarks'].forEach((k) => { if (form[k]) form[k].value = m[k] || ''; }); }
async function deleteMedicine(id) { if (!confirm('Delete this medicine?')) return; if (isApiConfigured()) await api('deleteMedicine', { MedicineID: id }); else { state.medicines = state.medicines.filter((m) => m.MedicineID !== id); writeStore('bjms_medicines', state.medicines); } renderInventoryTable(); populateMedicineControls(); notify('Medicine deleted.'); }
async function addStock(event) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); if (isApiConfigured()) await api('addStock', data); else { const med = state.medicines.find((m) => m.MedicineID === data.MedicineID); med.AvailableQuantity = Number(med.AvailableQuantity) + Number(data.QuantityAdded); med.LastUpdated = data.Date || today(); writeStore('bjms_medicines', state.medicines); } event.currentTarget.reset(); await loadInitialData(); populateMedicineControls(); renderInventoryTable(); notify('Stock added and inventory updated.'); }
function exportInventoryCsv() { const csv = ['MedicineID,MedicineName,Category,AvailableQuantity,AddedDate,LastUpdated,Remarks', ...state.medicines.map((m) => [m.MedicineID,m.MedicineName,m.Category,m.AvailableQuantity,m.AddedDate,m.LastUpdated,m.Remarks].map(csvCell).join(','))].join('\n'); downloadFile('inventory.csv', csv, 'text/csv'); }
function csvCell(value) { return `"${String(value || '').replace(/"/g, '""')}"`; }
function downloadFile(name, content, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); }

function initBilling() { renderBillItems(); renderBillsTable(); document.getElementById('addBillItem')?.addEventListener('click', () => addBillItemRow()); document.getElementById('billForm')?.addEventListener('submit', saveBill); document.getElementById('printInvoice')?.addEventListener('click', () => window.print()); document.getElementById('sendWhatsapp')?.addEventListener('click', sendWhatsApp); document.getElementById('sendEmail')?.addEventListener('click', sendInvoiceEmail); document.getElementById('exportBillPdf')?.addEventListener('click', () => window.print()); addBillItemRow(); }
function renderBillItems() { const tbody = document.getElementById('billItems'); if (tbody) tbody.innerHTML = ''; }
function addBillItemRow() { const tbody = document.getElementById('billItems'); const options = state.medicines.map((m) => `<option value="${m.MedicineID}">${escapeHtml(m.MedicineName)} (${m.AvailableQuantity})</option>`).join(''); tbody.insertAdjacentHTML('beforeend', `<tr><td><select class="form-select bill-med" required><option value="">Select</option>${options}</select></td><td><input type="number" class="form-control bill-qty" min="1" value="1" required></td><td><input type="number" class="form-control bill-price" min="0" step="0.01" value="0" required></td><td class="bill-line-total">₹0.00</td><td><button class="btn btn-sm btn-outline-danger" type="button">×</button></td></tr>`); tbody.lastElementChild.querySelectorAll('select,input').forEach((el) => el.addEventListener('input', calculateBill)); tbody.lastElementChild.querySelector('button').addEventListener('click', (e) => { e.currentTarget.closest('tr').remove(); calculateBill(); }); calculateBill(); }
function calculateBill() { let subtotal = 0; document.querySelectorAll('#billItems tr').forEach((row) => { const qty = Number(row.querySelector('.bill-qty').value || 0); const price = Number(row.querySelector('.bill-price').value || 0); const total = qty * price; row.querySelector('.bill-line-total').textContent = money(total); subtotal += total; }); document.getElementById('billSubtotal').textContent = money(subtotal); document.getElementById('billGst').textContent = money(subtotal * CONFIG.GST_RATE); document.getElementById('billGrandTotal').textContent = money(subtotal * (1 + CONFIG.GST_RATE)); return { subtotal, gst: subtotal * CONFIG.GST_RATE, grandTotal: subtotal * (1 + CONFIG.GST_RATE) }; }
async function saveBill(event) { event.preventDefault(); const form = event.currentTarget; if (!form.checkValidity()) return form.reportValidity(); const totals = calculateBill(); const items = [...document.querySelectorAll('#billItems tr')].map((row) => ({ MedicineID: row.querySelector('.bill-med').value, Quantity: Number(row.querySelector('.bill-qty').value), Price: Number(row.querySelector('.bill-price').value) })).filter((i) => i.MedicineID && i.Quantity > 0); if (!items.length) return notify('Add at least one medicine.', 'danger'); const bill = { BillID: `BILL-${Date.now()}`, CustomerName: form.CustomerName.value.trim(), Phone: form.Phone.value.trim(), Email: form.Email.value.trim(), TotalAmount: totals.grandTotal, Date: today(), CreatedBy: getSession()?.name || 'Demo', items }; if (isApiConfigured()) await api('createBill', bill); else { state.bills.unshift(bill); writeStore('bjms_bills', state.bills); } state.lastInvoice = bill; renderInvoice(bill); renderBillsTable(); ['sendWhatsapp','sendEmail','exportBillPdf'].forEach((id) => { document.getElementById(id).disabled = false; }); notify('Invoice generated successfully.'); }
function renderInvoice(bill) { document.getElementById('invoicePreview').innerHTML = `<div class="invoice-header"><img src="assets/logo.svg" alt="Logo"><div><h2 class="h5 mb-0">${CONFIG.SHOP.name}</h2><small>${CONFIG.SHOP.address}</small><br><small>${CONFIG.SHOP.phone} · ${CONFIG.SHOP.email}</small></div></div><div class="d-flex justify-content-between"><div><strong>Invoice:</strong> ${bill.BillID}<br><strong>Date:</strong> ${bill.Date}</div><div><strong>Customer:</strong> ${escapeHtml(bill.CustomerName)}<br><strong>Phone:</strong> ${escapeHtml(bill.Phone)}<br><strong>Email:</strong> ${escapeHtml(bill.Email || '-')}</div></div><table class="table table-sm mt-3"><thead><tr><th>Medicine</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${bill.items.map((i) => { const med = state.medicines.find((m) => m.MedicineID === i.MedicineID); return `<tr><td>${escapeHtml(med?.MedicineName || i.MedicineID)}</td><td>${i.Quantity}</td><td>${money(i.Price)}</td><td>${money(i.Price * i.Quantity)}</td></tr>`; }).join('')}</tbody></table><h3 class="text-end h5">Total: ${money(bill.TotalAmount)}</h3>`; }
function sendWhatsApp() { const bill = state.lastInvoice; if (!bill) return; const text = encodeURIComponent(`${CONFIG.SHOP.name}\nInvoice ${bill.BillID}\nCustomer: ${bill.CustomerName}\nTotal: ${money(bill.TotalAmount)}\nThank you.`); window.open(`https://wa.me/91${bill.Phone.replace(/\D/g, '')}?text=${text}`, '_blank', 'noopener'); }
async function sendInvoiceEmail() { if (!state.lastInvoice) return; if (isApiConfigured()) { await api('sendInvoiceEmail', state.lastInvoice); notify('Invoice email sent.'); } else notify('Configure Google Apps Script API to send invoice emails.', 'warning'); }
function renderBillsTable() { const tbody = document.getElementById('billsTable'); if (!tbody) return; tbody.innerHTML = state.bills.map((b) => `<tr><td>${b.BillID}</td><td>${escapeHtml(b.CustomerName || b.CustomerID || '')}</td><td>${money(b.TotalAmount)}</td><td>${escapeHtml(b.Date)}</td><td>${escapeHtml(b.CreatedBy || '')}</td></tr>`).join(''); }

function initEmployees() { renderEmployees(); document.getElementById('employeeSearch')?.addEventListener('input', renderEmployees); document.getElementById('employeeForm')?.addEventListener('submit', saveEmployee); }
function renderEmployees() { const tbody = document.getElementById('employeesTable'); if (!tbody) return; const term = document.getElementById('employeeSearch')?.value.toLowerCase() || ''; tbody.innerHTML = state.employees.filter((e) => e.Name.toLowerCase().includes(term) || e.Role.toLowerCase().includes(term)).map((e) => `<tr><td>${e.EmployeeID}</td><td>${escapeHtml(e.Name)}</td><td>${escapeHtml(e.Role)}</td><td>${escapeHtml(e.Phone)}</td><td>${escapeHtml(e.Email)}</td><td><span class="badge text-bg-${e.Status === 'Active' ? 'success' : 'secondary'}">${escapeHtml(e.Status)}</span></td><td><button class="btn btn-sm btn-outline-primary" data-edit-emp="${e.EmployeeID}">Edit</button> <button class="btn btn-sm btn-outline-danger" data-del-emp="${e.EmployeeID}">Delete</button></td></tr>`).join(''); tbody.querySelectorAll('[data-edit-emp]').forEach((btn) => btn.addEventListener('click', () => fillForm('employeeForm', state.employees.find((e) => e.EmployeeID === btn.dataset.editEmp)))); tbody.querySelectorAll('[data-del-emp]').forEach((btn) => btn.addEventListener('click', () => deleteEmployee(btn.dataset.delEmp))); }
async function saveEmployee(event) { event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); if (!data.EmployeeID && !data.Password) return notify('Password is required for a new employee.', 'danger'); data.PasswordHash = data.Password ? await sha256(data.Password) : ''; delete data.Password; if (isApiConfigured()) await api('saveEmployee', data); else { const index = state.employees.findIndex((e) => e.EmployeeID === data.EmployeeID); const row = { ...data, EmployeeID: data.EmployeeID || `EMP-${Date.now()}`, PasswordHash: data.PasswordHash || state.employees[index]?.PasswordHash, CreatedDate: today() }; index >= 0 ? state.employees.splice(index, 1, row) : state.employees.push(row); writeStore('bjms_employees', state.employees); } form.reset(); await loadInitialData(); renderEmployees(); notify('Employee saved.'); }
async function deleteEmployee(id) { const employee = state.employees.find((e) => e.EmployeeID === id); if (employee?.Role === 'Admin' && state.employees.filter((e) => e.Role === 'Admin').length <= 1) return notify('Cannot delete the last admin.', 'danger'); if (!confirm('Delete employee?')) return; if (isApiConfigured()) await api('deleteEmployee', { EmployeeID: id }); else { state.employees = state.employees.filter((e) => e.EmployeeID !== id); writeStore('bjms_employees', state.employees); } renderEmployees(); notify('Employee deleted.'); }

function initCustomers() { renderCustomers(); document.getElementById('customerSearch')?.addEventListener('input', renderCustomers); document.getElementById('customerForm')?.addEventListener('submit', saveCustomer); }
function renderCustomers() { const tbody = document.getElementById('customersTable'); if (!tbody) return; const term = document.getElementById('customerSearch')?.value.toLowerCase() || ''; tbody.innerHTML = state.customers.filter((c) => `${c.Name} ${c.Phone} ${c.Email}`.toLowerCase().includes(term)).map((c) => `<tr><td>${c.CustomerID}</td><td>${escapeHtml(c.Name)}</td><td>${escapeHtml(c.Phone)}</td><td>${escapeHtml(c.Email)}</td><td>${escapeHtml(c.Address)}</td><td>${escapeHtml(c.DateAdded)}</td><td><button class="btn btn-sm btn-outline-primary" data-edit-cust="${c.CustomerID}">Edit</button></td></tr>`).join(''); tbody.querySelectorAll('[data-edit-cust]').forEach((btn) => btn.addEventListener('click', () => fillForm('customerForm', state.customers.find((c) => c.CustomerID === btn.dataset.editCust)))); }
async function saveCustomer(event) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); if (isApiConfigured()) await api('saveCustomer', data); else { const index = state.customers.findIndex((c) => c.CustomerID === data.CustomerID); const row = { ...data, CustomerID: data.CustomerID || `CUS-${Date.now()}`, DateAdded: index >= 0 ? state.customers[index].DateAdded : today() }; index >= 0 ? state.customers.splice(index, 1, row) : state.customers.push(row); writeStore('bjms_customers', state.customers); } event.currentTarget.reset(); await loadInitialData(); renderCustomers(); notify('Customer saved.'); }
function fillForm(formId, row) { const form = document.getElementById(formId); if (!form || !row) return; Object.entries(row).forEach(([key, value]) => { if (form[key] && key !== 'PasswordHash') form[key].value = value || ''; }); }
