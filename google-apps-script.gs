// =========================================================
//  google-apps-script.gs — Bala Ji Medical Store Backend
//  Deploy as: Web App → Execute as Me → Anyone can access
// =========================================================

// ── CONFIGURATION ─────────────────────────────────────────
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // Replace with your Google Sheet ID
const SHEET_NAMES = {
  EMPLOYEES:    'Employees',
  MEDICINES:    'Medicines',
  STOCK_HIST:   'StockHistory',
  CUSTOMERS:    'Customers',
  BILLS:        'Bills',
  BILL_ITEMS:   'BillItems',
};

// ── HTTP ENTRY POINT ──────────────────────────────────────
function doPost(e) {
  const cors = ContentService.createTextOutput();
  try {
    const action = e.parameter.action;
    const data   = JSON.parse(e.parameter.data || '{}');
    const result = dispatch(action, data);
    cors.setContent(JSON.stringify(result));
  } catch (err) {
    cors.setContent(JSON.stringify({ success: false, error: err.message }));
  }
  cors.setMimeType(ContentService.MimeType.JSON);
  return cors;
}

function doGet(e) {
  // Allow GET for testing
  return doPost(e);
}

// ── DISPATCHER ────────────────────────────────────────────
function dispatch(action, data) {
  switch (action) {
    // Auth
    case 'login':           return login(data);
    case 'forgotPassword':  return forgotPassword(data);
    // Employees
    case 'getEmployees':    return getEmployees();
    case 'addEmployee':     return addEmployee(data);
    case 'updateEmployee':  return updateEmployee(data);
    case 'toggleEmployee':  return toggleEmployee(data);
    // Medicines
    case 'getMedicines':    return getMedicines();
    case 'addMedicine':     return addMedicine(data);
    case 'updateMedicine':  return updateMedicine(data);
    case 'updateStock':     return updateStock(data);
    // Stock History
    case 'getStockHistory': return getStockHistory();
    // Billing
    case 'saveBill':        return saveBill(data);
    case 'getBills':        return getBills(data);
    case 'getBillItems':    return getBillItems(data);
    // Email
    case 'sendEmail':       return sendInvoiceEmail(data);
    // Reports
    case 'getReport':       return getReport(data);
    case 'getDashboard':    return getDashboard();
    default:                return { success: false, error: 'Unknown action: ' + action };
  }
}

// ── SHEET HELPERS ─────────────────────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(name);
}

function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] !== undefined ? String(row[i]) : '']))
  );
}

function findRowIndex(sheet, colIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(value)) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

function getHeaderIndex(sheet, header) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.indexOf(header); // 0-indexed
}

// ── AUTH ──────────────────────────────────────────────────
function login(data) {
  const sheet = getSheet(SHEET_NAMES.EMPLOYEES);
  const rows  = sheetToObjects(sheet);
  const emp   = rows.find(e =>
    e.Email?.toLowerCase() === data.email?.toLowerCase() &&
    e.Password === data.password &&
    e.Status === 'Active'
  );
  if (!emp) return { success: false, error: 'Invalid credentials or account inactive.' };
  // Don't send password to frontend
  const { Password, ...safeEmp } = emp;
  return { success: true, user: { ...safeEmp, name: emp.Name, role: emp.Role } };
}

function forgotPassword(data) {
  const sheet = getSheet(SHEET_NAMES.EMPLOYEES);
  const rows  = sheetToObjects(sheet);
  const emp   = rows.find(e => e.Email?.toLowerCase() === data.email?.toLowerCase());
  if (!emp) return { success: false, error: 'Email not found.' };
  try {
    MailApp.sendEmail({
      to: data.email,
      subject: 'Password Reset — Bala Ji Medical Store',
      body: `Hello ${emp.Name},\n\nYour login password is: ${emp.Password}\n\nPlease change it after login.\n\nBala Ji Medical Store`,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── EMPLOYEES ─────────────────────────────────────────────
function getEmployees() {
  const rows = sheetToObjects(getSheet(SHEET_NAMES.EMPLOYEES));
  return { success: true, data: rows.map(e => { const { Password, ...r } = e; return r; }) };
}

function addEmployee(data) {
  const sheet = getSheet(SHEET_NAMES.EMPLOYEES);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => data[h] || '');
  sheet.appendRow(row);
  return { success: true };
}

function updateEmployee(data) {
  const sheet = getSheet(SHEET_NAMES.EMPLOYEES);
  const colIdx = getHeaderIndex(sheet, 'EmployeeID');
  const rowIdx = findRowIndex(sheet, colIdx, data.EmployeeID);
  if (rowIdx < 0) return { success: false, error: 'Employee not found.' };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  // Only update provided fields, preserve password if not sent
  const existing = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const updated  = headers.map((h, i) => data[h] !== undefined && data[h] !== '' ? data[h] : existing[i]);
  sheet.getRange(rowIdx, 1, 1, headers.length).setValues([updated]);
  return { success: true };
}

function toggleEmployee(data) {
  const sheet  = getSheet(SHEET_NAMES.EMPLOYEES);
  const colIdx = getHeaderIndex(sheet, 'EmployeeID');
  const rowIdx = findRowIndex(sheet, colIdx, data.id);
  if (rowIdx < 0) return { success: false, error: 'Employee not found.' };
  const statCol = getHeaderIndex(sheet, 'Status') + 1;
  sheet.getRange(rowIdx, statCol).setValue(data.status);
  return { success: true };
}

// ── MEDICINES ─────────────────────────────────────────────
function getMedicines() {
  return { success: true, data: sheetToObjects(getSheet(SHEET_NAMES.MEDICINES)).map(m => ({
    ...m, StockQuantity: parseInt(m.StockQuantity) || 0
  }))};
}

function addMedicine(data) {
  const sheet   = getSheet(SHEET_NAMES.MEDICINES);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  data.StockQuantity = 0; // Always start at 0
  sheet.appendRow(headers.map(h => data[h] || ''));
  return { success: true };
}

function updateMedicine(data) {
  const sheet  = getSheet(SHEET_NAMES.MEDICINES);
  const colIdx = getHeaderIndex(sheet, 'MedicineID');
  const rowIdx = findRowIndex(sheet, colIdx, data.MedicineID);
  if (rowIdx < 0) return { success: false, error: 'Medicine not found.' };
  const headers  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const existing = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const updated  = headers.map((h, i) => h === 'StockQuantity' ? existing[i] : (data[h] !== undefined ? data[h] : existing[i]));
  sheet.getRange(rowIdx, 1, 1, headers.length).setValues([updated]);
  return { success: true };
}

function updateStock(data) {
  const sheet  = getSheet(SHEET_NAMES.MEDICINES);
  const colIdx = getHeaderIndex(sheet, 'MedicineID');
  const rowIdx = findRowIndex(sheet, colIdx, data.id);
  if (rowIdx < 0) return { success: false, error: 'Medicine not found.' };

  const qtyCol    = getHeaderIndex(sheet, 'StockQuantity') + 1;
  const nameCol   = getHeaderIndex(sheet, 'MedicineName')  + 1;
  const prevStock = parseInt(sheet.getRange(rowIdx, qtyCol).getValue()) || 0;
  const newStock  = prevStock + parseInt(data.qty);
  if (newStock < 0) return { success: false, error: 'Stock cannot go below 0.' };
  const medName   = sheet.getRange(rowIdx, nameCol).getValue();

  sheet.getRange(rowIdx, qtyCol).setValue(newStock);

  // Log to StockHistory
  const hist = getSheet(SHEET_NAMES.STOCK_HIST);
  hist.appendRow([
    new Date().toISOString(),
    data.id,
    medName,
    prevStock,
    parseInt(data.qty),
    newStock,
    data.emp || 'System',
  ]);

  return { success: true, newStock };
}

// ── STOCK HISTORY ─────────────────────────────────────────
function getStockHistory() {
  const rows = sheetToObjects(getSheet(SHEET_NAMES.STOCK_HIST));
  return { success: true, data: rows.reverse() }; // latest first
}

// ── BILLING ───────────────────────────────────────────────
function saveBill(data) {
  const billSheet  = getSheet(SHEET_NAMES.BILLS);
  const itemsSheet = getSheet(SHEET_NAMES.BILL_ITEMS);
  const custSheet  = getSheet(SHEET_NAMES.CUSTOMERS);

  // Save bill header
  billSheet.appendRow([
    data.InvoiceNo,
    data.Date,
    data.CustomerName,
    data.Mobile,
    data.Email || '',
    data.TotalAmount,
    data.EmployeeName,
  ]);

  // Save bill items & update stock
  (data.Items || []).forEach(item => {
    itemsSheet.appendRow([data.InvoiceNo, item.name, item.qty, item.price, item.qty * item.price]);
    // Decrease stock
    const medSheet = getSheet(SHEET_NAMES.MEDICINES);
    const medRows  = sheetToObjects(medSheet);
    const med      = medRows.find(m => m.MedicineName.toLowerCase() === item.name.toLowerCase());
    if (med) {
      updateStock({ id: med.MedicineID, qty: -parseInt(item.qty), emp: data.EmployeeName });
    }
  });

  // Upsert customer
  try {
    const custRows = sheetToObjects(custSheet);
    const existing = custRows.find(c => c.Mobile === data.Mobile);
    if (!existing) {
      custSheet.appendRow([
        'CUST' + Date.now().toString(36).toUpperCase(),
        data.CustomerName,
        data.Mobile,
        data.Email || '',
      ]);
    }
  } catch(e) {}

  return { success: true };
}

function getBills(data) {
  let rows = sheetToObjects(getSheet(SHEET_NAMES.BILLS));
  if (data.from) rows = rows.filter(b => b.Date >= data.from);
  if (data.to)   rows = rows.filter(b => b.Date <= data.to);
  return { success: true, data: rows.reverse() };
}

function getBillItems(data) {
  const rows = sheetToObjects(getSheet(SHEET_NAMES.BILL_ITEMS));
  return { success: true, data: rows.filter(r => r.InvoiceNo === data.invoiceNo) };
}

// ── EMAIL ─────────────────────────────────────────────────
function sendInvoiceEmail(data) {
  try {
    const itemList = (data.items || []).map(i =>
      `${i.name}  ×  ${i.qty}  =  ₹${(i.qty * i.price).toFixed(2)}`
    ).join('\n');

    const body = `
Dear ${data.custName},

Thank you for shopping at Bala Ji Medical Store!

INVOICE: ${data.invoiceNo}
Date:    ${data.date}

ITEMS:
${itemList}

${data.tax ? `Subtotal: ₹${data.subtotal.toFixed(2)}\nTax:      ₹${data.tax.toFixed(2)}\n` : ''}TOTAL:   ₹${data.grand.toFixed(2)}

Bala Ji Medical Store
Main Market, Lakhimpur, Uttar Pradesh 262701
📞 ${CONFIG_EMAIL_PHONE || '+91-XXXXXXXXXX'}

This is an auto-generated invoice. Medicines once sold cannot be returned.
    `;

    MailApp.sendEmail({
      to:      data.to,
      subject: data.subject,
      body:    body,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── REPORTS ───────────────────────────────────────────────
function getReport(data) {
  const today  = new Date().toISOString().split('T')[0];
  let from = data.from, to = data.to;

  if (data.type === 'daily') {
    from = from || today;
    to   = to   || today;
  } else if (data.type === 'weekly') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    from = from || d.toISOString().split('T')[0];
    to   = to   || today;
  } else if (data.type === 'monthly') {
    const d = new Date();
    d.setDate(1);
    from = from || d.toISOString().split('T')[0];
    to   = to   || today;
  }

  const billRows = sheetToObjects(getSheet(SHEET_NAMES.BILLS)).filter(b => {
    const d = (b.Date || '').split('T')[0];
    return (!from || d >= from) && (!to || d <= to);
  });

  if (data.type === 'medicine') {
    const itemRows = sheetToObjects(getSheet(SHEET_NAMES.BILL_ITEMS));
    const invNos   = new Set(billRows.map(b => b.InvoiceNo));
    const filtered = itemRows.filter(i => invNos.has(i.InvoiceNo));
    const grouped  = {};
    filtered.forEach(i => {
      if (!grouped[i.MedicineName]) grouped[i.MedicineName] = { MedicineName: i.MedicineName, TotalQty: 0, TotalRevenue: 0 };
      grouped[i.MedicineName].TotalQty     += parseInt(i.Quantity) || 0;
      grouped[i.MedicineName].TotalRevenue += parseFloat(i.Total)  || 0;
    });
    const items = Object.values(grouped).sort((a, b) => b.TotalQty - a.TotalQty);
    return { success: true, data: { items } };
  }

  if (data.type === 'stock') {
    const history = sheetToObjects(getSheet(SHEET_NAMES.STOCK_HIST)).filter(h => {
      const d = (h.Date || '').split('T')[0];
      return (!from || d >= from) && (!to || d <= to);
    });
    return { success: true, data: { history } };
  }

  // daily / weekly / monthly
  const customers = new Set(billRows.map(b => b.Mobile)).size;
  const itemRows  = sheetToObjects(getSheet(SHEET_NAMES.BILL_ITEMS));
  const invNos    = new Set(billRows.map(b => b.InvoiceNo));
  const itemsSold = itemRows.filter(i => invNos.has(i.InvoiceNo))
    .reduce((s, i) => s + (parseInt(i.Quantity) || 0), 0);

  return { success: true, data: { bills: billRows, customers, itemsSold } };
}

// ── DASHBOARD ─────────────────────────────────────────────
function getDashboard() {
  const medicines = sheetToObjects(getSheet(SHEET_NAMES.MEDICINES)).map(m => ({
    ...m, StockQuantity: parseInt(m.StockQuantity) || 0
  }));
  const employees = sheetToObjects(getSheet(SHEET_NAMES.EMPLOYEES));
  const today     = new Date().toISOString().split('T')[0];
  const bills     = sheetToObjects(getSheet(SHEET_NAMES.BILLS));
  const todayBills= bills.filter(b => (b.Date || '').split('T')[0] === today);
  const low       = medicines.filter(m => m.StockQuantity > 0 && m.StockQuantity <= 10 && !isExpiredGS(m.ExpiryDate));
  const expired   = medicines.filter(m => isExpiredGS(m.ExpiryDate));

  return {
    success: true,
    data: {
      totalMedicines:  medicines.length,
      totalEmployees:  employees.filter(e => e.Status === 'Active').length,
      lowStock:        low.length,
      expired:         expired.length,
      todayBills:      todayBills.length,
      todayRevenue:    todayBills.reduce((s, b) => s + (parseFloat(b.TotalAmount) || 0), 0),
      medicines:       medicines,
    }
  };
}

function isExpiredGS(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}
