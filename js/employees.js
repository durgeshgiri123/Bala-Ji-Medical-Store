/* =========================================================
   employees.js — Employee Management (Admin only)
   ========================================================= */
'use strict';

const Employees = (() => {
  let allEmployees = [];
  let filtered     = [];
  let currentPage  = 1;
  const ps         = CONFIG.PAGE_SIZE;

  // ── Init ───────────────────────────────────────────────
  async function init() {
    if (!Auth.requireLogin()) return;
    if (!Auth.requireAdmin()) return;
    Sidebar.init();
    await loadEmployees();
    bindEvents();
  }

  // ── Load ───────────────────────────────────────────────
  async function loadEmployees() {
    Loader.show();
    const res = await API.getEmployees();
    Loader.hide();
    if (res.success) {
      allEmployees = res.data || [];
      applyFilters();
      updateStats();
    } else {
      Toast.error('Failed to load employees: ' + (res.error || ''));
    }
  }

  // ── Stats ──────────────────────────────────────────────
  function updateStats() {
    const total  = allEmployees.length;
    const active = allEmployees.filter(e => e.Status === 'Active').length;
    document.getElementById('stat-total-emp')?.setAttribute('data-val', total);
    document.getElementById('stat-active-emp')?.setAttribute('data-val', active);
    document.getElementById('stat-inactive-emp')?.setAttribute('data-val', total - active);
    animateCounters();
  }

  function animateCounters() {
    document.querySelectorAll('[data-val]').forEach(el => {
      const target = parseInt(el.dataset.val) || 0;
      let cur = 0;
      const step = Math.ceil(target / 20);
      const t = setInterval(() => {
        cur = Math.min(cur + step, target);
        el.textContent = cur;
        if (cur >= target) clearInterval(t);
      }, 30);
    });
  }

  // ── Filter ─────────────────────────────────────────────
  function applyFilters() {
    const q    = (document.getElementById('emp-search')?.value || '').toLowerCase();
    const role = document.getElementById('emp-role-filter')?.value || '';
    const stat = document.getElementById('emp-status-filter')?.value || '';

    filtered = allEmployees.filter(e => {
      const matchQ    = !q    || e.Name?.toLowerCase().includes(q) || e.Email?.toLowerCase().includes(q) || e.Phone?.includes(q);
      const matchRole = !role || e.Role === role;
      const matchStat = !stat || e.Status === stat;
      return matchQ && matchRole && matchStat;
    });

    currentPage = 1;
    renderTable();
  }

  // ── Render Table ───────────────────────────────────────
  function renderTable() {
    const tbody  = document.getElementById('emp-tbody');
    const pagWrap= document.getElementById('emp-pagination');
    if (!tbody) return;

    const start = (currentPage - 1) * ps;
    const page  = filtered.slice(start, start + ps);

    if (!page.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">No employees found.</td></tr>`;
    } else {
      tbody.innerHTML = page.map(e => {
        const isActive = e.Status === 'Active';
        return `
        <tr>
          <td><code style="font-size:11px;background:var(--bg);padding:2px 6px;border-radius:4px">${Utils.sanitize(e.EmployeeID)}</code></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary-light),var(--accent));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0">${e.Name?.charAt(0) || '?'}</div>
              <div>
                <div style="font-weight:600">${Utils.sanitize(e.Name)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${Utils.sanitize(e.Email)}</div>
              </div>
            </div>
          </td>
          <td>${Utils.sanitize(e.Phone || '—')}</td>
          <td><span class="badge badge-info">${Utils.sanitize(e.Role)}</span></td>
          <td>${Utils.formatDate(e.JoiningDate)}</td>
          <td>${isActive
            ? '<span class="badge badge-success">✓ Active</span>'
            : '<span class="badge badge-secondary">⊘ Inactive</span>'}</td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn-sm btn-outline-primary" onclick="Employees.openEdit('${e.EmployeeID}')">✏️ Edit</button>
              <button class="btn btn-sm ${isActive ? 'btn-warning' : 'btn-success'}"
                onclick="Employees.toggleStatus('${e.EmployeeID}','${isActive ? 'Inactive' : 'Active'}','${Utils.sanitize(e.Name)}')">
                ${isActive ? '🔒 Disable' : '🔓 Enable'}
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    if (pagWrap) {
      pagWrap.innerHTML = '';
      pagWrap.appendChild(buildPagination(filtered.length, currentPage, ps, p => { currentPage = p; renderTable(); }));
    }
  }

  // ── Bind Events ────────────────────────────────────────
  function bindEvents() {
    document.getElementById('btn-add-employee')?.addEventListener('click', openAdd);
    document.getElementById('employee-form')?.addEventListener('submit', handleSave);
    const debounced = Utils.debounce(applyFilters, 300);
    document.getElementById('emp-search')?.addEventListener('input', debounced);
    document.getElementById('emp-role-filter')?.addEventListener('change', applyFilters);
    document.getElementById('emp-status-filter')?.addEventListener('change', applyFilters);

    // Role filter options
    const roleFilter = document.getElementById('emp-role-filter');
    if (roleFilter) roleFilter.innerHTML = '<option value="">All Roles</option>' + Utils.roleOptions();

    // Form role select
    const formRole = document.getElementById('emp-role');
    if (formRole) formRole.innerHTML = Utils.roleOptions();
  }

  // ── Open Add ───────────────────────────────────────────
  function openAdd() {
    document.getElementById('emp-modal-title').textContent = '➕ Add New Employee';
    document.getElementById('employee-form').reset();
    document.getElementById('emp-id-field').value = '';
    document.getElementById('emp-joining').value  = Utils.today();
    document.getElementById('emp-role').value     = 'Pharmacist';
    openModal('employee-modal');
  }

  // ── Open Edit ──────────────────────────────────────────
  function openEdit(id) {
    const e = allEmployees.find(x => x.EmployeeID === id);
    if (!e) return;
    document.getElementById('emp-modal-title').textContent = '✏️ Edit Employee';
    const fields = {
      'emp-id-field': e.EmployeeID,
      'emp-name':     e.Name,
      'emp-email':    e.Email,
      'emp-phone':    e.Phone,
      'emp-address':  e.Address,
      'emp-joining':  e.JoiningDate,
      'emp-role':     e.Role,
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    });
    openModal('employee-modal');
  }

  // ── Save ───────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault();
    const isEdit = !!document.getElementById('emp-id-field').value;
    const name   = document.getElementById('emp-name').value.trim();
    const email  = document.getElementById('emp-email').value.trim();
    const phone  = document.getElementById('emp-phone').value.trim();
    const pass   = document.getElementById('emp-password').value;

    if (!name)  { Toast.warning('Name is required.'); return; }
    if (!email || !/\S+@\S+\.\S+/.test(email)) { Toast.warning('Valid email required.'); return; }
    if (!phone || !/^\d{10}$/.test(phone)) { Toast.warning('10-digit mobile required.'); return; }
    if (!isEdit && !pass) { Toast.warning('Password is required for new employee.'); return; }

    // Check duplicate email
    if (!isEdit && allEmployees.find(e => e.Email.toLowerCase() === email.toLowerCase())) {
      Toast.error('An employee with this email already exists.'); return;
    }

    const data = {
      EmployeeID:  isEdit ? document.getElementById('emp-id-field').value : Utils.generateId('EMP'),
      Name:        name,
      Email:       email,
      Phone:       phone,
      Address:     document.getElementById('emp-address').value.trim(),
      JoiningDate: document.getElementById('emp-joining').value,
      Role:        document.getElementById('emp-role').value,
      Status:      'Active',
    };
    if (pass) data.Password = pass;

    Loader.show();
    const res = isEdit ? await API.updateEmployee(data) : await API.addEmployee(data);
    Loader.hide();

    if (res.success) {
      Toast.success(isEdit ? 'Employee updated!' : 'Employee added!');
      closeModal('employee-modal');
      await loadEmployees();
    } else {
      Toast.error(res.error || 'Failed to save employee.');
    }
  }

  // ── Toggle Status ──────────────────────────────────────
  async function toggleStatus(id, newStatus, name) {
    if (!confirm(`${newStatus === 'Inactive' ? 'Disable' : 'Enable'} employee "${name}"?`)) return;
    Loader.show();
    const res = await API.toggleEmployee(id, newStatus);
    Loader.hide();
    if (res.success) {
      Toast.success(`Employee ${newStatus === 'Active' ? 'enabled' : 'disabled'}.`);
      await loadEmployees();
    } else {
      Toast.error(res.error || 'Failed to update status.');
    }
  }

  // ── Modal ──────────────────────────────────────────────
  function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

  return { init, openEdit, toggleStatus, closeModal };
})();

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('active'); });
  });
  if (document.getElementById('emp-tbody')) Employees.init();
});
