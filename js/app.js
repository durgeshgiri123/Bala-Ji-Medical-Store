/* =========================================================
   app.js — Bala Ji Medical Store
   Shared utilities: toast, modal helpers, theme, sidebar,
   Google Sheets API wrapper, constants
   ========================================================= */

'use strict';

// ── Config ────────────────────────────────────────────────
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzLE8uPtiaq9BO8s49XYD4fHgCWq3wOq-t4XgpUYya9KBkVhwX3KFhZjLHUmnTR091Yrg/exec',
  STORE_NAME:      'Bala Ji Medical Store',
  STORE_ADDRESS:   'Main Market, Lakhimpur, Uttar Pradesh 262701',
  STORE_PHONE:     '+91-9792300332',
  STORE_EMAIL:     'balajimedicalstorelmp@gmail.com',
  GST_NO:          'GSTIN: XXXXXXXXXXXX',
  LOW_STOCK_THRESHOLD: 10,
  PAGE_SIZE:       15,
  VERSION:         '1.0.0',
};

// ── Medicine Categories ────────────────────────────────────
const MEDICINE_CATEGORIES = [
  'Tablet','Injection','Drop','Tube','Syrup',
  'Bandage','Powder','Others'
];

// ── Employee Roles ────────────────────────────────────────
const EMPLOYEE_ROLES = [
  'Admin','Manager','Pharmacist','Sales Staff','Cashier','Store Keeper'
];

// ── Local Storage Keys ────────────────────────────────────
const LS = {
  USER:      'bj_user',
  TOKEN:     'bj_token',
  THEME:     'bj_theme',
  REMEMBER:  'bj_remember',
};

// ── API Layer ─────────────────────────────────────────────
const API = {
  async call(action, data = {}) {
    const body = new FormData();
    body.append('action', action);
    body.append('data', JSON.stringify(data));
    try {
      const res = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[API]', action, err);
      return { success: false, error: err.message };
    }
  },

  // Auth
  login: (email, password)           => API.call('login',          { email, password }),
  forgotPassword: (email)            => API.call('forgotPassword', { email }),

  // Employees
  getEmployees:   ()                 => API.call('getEmployees'),
  addEmployee:    (emp)              => API.call('addEmployee',     emp),
  updateEmployee: (emp)              => API.call('updateEmployee',  emp),
  toggleEmployee: (id, status)      => API.call('toggleEmployee',  { id, status }),

  // Medicines
  getMedicines:   ()                 => API.call('getMedicines'),
  addMedicine:    (med)              => API.call('addMedicine',     med),
  updateMedicine: (med)              => API.call('updateMedicine',  med),
  updateStock:    (id, qty, emp)     => API.call('updateStock',     { id, qty, emp }),

  // Stock History
  getStockHistory: ()                => API.call('getStockHistory'),

  // Billing
  saveBill:       (bill)             => API.call('saveBill',        bill),
  getBills:       (from, to)         => API.call('getBills',        { from, to }),
  getBillItems:   (invoiceNo)        => API.call('getBillItems',    { invoiceNo }),

  // Reports
  getReport:      (type, from, to)   => API.call('getReport',       { type, from, to }),
  getDashboard:   ()                 => API.call('getDashboard'),
};

// ── Auth Helpers ──────────────────────────────────────────
const Auth = {
  getUser() {
    try { return JSON.parse(localStorage.getItem(LS.USER) || 'null'); }
    catch { return null; }
  },
  setUser(u)  { localStorage.setItem(LS.USER,  JSON.stringify(u)); },
  clear()     { localStorage.removeItem(LS.USER); localStorage.removeItem(LS.TOKEN); },
  isLoggedIn(){ return !!this.getUser(); },
  isAdmin()   { const u = this.getUser(); return u && u.role === 'Admin'; },
  isManager() { const u = this.getUser(); return u && (u.role === 'Admin' || u.role === 'Manager'); },

  requireLogin() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  },
  requireAdmin() {
    if (!this.isAdmin()) {
      Toast.error('Admin access required.');
      setTimeout(() => window.location.href = 'dashboard.html', 1500);
      return false;
    }
    return true;
  },
};

// ── Toast ─────────────────────────────────────────────────
const Toast = {
  _container: null,
  _ensure() {
    if (!this._container) {
      this._container = document.getElementById('toast-container');
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.id = 'toast-container';
        document.body.appendChild(this._container);
      }
    }
  },
  show(msg, type = 'info', duration = 3500) {
    this._ensure();
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <span class="toast-msg">${msg}</span>
      <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;
    this._container.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 350);
    }, duration);
  },
  success: (m, d) => Toast.show(m, 'success', d),
  error:   (m, d) => Toast.show(m, 'error',   d),
  warning: (m, d) => Toast.show(m, 'warning', d),
  info:    (m, d) => Toast.show(m, 'info',    d),
};

// ── Loading ───────────────────────────────────────────────
const Loader = {
  show() {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.remove('hidden');
  },
  hide() {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.add('hidden');
  },
};

// ── Theme ─────────────────────────────────────────────────
const Theme = {
  init() {
    const saved = localStorage.getItem(LS.THEME) || 'light';
    this.apply(saved);
  },
  apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(LS.THEME, t);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
  },
  toggle() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    this.apply(cur === 'dark' ? 'light' : 'dark');
  },
};

// ── Sidebar ───────────────────────────────────────────────
const Sidebar = {
  init() {
    // Mobile toggle
    const toggleBtn = document.getElementById('sidebar-toggle');
    const overlay   = document.getElementById('sidebar-overlay');
    const sidebar   = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
      });
    }
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
    // Collapse toggle (desktop)
    const colBtn = document.getElementById('collapse-sidebar');
    if (colBtn && sidebar) {
      colBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    }
    // Mark active link
    const cur = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link[data-page]').forEach(a => {
      if (a.dataset.page === cur) a.classList.add('active');
    });
    // Render user info
    const user = Auth.getUser();
    if (user) {
      const nameEl = document.getElementById('sidebar-user-name');
      const roleEl = document.getElementById('sidebar-user-role');
      const avEl   = document.getElementById('sidebar-user-av');
      if (nameEl) nameEl.textContent = user.name;
      if (roleEl) roleEl.textContent = user.role;
      if (avEl)   avEl.textContent   = user.name?.charAt(0).toUpperCase() || 'U';
    }
    // Admin-only elements
    if (!Auth.isAdmin()) {
      document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
    }
    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      Auth.clear();
      window.location.href = 'login.html';
    });
  },
};

// ── Utilities ─────────────────────────────────────────────
const Utils = {
  formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  },
  formatCurrency(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  today() { return new Date().toISOString().split('T')[0]; },
  isExpired(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  },
  isExpiringSoon(dateStr, days = 30) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const limit = new Date(); limit.setDate(limit.getDate() + days);
    return d > new Date() && d < limit;
  },
  generateId(prefix) {
    return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
  },
  generateInvoiceNo() {
    const d = new Date();
    return 'INV-' + d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + String(Math.floor(Math.random()*9000)+1000);
  },
  debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  },
  sanitize(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  },
  getStatusBadge(status) {
    const map = {
      'Available':    '<span class="badge badge-success">✓ Available</span>',
      'Low Stock':    '<span class="badge badge-warning">⚠ Low Stock</span>',
      'Out of Stock': '<span class="badge badge-danger">✕ Out of Stock</span>',
      'Expired':      '<span class="badge badge-secondary">⊘ Expired</span>',
    };
    return map[status] || `<span class="badge badge-secondary">${status}</span>`;
  },
  getMedStatus(qty, expiry, threshold = CONFIG.LOW_STOCK_THRESHOLD) {
    if (Utils.isExpired(expiry)) return 'Expired';
    if (qty <= 0)                return 'Out of Stock';
    if (qty <= threshold)        return 'Low Stock';
    return 'Available';
  },
  categoryOptions() {
    return MEDICINE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  },
  roleOptions() {
    return EMPLOYEE_ROLES.map(r => `<option value="${r}">${r}</option>`).join('');
  },
};

// ── Pagination Helper ─────────────────────────────────────
function buildPagination(totalItems, currentPage, pageSize, onPage) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const wrap = document.createElement('div');
  wrap.className = 'pagination';

  const mkBtn = (label, page, disabled = false, active = false) => {
    const b = document.createElement('button');
    b.className = 'page-btn' + (active ? ' active' : '');
    b.textContent = label;
    b.disabled = disabled;
    if (!disabled && !active) b.onclick = () => onPage(page);
    wrap.appendChild(b);
  };

  mkBtn('«', 1,               currentPage <= 1);
  mkBtn('‹', currentPage - 1, currentPage <= 1);

  let start = Math.max(1, currentPage - 2);
  let end   = Math.min(totalPages, start + 4);
  start     = Math.max(1, end - 4);

  for (let i = start; i <= end; i++) mkBtn(i, i, false, i === currentPage);

  mkBtn('›', currentPage + 1, currentPage >= totalPages);
  mkBtn('»', totalPages,      currentPage >= totalPages);

  const info = document.createElement('span');
  info.style.cssText = 'font-size:12px;color:var(--text-muted);margin:0 8px;white-space:nowrap';
  info.textContent   = `${Math.min((currentPage-1)*pageSize+1, totalItems)}–${Math.min(currentPage*pageSize, totalItems)} of ${totalItems}`;
  wrap.appendChild(info);

  return wrap;
}

// ── Sortable Table Helper ─────────────────────────────────
function initSortableTable(tableId, data, renderFn) {
  let sortCol = null, sortDir = 1;
  const table = document.getElementById(tableId);
  if (!table) return;
  table.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) { sortDir *= -1; } else { sortCol = col; sortDir = 1; }
      table.querySelectorAll('th.sortable').forEach(t => t.classList.remove('sort-asc','sort-desc'));
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
      data.sort((a,b) => {
        const va = a[col] ?? '', vb = b[col] ?? '';
        if (!isNaN(va) && !isNaN(vb)) return sortDir * (Number(va) - Number(vb));
        return sortDir * String(va).localeCompare(String(vb));
      });
      renderFn(data);
    });
  });
}

// ── Shared sidebar HTML template ─────────────────────────
function getSidebarHTML(activePage) {
  const user = Auth.getUser();
  const isAdmin = Auth.isAdmin();

  return `
  <div id="sidebar" class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-icon">💊</div>
      <div class="brand-text">
        <div class="brand-name">Bala Ji Medical</div>
        <div class="brand-sub">Lakhimpur, U.P.</div>
      </div>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-section-label">Main</div>
      <div class="nav-item">
        <a class="nav-link${activePage==='dashboard.html'?' active':''}" data-page="dashboard.html" href="dashboard.html">
          <span class="nav-icon">🏠</span><span>Dashboard</span>
        </a>
      </div>
      <div class="nav-item">
        <a class="nav-link${activePage==='inventory.html'?' active':''}" data-page="inventory.html" href="inventory.html">
          <span class="nav-icon">💊</span><span>Inventory</span>
        </a>
      </div>
      <div class="nav-item">
        <a class="nav-link${activePage==='billing.html'?' active':''}" data-page="billing.html" href="billing.html">
          <span class="nav-icon">🧾</span><span>Billing</span>
        </a>
      </div>

      <div class="nav-section-label">Management</div>
      ${isAdmin ? `
      <div class="nav-item" data-admin-only>
        <a class="nav-link${activePage==='employees.html'?' active':''}" data-page="employees.html" href="employees.html">
          <span class="nav-icon">👥</span><span>Employees</span>
        </a>
      </div>
      <div class="nav-item" data-admin-only>
        <a class="nav-link${activePage==='reports.html'?' active':''}" data-page="reports.html" href="reports.html">
          <span class="nav-icon">📊</span><span>Reports</span>
        </a>
      </div>` : ''}
    </nav>

    <div class="sidebar-footer">
      <div class="user-card">
        <div class="user-avatar" id="sidebar-user-av">${user?.name?.charAt(0) || 'U'}</div>
        <div class="user-info">
          <div class="user-name" id="sidebar-user-name">${user?.name || 'User'}</div>
          <div class="user-role" id="sidebar-user-role">${user?.role || ''}</div>
        </div>
      </div>
      <button id="logout-btn" class="btn btn-ghost w-100 mt-0" style="margin-top:8px;justify-content:center;color:rgba(255,255,255,.5);font-size:12px;">
        🚪 Logout
      </button>
    </div>
  </div>
  <div id="sidebar-overlay" class="sidebar-overlay"></div>`;
}

// ── Common Topbar ─────────────────────────────────────────
function getTopbarHTML(title) {
  return `
  <div class="topbar">
    <button id="sidebar-toggle" class="icon-btn" style="display:none" title="Menu">☰</button>
    <div class="topbar-title">${title}</div>
    <div class="topbar-actions">
      <button id="theme-toggle" class="icon-btn" title="Toggle theme" onclick="Theme.toggle()">🌙</button>
    </div>
  </div>`;
}

// ── Loading HTML ──────────────────────────────────────────
function getLoadingHTML() {
  return `
  <div id="loading-overlay" class="hidden">
    <div class="spinner"></div>
    <div class="loading-text">Loading…</div>
  </div>
  <div id="toast-container"></div>`;
}

// ── Init on load ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  // Show mobile toggle if needed
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (toggleBtn) {
    const checkMobile = () => { toggleBtn.style.display = window.innerWidth < 993 ? 'flex' : 'none'; };
    checkMobile();
    window.addEventListener('resize', checkMobile);
  }
});
