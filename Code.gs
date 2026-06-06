/**
 * Bala Ji Medical Store - Google Apps Script API.
 * Deploy as Web App: Execute as Me, access Anyone with the link.
 */
const CONFIG = {
  API_TOKEN: 'CHANGE_THIS_PUBLIC_CLIENT_TOKEN',
  SESSION_TTL_SECONDS: 1800,
  GST_RATE: 0.12,
  SHOP_NAME: 'Bala Ji Medical Store',
  SHOP_ADDRESS: 'Lakhimpur, Uttar Pradesh, India'
};

const SHEETS = {
  Employees: ['EmployeeID', 'Name', 'Username', 'PasswordHash', 'Role', 'Phone', 'Email', 'Status', 'CreatedDate'],
  Medicines: ['MedicineID', 'MedicineName', 'Category', 'AvailableQuantity', 'AddedDate', 'LastUpdated', 'Remarks'],
  StockHistory: ['EntryID', 'MedicineID', 'QuantityAdded', 'AddedBy', 'Date', 'Remarks'],
  Customers: ['CustomerID', 'Name', 'Phone', 'Email', 'Address', 'DateAdded'],
  Bills: ['BillID', 'CustomerID', 'CustomerName', 'Phone', 'Email', 'TotalAmount', 'Date', 'CreatedBy'],
  BillItems: ['BillID', 'MedicineID', 'Quantity', 'Price'],
  AuditLogs: ['LogID', 'Action', 'EmployeeID', 'DateTime', 'Details']
};

const ROLE_PERMISSIONS = {
  Admin: ['bootstrap', 'saveEmployee', 'deleteEmployee', 'saveMedicine', 'deleteMedicine', 'addStock', 'saveCustomer', 'createBill', 'sendInvoiceEmail', 'backup'],
  Manager: ['bootstrap', 'saveMedicine', 'addStock', 'saveCustomer', 'createBill', 'sendInvoiceEmail'],
  Employee: ['bootstrap', 'addStock', 'saveCustomer', 'createBill', 'sendInvoiceEmail']
};

function doGet() {
  return jsonResponse({ ok: true, message: 'Bala Ji Medical Store API is running.' });
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    if (request.token !== CONFIG.API_TOKEN) throw new Error('Invalid API token.');
    setupSheets();
    const action = sanitizeText(request.action || '');
    const payload = request.payload || {};
    if (action === 'login') return jsonResponse({ ok: true, data: login(payload) });
    if (action === 'bootstrap') return jsonResponse({ ok: true, data: bootstrapPublic(request.sessionToken) });
    const session = validateSession(request.sessionToken);
    authorize(session.role, action);
    const handlers = { saveEmployee, deleteEmployee, saveMedicine, deleteMedicine, addStock, saveCustomer, createBill, sendInvoiceEmail, backup };
    if (!handlers[action]) throw new Error('Unknown action.');
    const data = handlers[action](payload, session);
    audit(action, session.employeeId, JSON.stringify(payload).slice(0, 500));
    return jsonResponse({ ok: true, data });
  } catch (error) {
    return jsonResponse({ ok: false, message: error.message });
  }
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach((name) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const headers = sheet.getRange(1, 1, 1, SHEETS[name].length).getValues()[0];
    if (headers.join('') === '') sheet.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]);
  });
}

function bootstrapPublic(sessionToken) {
  const data = {
    medicines: getRows('Medicines'),
    employees: [],
    customers: [],
    bills: [],
    billItems: []
  };
  try {
    const session = validateSession(sessionToken);
    data.employees = session.role === 'Admin' ? getRows('Employees').map(maskEmployee) : [];
    data.customers = getRows('Customers');
    data.bills = getRows('Bills');
    data.billItems = getRows('BillItems');
  } catch (err) {
    // Public bootstrap returns only medicines.
  }
  return data;
}

function login(payload) {
  const username = sanitizeText(payload.username || '');
  const passwordHash = sanitizeText(payload.passwordHash || '');
  const employee = getRows('Employees').find((row) => row.Username === username && row.PasswordHash === passwordHash && row.Status === 'Active');
  if (!employee) throw new Error('Invalid username or password.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('session_' + token, JSON.stringify({ employeeId: employee.EmployeeID, name: employee.Name, role: employee.Role }), CONFIG.SESSION_TTL_SECONDS);
  audit('login', employee.EmployeeID, 'Successful login');
  return { employeeId: employee.EmployeeID, name: employee.Name, role: employee.Role, sessionToken: token };
}

function validateSession(token) {
  if (!token) throw new Error('Session missing.');
  const raw = CacheService.getScriptCache().get('session_' + token);
  if (!raw) throw new Error('Session expired. Please login again.');
  const session = JSON.parse(raw);
  CacheService.getScriptCache().put('session_' + token, raw, CONFIG.SESSION_TTL_SECONDS);
  return session;
}

function authorize(role, action) {
  if (!(ROLE_PERMISSIONS[role] || []).includes(action)) throw new Error('Unauthorized action for role: ' + role);
}

function saveEmployee(payload, session) {
  if (payload.Role === 'Admin' && session.role !== 'Admin') throw new Error('Only Admin can assign Admin role.');
  const rows = getRows('Employees');
  const id = payload.EmployeeID || makeId('EMP');
  const existing = rows.find((row) => row.EmployeeID === id);
  const row = {
    EmployeeID: id,
    Name: sanitizeText(payload.Name),
    Username: sanitizeText(payload.Username),
    PasswordHash: payload.PasswordHash || (existing && existing.PasswordHash) || '',
    Role: sanitizeRole(payload.Role),
    Phone: sanitizePhone(payload.Phone),
    Email: sanitizeEmail(payload.Email),
    Status: sanitizeStatus(payload.Status),
    CreatedDate: existing ? existing.CreatedDate : today()
  };
  if (!row.PasswordHash) throw new Error('Password hash is required.');
  upsertRow('Employees', 'EmployeeID', id, row);
  return maskEmployee(row);
}

function deleteEmployee(payload) {
  const rows = getRows('Employees');
  const employee = rows.find((row) => row.EmployeeID === payload.EmployeeID);
  if (!employee) throw new Error('Employee not found.');
  if (employee.Role === 'Admin' && rows.filter((row) => row.Role === 'Admin').length <= 1) throw new Error('Cannot delete the last admin.');
  deleteRow('Employees', 'EmployeeID', payload.EmployeeID);
  return true;
}

function saveMedicine(payload) {
  const id = payload.MedicineID || makeId('MED');
  const existing = getRows('Medicines').find((row) => row.MedicineID === id);
  const row = {
    MedicineID: id,
    MedicineName: sanitizeText(payload.MedicineName),
    Category: sanitizeText(payload.Category),
    AvailableQuantity: existing ? Number(existing.AvailableQuantity || 0) : 0,
    AddedDate: existing ? existing.AddedDate : today(),
    LastUpdated: today(),
    Remarks: sanitizeText(payload.Remarks || '')
  };
  upsertRow('Medicines', 'MedicineID', id, row);
  return row;
}

function deleteMedicine(payload) {
  deleteRow('Medicines', 'MedicineID', payload.MedicineID);
  return true;
}

function addStock(payload, session) {
  const quantity = Number(payload.QuantityAdded);
  if (!payload.MedicineID || quantity <= 0) throw new Error('Valid medicine and quantity are required.');
  const medicines = getRows('Medicines');
  const medicine = medicines.find((row) => row.MedicineID === payload.MedicineID);
  if (!medicine) throw new Error('Medicine not found.');
  medicine.AvailableQuantity = Number(medicine.AvailableQuantity || 0) + quantity;
  medicine.LastUpdated = payload.Date || today();
  upsertRow('Medicines', 'MedicineID', medicine.MedicineID, medicine);
  appendRow('StockHistory', { EntryID: makeId('STK'), MedicineID: medicine.MedicineID, QuantityAdded: quantity, AddedBy: session.employeeId, Date: payload.Date || today(), Remarks: sanitizeText(payload.Remarks || '') });
  return medicine;
}

function saveCustomer(payload) {
  const id = payload.CustomerID || makeId('CUS');
  const existing = getRows('Customers').find((row) => row.CustomerID === id);
  const row = { CustomerID: id, Name: sanitizeText(payload.Name), Phone: sanitizePhone(payload.Phone), Email: sanitizeEmail(payload.Email), Address: sanitizeText(payload.Address), DateAdded: existing ? existing.DateAdded : today() };
  upsertRow('Customers', 'CustomerID', id, row);
  return row;
}

function createBill(payload, session) {
  const customer = saveCustomer({ Name: payload.CustomerName, Phone: payload.Phone, Email: payload.Email, Address: '' });
  const billId = payload.BillID || makeId('BILL');
  const items = payload.items || [];
  if (!items.length) throw new Error('Bill requires at least one item.');
  const total = items.reduce((sum, item) => sum + Number(item.Quantity) * Number(item.Price), 0) * (1 + CONFIG.GST_RATE);
  appendRow('Bills', { BillID: billId, CustomerID: customer.CustomerID, CustomerName: customer.Name, Phone: customer.Phone, Email: customer.Email, TotalAmount: total, Date: today(), CreatedBy: session.employeeId });
  items.forEach((item) => appendRow('BillItems', { BillID: billId, MedicineID: sanitizeText(item.MedicineID), Quantity: Number(item.Quantity), Price: Number(item.Price) }));
  return { BillID: billId, TotalAmount: total };
}

function sendInvoiceEmail(payload) {
  if (!payload.Email) throw new Error('Customer email is required.');
  const html = '<h2>' + CONFIG.SHOP_NAME + '</h2><p>' + CONFIG.SHOP_ADDRESS + '</p><p>Invoice: ' + sanitizeText(payload.BillID) + '</p><p>Total: ₹' + Number(payload.TotalAmount).toFixed(2) + '</p>';
  const pdf = Utilities.newBlob(html, 'text/html', 'invoice.html').getAs('application/pdf').setName(payload.BillID + '.pdf');
  MailApp.sendEmail({ to: sanitizeEmail(payload.Email), subject: 'Invoice ' + payload.BillID + ' - ' + CONFIG.SHOP_NAME, htmlBody: html, attachments: [pdf] });
  return true;
}

function backup() {
  return Object.keys(SHEETS).reduce((data, name) => (data[name] = getRows(name), data), {});
}

function getRows(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];
  return values.filter((row) => row.some((cell) => cell !== '')).map((row) => headers.reduce((obj, header, index) => (obj[header] = row[index], obj), {}));
}

function appendRow(sheetName, object) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const headers = SHEETS[sheetName];
  sheet.appendRow(headers.map((header) => object[header] || ''));
}

function upsertRow(sheetName, key, id, object) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const rows = getRows(sheetName);
  const index = rows.findIndex((row) => row[key] === id);
  const values = SHEETS[sheetName].map((header) => object[header] || '');
  if (index >= 0) sheet.getRange(index + 2, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
}

function deleteRow(sheetName, key, id) {
  const rows = getRows(sheetName);
  const index = rows.findIndex((row) => row[key] === id);
  if (index >= 0) SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName).deleteRow(index + 2);
}

function audit(action, employeeId, details) {
  appendRow('AuditLogs', { LogID: makeId('LOG'), Action: action, EmployeeID: employeeId || 'PUBLIC', DateTime: new Date().toISOString(), Details: sanitizeText(details || '') });
}

function maskEmployee(row) {
  const clone = Object.assign({}, row);
  delete clone.PasswordHash;
  return clone;
}

function sanitizeText(value) { return String(value || '').replace(/[<>]/g, '').trim(); }
function sanitizeEmail(value) { const email = sanitizeText(value); return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : ''; }
function sanitizePhone(value) { return String(value || '').replace(/\D/g, '').slice(-10); }
function sanitizeRole(value) { return ['Admin', 'Manager', 'Employee'].indexOf(value) >= 0 ? value : 'Employee'; }
function sanitizeStatus(value) { return value === 'Inactive' ? 'Inactive' : 'Active'; }
function makeId(prefix) { return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000); }
function today() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function jsonResponse(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
