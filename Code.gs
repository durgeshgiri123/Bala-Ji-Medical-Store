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
  Bills: ['BillID', 'CustomerID', 'CustomerName', 'Phone', 'Email', 'TotalAmount', 'Subtotal', 'GSTAmount', 'ApplyGST', 'PaymentMethod', 'PaymentStatus', 'Date', 'CreatedBy'],
  BillItems: ['BillID', 'MedicineID', 'Quantity', 'Price'],
  Prescriptions: ['PrescriptionID', 'DoctorID', 'DoctorName', 'CustomerID', 'CustomerName', 'Medicines', 'Notes', 'Date'],
  AuditLogs: ['LogID', 'UserID', 'UserRole', 'Action', 'Details', 'DateTime']
};

const ROLE_PERMISSIONS = {
  Admin: ['bootstrap', 'saveEmployee', 'deleteEmployee', 'saveMedicine', 'deleteMedicine', 'addStock', 'saveCustomer', 'createBill', 'sendInvoiceEmail', 'savePrescription', 'logout', 'backup'],
  Manager: ['bootstrap', 'saveMedicine', 'addStock', 'saveCustomer', 'createBill', 'sendInvoiceEmail', 'logout'],
  Employee: ['bootstrap', 'saveMedicine', 'addStock', 'saveCustomer', 'createBill', 'sendInvoiceEmail', 'logout'],
  Doctor: ['bootstrap', 'saveCustomer', 'savePrescription', 'sendInvoiceEmail', 'logout']
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
    const handlers = { saveEmployee, deleteEmployee, saveMedicine, deleteMedicine, addStock, saveCustomer, createBill, sendInvoiceEmail, savePrescription, logout, backup };
    if (!handlers[action]) throw new Error('Unknown action.');
    const data = handlers[action](payload, session);
    audit(action, session.employeeId, session.role, JSON.stringify(payload).slice(0, 500));
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
    sheet.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]);
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
    data.prescriptions = getRows('Prescriptions');
    data.auditLogs = session.role === 'Admin' ? getRows('AuditLogs').slice(-50).reverse() : [];
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
  audit('login', employee.EmployeeID, employee.Role, 'Successful login');
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
  const allowDuplicate = session.role === 'Admin' && payload.AllowDuplicate === 'on';
  const id = payload.EmployeeID || makeId('EMP');
  const existing = rows.find((row) => row.EmployeeID === id);
  const duplicate = rows.find((row) => row.EmployeeID !== id && (row.Username === sanitizeText(payload.Username) || (payload.Phone && String(row.Phone) === sanitizePhone(payload.Phone)) || (payload.Email && String(row.Email).toLowerCase() === sanitizeEmail(payload.Email).toLowerCase())));
  if (duplicate && !allowDuplicate) throw new Error('Employee already exists.');
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

function saveMedicine(payload, session) {
  const id = payload.MedicineID || makeId('MED');
  const rows = getRows('Medicines');
  const existing = rows.find((row) => row.MedicineID === id);
  const duplicate = rows.find((row) => row.MedicineID !== id && String(row.MedicineName).toLowerCase() === sanitizeText(payload.MedicineName).toLowerCase() && String(row.Category).toLowerCase() === sanitizeText(payload.Category).toLowerCase());
  const allowDuplicate = session.role === 'Admin' && payload.AllowDuplicateMedicine === 'on';
  if (duplicate && !allowDuplicate) throw new Error('Medicine already exists.');
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

function deleteMedicine(payload, session) {
  if (session.role !== 'Admin') throw new Error('Only Admin can delete medicines.');
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
  if (!payload.PaymentConfirmed) throw new Error('Payment must be confirmed before invoice generation.');
  if (['UPI', 'Cash'].indexOf(payload.PaymentMethod) < 0) throw new Error('Valid payment method is required.');
  const customer = saveCustomer({ Name: payload.CustomerName, Phone: payload.Phone, Email: payload.Email, Address: '' });
  const billId = payload.BillID || makeId('BILL');
  const items = payload.items || [];
  if (!items.length) throw new Error('Bill requires at least one item.');
  const medicines = getRows('Medicines');
  items.forEach((item) => {
    const medicine = medicines.find((row) => row.MedicineID === item.MedicineID);
    if (!medicine || Number(item.Quantity) > Number(medicine.AvailableQuantity || 0)) throw new Error('Insufficient stock available.');
  });
  const subtotal = items.reduce((sum, item) => sum + Number(item.Quantity) * Number(item.Price), 0);
  const gstAmount = payload.ApplyGST ? subtotal * CONFIG.GST_RATE : 0;
  const total = subtotal + gstAmount;
  items.forEach((item) => {
    const medicine = medicines.find((row) => row.MedicineID === item.MedicineID);
    medicine.AvailableQuantity = Number(medicine.AvailableQuantity || 0) - Number(item.Quantity);
    medicine.LastUpdated = today();
    upsertRow('Medicines', 'MedicineID', medicine.MedicineID, medicine);
    appendRow('BillItems', { BillID: billId, MedicineID: sanitizeText(item.MedicineID), Quantity: Number(item.Quantity), Price: Number(item.Price) });
    appendRow('StockHistory', { EntryID: makeId('SALE'), MedicineID: sanitizeText(item.MedicineID), QuantityAdded: -Number(item.Quantity), AddedBy: session.employeeId, Date: today(), Remarks: 'Sold via invoice ' + billId });
  });
  audit('Payment Confirmation', session.employeeId, session.role, payload.PaymentMethod + ' payment confirmed for ' + billId);
  appendRow('Bills', { BillID: billId, CustomerID: customer.CustomerID, CustomerName: customer.Name, Phone: customer.Phone, Email: customer.Email, TotalAmount: total, Subtotal: subtotal, GSTAmount: gstAmount, ApplyGST: payload.ApplyGST ? 'Yes' : 'No', PaymentMethod: payload.PaymentMethod, PaymentStatus: 'Paid', Date: new Date().toISOString(), CreatedBy: session.employeeId });
  return { BillID: billId, TotalAmount: total, Subtotal: subtotal, GSTAmount: gstAmount, PaymentMethod: payload.PaymentMethod };
}

function savePrescription(payload, session) {
  if (['Doctor', 'Admin'].indexOf(session.role) < 0) throw new Error('Only Doctor or Admin can create prescriptions.');
  const row = { PrescriptionID: payload.PrescriptionID || makeId('RX'), DoctorID: session.employeeId, DoctorName: session.name, CustomerID: sanitizeText(payload.CustomerID || ''), CustomerName: sanitizeText(payload.CustomerName), Medicines: sanitizeText(payload.Medicines), Notes: sanitizeText(payload.Notes), Date: new Date().toISOString() };
  appendRow('Prescriptions', row);
  return row;
}

function logout(payload, session) {
  audit('logout', session.employeeId, session.role, 'User logout');
  return true;
}

function sendInvoiceEmail(payload) {
  if (!payload.Email) throw new Error('Customer email is required.');
  const rows = (payload.items || []).map((item) => '<tr><td>' + sanitizeText(item.MedicineName || item.MedicineID) + '</td><td>' + Number(item.Quantity) + '</td><td>₹' + Number(item.Price).toFixed(2) + '</td><td>₹' + (Number(item.Quantity) * Number(item.Price)).toFixed(2) + '</td></tr>').join('');
  const html = '<div style="font-family:Arial,sans-serif;color:#222"><h2 style="color:#0D6EFD;margin-bottom:0">' + CONFIG.SHOP_NAME + '</h2><p>' + CONFIG.SHOP_ADDRESS + '</p><hr><p><strong>Invoice:</strong> ' + sanitizeText(payload.BillID) + '<br><strong>Date:</strong> ' + sanitizeText(payload.Date || new Date().toISOString()) + '<br><strong>Customer:</strong> ' + sanitizeText(payload.CustomerName) + '<br><strong>Phone:</strong> ' + sanitizePhone(payload.Phone) + '<br><strong>Payment:</strong> ' + sanitizeText(payload.PaymentMethod || '') + '</p><table width="100%" border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Medicine</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>' + rows + '</tbody></table><h3 style="text-align:right">Subtotal: ₹' + Number(payload.Subtotal || 0).toFixed(2) + '<br>GST: ₹' + Number(payload.GSTAmount || 0).toFixed(2) + '<br>Grand Total: ₹' + Number(payload.TotalAmount).toFixed(2) + '</h3></div>';
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

function audit(action, employeeId, roleOrDetails, maybeDetails) {
  const role = maybeDetails === undefined ? '' : roleOrDetails;
  const details = maybeDetails === undefined ? roleOrDetails : maybeDetails;
  appendRow('AuditLogs', { LogID: makeId('LOG'), UserID: employeeId || 'PUBLIC', UserRole: role || '', Action: action, Details: sanitizeText(details || ''), DateTime: new Date().toISOString() });
}

function maskEmployee(row) {
  const clone = Object.assign({}, row);
  delete clone.PasswordHash;
  return clone;
}

function sanitizeText(value) { return String(value || '').replace(/[<>]/g, '').trim(); }
function sanitizeEmail(value) { const email = sanitizeText(value); return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : ''; }
function sanitizePhone(value) { return String(value || '').replace(/\D/g, '').slice(-10); }
function sanitizeRole(value) { return ['Admin', 'Manager', 'Employee', 'Doctor'].indexOf(value) >= 0 ? value : 'Employee'; }
function sanitizeStatus(value) { return value === 'Inactive' ? 'Inactive' : 'Active'; }
function makeId(prefix) { return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000); }
function today() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function jsonResponse(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
