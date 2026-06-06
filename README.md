# Bala Ji Medical Store Management Web Application

A responsive medical store inventory, billing, employee, customer, and reporting application for **Bala Ji Medical Store, Lakhimpur, Uttar Pradesh, India**.

## File Structure

```text
index.html          Public medicine search page
login.html          Staff login page
admin.html          Admin reports dashboard
inventory.html      Medicine and stock entry module
billing.html        Billing, invoice, WhatsApp, and email actions
employees.html      Admin-only employee management
customers.html      Customer management
css/style.css       Medical theme, responsive layout, dark mode
js/app.js           Vanilla JavaScript frontend and API client
assets/logo.svg     Medical store logo
Code.gs             Google Apps Script REST API backend
README.md           Setup guide
```

## Features

- Public live medicine search with category filter and A-Z sorting.
- Role-based access for Admin, Manager, Employee, and Public users.
- SHA-256 client-side password hashing before login and employee save.
- Session management with 30-minute inactivity auto logout.
- Inventory management with custom categories and low-stock alerts under 10 units.
- Incoming stock entries that automatically add to current inventory.
- Employee CRUD, activation/deactivation, and role assignment for Admin users.
- Customer management with searchable customer table.
- Billing with subtotal, 12% GST, grand total, invoice preview, print/PDF export, WhatsApp sharing, and Apps Script email support.
- Admin dashboard cards and Chart.js charts.
- Dark mode, CSV export, backup data, audit logs, and notification messages.

## 1. Google Sheet Setup

1. Create a new Google Sheet named `Bala Ji Medical Store Database`.
2. Open **Extensions → Apps Script**.
3. Paste the full contents of `Code.gs` into the Apps Script editor.
4. Save the project.
5. Run the `setupSheets` function once from Apps Script. This creates these sheets:
   - `Employees`
   - `Medicines`
   - `StockHistory`
   - `Customers`
   - `Bills`
   - `BillItems`
   - `AuditLogs`

### Sheet Columns

`Code.gs` creates these headers automatically:

- Employees: `EmployeeID, Name, Username, PasswordHash, Role, Phone, Email, Status, CreatedDate`
- Medicines: `MedicineID, MedicineName, Category, AvailableQuantity, AddedDate, LastUpdated, Remarks`
- StockHistory: `EntryID, MedicineID, QuantityAdded, AddedBy, Date, Remarks`
- Customers: `CustomerID, Name, Phone, Email, Address, DateAdded`
- Bills: `BillID, CustomerID, CustomerName, Phone, Email, TotalAmount, Date, CreatedBy`
- BillItems: `BillID, MedicineID, Quantity, Price`
- AuditLogs: `LogID, Action, EmployeeID, DateTime, Details`

## 2. Create First Admin Login

1. In a browser console or any SHA-256 generator, hash your first admin password.
2. Add a row in the `Employees` sheet:

```text
EmployeeID: EMP-1001
Name: Admin User
Username: admin
PasswordHash: <your SHA-256 hash>
Role: Admin
Phone: 9999999999
Email: admin@example.com
Status: Active
CreatedDate: 2026-06-06
```


For local demo mode only, before configuring Apps Script, the app includes a demo user:

```text
Username: admin
Password: admin123
```

Do not use the demo password in production.

## 3. Apps Script Setup

1. In `Code.gs`, set a strong token:

```javascript
const CONFIG = {
  API_TOKEN: 'replace-with-a-long-random-token',
  SESSION_TTL_SECONDS: 1800,
  GST_RATE: 0.12,
  SHOP_NAME: 'Bala Ji Medical Store',
  SHOP_ADDRESS: 'Lakhimpur, Uttar Pradesh, India'
};
```

2. Keep the Apps Script attached to the Google Sheet so `SpreadsheetApp.getActiveSpreadsheet()` works.
3. Run `setupSheets` and accept the permission prompts.
4. Optional: run a small test by opening the web app URL after deployment. It should show an API running JSON message.

## 4. Deployment Steps

1. In Apps Script, click **Deploy → New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to `Me`.
4. Set **Who has access** to `Anyone with the link`.
5. Deploy and copy the Web App URL.
6. Open `js/app.js` and update:

```javascript
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzqgM0eXjZpdb-Xj4FFupMAGXPmxj6HcwxhqQglWSKK_SjpXADjUdO-jXB19StIbtvk/exec',
  API_TOKEN: '1i17gFh-FrxCx0AFsyJ5aAY71MdTCbPFfQqmygiAYbaA'
};
```

The `API_TOKEN` in `js/app.js` must match `Code.gs`.

## 5. API Configuration

The frontend sends JSON requests with:

- `action`: API action name.
- `token`: shared API token.
- `sessionToken`: login session token for protected actions.
- `csrf`: browser CSRF nonce.
- `payload`: request data.

Supported actions include:

- `bootstrap`
- `login`
- `saveEmployee`
- `deleteEmployee`
- `saveMedicine`
- `deleteMedicine`
- `addStock`
- `saveCustomer`
- `createBill`
- `sendInvoiceEmail`
- `backup`

## 6. Security Setup

This application implements practical security controls for a static frontend plus Apps Script backend:

- Passwords are SHA-256 hashed before being sent or stored.
- Apps Script validates a shared API token.
- Session tokens are generated server-side and stored in Apps Script CacheService.
- Protected actions require a valid session token.
- Role-based permissions are enforced in both frontend navigation and Apps Script actions.
- User output is escaped in the browser to reduce XSS risk.
- Apps Script sanitizes text, phone, email, role, and status values.
- The app stores only session metadata in `sessionStorage`, not plain passwords.
- Auto logout occurs after 30 minutes of inactivity.

Production recommendations:

1. Use a strong random `API_TOKEN` and rotate it periodically.
2. Restrict Google Sheet sharing to trusted owners only.
3. Create individual accounts for all staff.
4. Never store plain-text passwords in the sheet.
5. Prefer HTTPS hosting for all frontend files.
6. Review `AuditLogs` regularly.

## 7. Hosting Instructions

Because this is a static frontend, you can host it on:

- GitHub Pages
- Netlify
- Vercel
- Firebase Hosting
- Any secure static web server

Upload these files and folders together:

```text
*.html
css/
js/
assets/
```

`Code.gs` stays in Google Apps Script and is not hosted with the static website.

## 8. Billing, WhatsApp, and Email

### WhatsApp

After invoice generation, the **Send on WhatsApp** button opens:

```text
https://wa.me/91XXXXXXXXXX?text=InvoiceData
```

The phone number is taken from the customer phone field.

### Email

The **Send Invoice Email** button calls the Apps Script `sendInvoiceEmail` action. Apps Script uses `MailApp.sendEmail` and attaches a generated PDF invoice.

If the API is not configured, the frontend shows a warning instead of sending email.

## 9. Troubleshooting

### Login fails

- Confirm the employee status is `Active`.
- Confirm the password hash in the sheet is SHA-256 of the password.
- Confirm `API_TOKEN` matches in `Code.gs` and `js/app.js`.

### API says session expired

- Login again.
- Increase `SESSION_TTL_SECONDS` in `Code.gs` if needed.

### Emails do not send

- Run Apps Script once manually to authorize `MailApp`.
- Confirm the customer email is valid.
- Check Apps Script execution logs.

### Public inventory works but admin data is empty

- Public bootstrap only returns medicines.
- Login with a valid account to load protected employee, customer, bill, and bill item data.

### CORS or fetch problems

- Deploy Apps Script as a Web App.
- Use the `/exec` deployment URL.
- Keep request headers simple; the provided frontend uses `Content-Type: text/plain` to avoid unnecessary preflight issues.

## Development Notes

- The app uses Bootstrap 5 through CDN links.
- The dashboard uses Chart.js through a CDN link.
- Local demo mode uses `localStorage` until a real Apps Script URL is configured.
- The database source of truth in production is Google Sheets.
