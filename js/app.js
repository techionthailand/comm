/* ═══════════════════════════════════════════════════════
   TECH ION Commission Platform — Frontend App
   API-driven (Node.js + PostgreSQL backend)
   ═══════════════════════════════════════════════════════ */

// ── CONFIG ────────────────────────────────────────────
// In production behind Nginx, API calls are relative (/api/...).
// For local dev, set this to 'http://localhost:3001'
const API_BASE = '';   // leave empty when served behind Nginx proxy

// ── STATE ─────────────────────────────────────────────
let currentUser = null;
let TOKEN       = localStorage.getItem('tio_token');

// Local cache (refreshed from API)
let deals     = [];
let employees = [];
let settings  = { defaultTarget: 40000000, minMargin: 3, maxRate: 10 };
let users     = [];

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const ROLE_CONFIG = {
  admin:   { label:'Admin',   color:'#7c3aed', hideTabs:[], canEdit:true, canManageUsers:true },
  manager: { label:'Manager', color:'#1a56db', hideTabs:['users','settings'], canEdit:true, canManageUsers:false },
  viewer:  { label:'Viewer',  color:'#059669', hideTabs:['add-deal','users','settings'], canEdit:false, canManageUsers:false },
};
function getRoleCfg(role) { return ROLE_CONFIG[role] || ROLE_CONFIG.viewer; }

// ── API HELPERS ───────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) { doLogout(); return null; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
const apiGet    = (path)       => apiFetch(path);
const apiPost   = (path, body) => apiFetch(path, { method:'POST',   body: JSON.stringify(body) });
const apiPut    = (path, body) => apiFetch(path, { method:'PUT',    body: JSON.stringify(body) });
const apiDelete = (path)       => apiFetch(path, { method:'DELETE' });

// ── TOAST ─────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── AUTH ──────────────────────────────────────────────
function fillLogin(u, p) {
  document.getElementById('login-user').value = u;
  document.getElementById('login-pass').value = p;
  document.getElementById('login-btn').focus();
}

function toggleLoginPass() {
  const inp = document.getElementById('login-pass');
  const btn = document.getElementById('login-eye');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');

  if (!username || !password) { err.style.display = 'block'; err.textContent = '⚠ Enter username and password'; return; }
  btn.textContent = 'Signing in…'; btn.style.opacity = '0.75';

  try {
    const data = await apiPost('/api/auth/login', { username, password });
    if (!data) return;
    TOKEN = data.token;
    currentUser = data.user;
    localStorage.setItem('tio_token', TOKEN);
    localStorage.setItem('tio_user', JSON.stringify(currentUser));
    err.style.display = 'none';

    const lp = document.getElementById('login-page');
    lp.style.transition = 'opacity 0.4s'; lp.style.opacity = '0';
    setTimeout(async () => {
      lp.style.display = 'none';
      document.getElementById('app').style.display = 'block';
      applyUserRole();
      await loadAllData();
      showSection('dashboard');
    }, 380);
  } catch (e) {
    err.style.display = 'block';
    err.textContent = '❌ ' + (e.message || 'Invalid credentials');
    btn.textContent = 'Sign In →'; btn.style.opacity = '1';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-pass').focus();
  }
}

function doLogout() {
  TOKEN = null; currentUser = null;
  localStorage.removeItem('tio_token');
  localStorage.removeItem('tio_user');
  const app = document.getElementById('app');
  app.style.transition = 'opacity 0.3s'; app.style.opacity = '0';
  setTimeout(() => {
    app.style.display = 'none'; app.style.opacity = '1';
    const lp = document.getElementById('login-page');
    lp.style.opacity = '0'; lp.style.display = 'flex';
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('login-btn').textContent = 'Sign In →';
    document.getElementById('login-btn').style.opacity = '1';
    setTimeout(() => { lp.style.transition = 'opacity 0.3s'; lp.style.opacity = '1'; }, 20);
  }, 280);
}

function applyUserRole() {
  if (!currentUser) return;
  const cfg = getRoleCfg(currentUser.role);

  document.getElementById('header-name').textContent   = currentUser.name;
  document.getElementById('header-role').textContent   = cfg.label;
  document.getElementById('header-role').style.color   = 'rgba(255,255,255,0.75)';
  document.getElementById('header-avatar').textContent = currentUser.name.charAt(0).toUpperCase();

  const allIds = ['dashboard','deals','add-deal','employees','rate-table','reports','users','settings'];
  allIds.forEach(id => {
    const el = document.getElementById('nav-' + id) ||
               [...document.querySelectorAll('.nav-tab')].find(t => t.getAttribute('onclick')?.includes("'" + id + "'"));
    if (el) el.style.display = cfg.hideTabs.includes(id) ? 'none' : '';
  });
  const ut = document.getElementById('nav-users');
  if (ut) ut.style.display = cfg.canManageUsers ? '' : 'none';

  if (!cfg.canEdit) {
    let s = document.getElementById('role-css');
    if (!s) { s = document.createElement('style'); s.id = 'role-css'; document.head.appendChild(s); }
    s.textContent = `
      #nav-add-deal, #section-add-deal, #btn-add-deal, #btn-add-emp,
      [onclick*="editDeal("], [onclick*="deleteDeal("],
      [onclick*="editEmployee("], [onclick*="deleteEmployee("],
      [onclick*="openEmpTargetEdit("] { display:none!important; }
    `;
  }
}

// ── DATA LOADING ──────────────────────────────────────
async function loadAllData() {
  try {
    [deals, employees, settings] = await Promise.all([
      apiGet('/api/deals'),
      apiGet('/api/employees'),
      apiGet('/api/settings'),
    ]);
    deals     = deals     || [];
    employees = employees || [];
    settings  = settings  || { defaultTarget: 40000000, minMargin: 3, maxRate: 10 };
    populateFilters();
    populateEmployeeSelects();
    populateReportSelects();
    updateSettingsForm();
  } catch (e) {
    showToast('⚠ Failed to load data: ' + e.message);
  }
}

// ── NAVIGATION ────────────────────────────────────────
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const sec = document.getElementById('section-' + id);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t => {
    if (t.getAttribute('onclick')?.includes("'" + id + "'")) t.classList.add('active');
  });

  if (id === 'dashboard')  renderDashboard();
  if (id === 'deals')      renderDeals();
  if (id === 'employees')  renderEmployees();
  if (id === 'rate-table') renderRateTable();
  if (id === 'add-deal')   { populateEmployeeSelects(); resetDealForm(); }
  if (id === 'reports')    { populateReportSelects(); previewReport(); }
  if (id === 'users')      loadAndRenderUsers();
}

// ── COMMISSION ENGINE (client-side, mirrors backend) ──
function calcCommRate(m) {
  if (parseFloat(m) < parseFloat(settings.minMargin || 3)) return 0;
  return Math.min(parseFloat(m), parseFloat(settings.maxRate || 10));
}
function calcCommAmount(gp, m) { return parseFloat(gp || 0) * (calcCommRate(m) / 100); }
function getEmpTarget(emp) { return emp?.target > 0 ? parseFloat(emp.target) : parseFloat(settings.defaultTarget || 40000000); }

function fmtNum(n) {
  if (isNaN(n) || n == null) return '—';
  return parseFloat(n).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function fmtTHB(n) { return '฿' + fmtNum(n); }

// ── FILTERS / SELECTS ─────────────────────────────────
function populateFilters() {
  const months = [...new Set(deals.map(d => d.month))].filter(Boolean)
                   .sort((a,b) => MONTHS.indexOf(a) - MONTHS.indexOf(b));

  ['dash-month','deals-month'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="ALL">All Months</option>' +
      months.map(m => `<option value="${m}">${m}</option>`).join('');
    el.value = cur || 'ALL';
  });

  ['dash-emp','deals-emp'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="ALL">All Employees</option>' +
      employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    el.value = cur || 'ALL';
  });

  const hdr = document.getElementById('header-emp-select');
  if (hdr) {
    const cur = hdr.value;
    hdr.innerHTML = '<option value="ALL">All Employees</option>' +
      employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    hdr.value = cur || 'ALL';
  }
}

function populateEmployeeSelects() {
  ['f-emp'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  });
}

function populateReportSelects() {
  const rEmp = document.getElementById('rpt-emp');
  if (rEmp) rEmp.innerHTML = employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

  const years = [...new Set(deals.map(d => d.date ? String(d.date).slice(0,4) : null).filter(Boolean))];
  if (!years.includes(String(new Date().getFullYear()))) years.push(String(new Date().getFullYear()));
  years.sort((a,b) => b - a);
  const rYear = document.getElementById('rpt-year');
  if (rYear) {
    const cur = rYear.value;
    rYear.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    rYear.value = cur || years[0];
  }
}

function updateHeaderBadge() {
  const empId = document.getElementById('header-emp-select')?.value;
  const emp = employees.find(e => String(e.id) === String(empId));
  document.getElementById('dash-emp').value = empId || 'ALL';
  renderDashboard();
}

// ── DASHBOARD ────────────────────────────────────────
function renderDashboard() {
  const month = document.getElementById('dash-month')?.value || 'ALL';
  const empId = document.getElementById('dash-emp')?.value   || 'ALL';

  let filtered = deals;
  if (month !== 'ALL') filtered = filtered.filter(d => d.month === month);
  if (empId !== 'ALL') filtered = filtered.filter(d => String(d.employee_id) === String(empId));

  const totalSales = filtered.reduce((s,d) => s + parseFloat(d.sale_price||0), 0);
  const totalComm  = filtered.reduce((s,d) => s + calcCommAmount(d.gp, d.margin_pct), 0);
  const avgMargin  = filtered.length ? filtered.reduce((s,d) => s + parseFloat(d.margin_pct||0), 0) / filtered.length : 0;

  const emp = employees.find(e => String(e.id) === String(empId));
  const annualTarget = getEmpTarget(emp);
  const ytdSales = empId === 'ALL'
    ? deals.filter(d => d.date && String(d.date).startsWith(String(new Date().getFullYear())))
           .reduce((s,d) => s + parseFloat(d.sale_price||0), 0)
    : deals.filter(d => String(d.employee_id) === String(empId) && d.date && String(d.date).startsWith(String(new Date().getFullYear())))
           .reduce((s,d) => s + parseFloat(d.sale_price||0), 0);
  const achPct = annualTarget > 0 ? Math.min(ytdSales / annualTarget * 100, 100) : 0;

  document.getElementById('stat-sales').textContent   = fmtTHB(totalSales);
  document.getElementById('stat-count').textContent   = filtered.length + ' deal' + (filtered.length !== 1 ? 's' : '');
  document.getElementById('stat-comm').textContent    = fmtTHB(totalComm);
  document.getElementById('stat-margin').textContent  = avgMargin.toFixed(2) + '% avg margin';
  document.getElementById('stat-target').textContent  = fmtTHB(annualTarget);
  document.getElementById('stat-target-sub').textContent = emp ? emp.name + "'s target" : 'Select employee';
  document.getElementById('stat-achieve').textContent = achPct.toFixed(1) + '%';
  document.getElementById('stat-achieve-sub').textContent = 'YTD ' + fmtTHB(ytdSales) + ' / ' + fmtTHB(annualTarget);

  document.getElementById('prog-label').textContent = emp ? emp.name + ' — Annual Target Progress' : 'Select an employee for target progress';
  document.getElementById('prog-pct').textContent   = achPct.toFixed(1) + '%';
  document.getElementById('prog-fill').style.width  = achPct + '%';

  const recent = [...filtered].sort((a,b) => new Date(b.date||0) - new Date(a.date||0)).slice(0, 8);
  document.getElementById('dash-tbody').innerHTML = recent.length
    ? recent.map(d => `<tr>
        <td>${d.project || '—'}</td>
        <td>${d.customer || '—'}</td>
        <td>${d.month || '—'}</td>
        <td class="text-right mono">${fmtTHB(d.sale_price)}</td>
        <td class="text-right">${parseFloat(d.margin_pct||0).toFixed(2)}%</td>
        <td class="text-right mono" style="color:var(--success);font-weight:600;">${fmtTHB(calcCommAmount(d.gp, d.margin_pct))}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px;">No deals found</td></tr>';
}

// ── DEALS ─────────────────────────────────────────────
function renderDeals() {
  const month = document.getElementById('deals-month')?.value || 'ALL';
  const empId = document.getElementById('deals-emp')?.value   || 'ALL';
  const cfg   = getRoleCfg(currentUser?.role);

  let filtered = deals;
  if (month !== 'ALL') filtered = filtered.filter(d => d.month === month);
  if (empId !== 'ALL') filtered = filtered.filter(d => String(d.employee_id) === String(empId));

  document.getElementById('deals-tbody').innerHTML = filtered.length
    ? filtered.map((d, i) => `<tr>
        <td>${i+1}</td>
        <td>${d.project || '—'}</td>
        <td>${d.customer || '—'}</td>
        <td style="font-family:monospace;font-size:12px;">${d.receipt || '—'}</td>
        <td>${d.date ? String(d.date).slice(0,10) : '—'}</td>
        <td>${d.employee_name || '—'}</td>
        <td class="text-right mono">${fmtTHB(d.sale_price)}</td>
        <td class="text-right">${parseFloat(d.margin_pct||0).toFixed(2)}%</td>
        <td class="text-right mono" style="color:var(--success);font-weight:600;">${fmtTHB(calcCommAmount(d.gp, d.margin_pct))}</td>
        <td class="text-center">
          ${cfg.canEdit ? `<button class="btn-icon" onclick="editDeal(${d.id})" title="Edit">✏️</button>
          <button class="btn-icon" onclick="deleteDeal(${d.id})" title="Delete" style="color:var(--danger);">🗑</button>` : '—'}
        </td>
      </tr>`).join('')
    : '<tr><td colspan="10" style="text-align:center;color:var(--gray-400);padding:24px;">No deals found</td></tr>';
}

function resetDealForm() {
  document.getElementById('f-id').value = '';
  document.getElementById('deal-form-title').textContent = 'Add Deal';
  ['f-project','f-customer','f-receipt','f-sale','f-gp','f-margin'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('f-month').value = MONTHS[new Date().getMonth()];
  document.getElementById('comm-preview').textContent = '—';
}

function calcPreview() {
  const gp  = parseFloat(document.getElementById('f-gp').value)     || 0;
  const m   = parseFloat(document.getElementById('f-margin').value)  || 0;
  const comm = calcCommAmount(gp, m);
  const rate = calcCommRate(m);
  document.getElementById('comm-preview').textContent =
    rate > 0 ? fmtTHB(comm) + '  (' + rate.toFixed(2) + '%)' : '฿0.00 — below minimum margin';
}

function editDeal(id) {
  const d = deals.find(x => x.id == id);
  if (!d) return;
  showSection('add-deal');
  document.getElementById('f-id').value      = d.id;
  document.getElementById('deal-form-title').textContent = 'Edit Deal';
  document.getElementById('f-emp').value     = d.employee_id;
  document.getElementById('f-month').value   = d.month;
  document.getElementById('f-project').value = d.project;
  document.getElementById('f-customer').value = d.customer;
  document.getElementById('f-receipt').value = d.receipt;
  document.getElementById('f-date').value    = d.date ? String(d.date).slice(0,10) : '';
  document.getElementById('f-sale').value    = d.sale_price;
  document.getElementById('f-gp').value      = d.gp;
  document.getElementById('f-margin').value  = d.margin_pct;
  calcPreview();
}

async function saveDeal() {
  const id        = document.getElementById('f-id').value;
  const employeeId = document.getElementById('f-emp').value;
  const month     = document.getElementById('f-month').value;
  const project   = document.getElementById('f-project').value.trim();
  const customer  = document.getElementById('f-customer').value.trim();
  const receipt   = document.getElementById('f-receipt').value.trim();
  const date      = document.getElementById('f-date').value;
  const salePrice = parseFloat(document.getElementById('f-sale').value);
  const gp        = parseFloat(document.getElementById('f-gp').value);
  const marginPct = parseFloat(document.getElementById('f-margin').value);

  if (!project || !salePrice) { showToast('⚠ Project name and Sale Price are required'); return; }

  try {
    const body = { employeeId, month, project, customer, receipt, date, salePrice, gp, marginPct };
    let updated;
    if (id) {
      updated = await apiPut('/api/deals/' + id, body);
      const idx = deals.findIndex(d => d.id == id);
      if (idx >= 0) deals[idx] = { ...deals[idx], ...updated };
      showToast('✅ Deal updated');
    } else {
      updated = await apiPost('/api/deals', body);
      // Re-fetch to get employee_name joined
      deals = await apiGet('/api/deals') || deals;
      showToast('✅ Deal added');
    }
    populateFilters();
    showSection('deals');
  } catch (e) {
    showToast('❌ ' + e.message);
  }
}

async function deleteDeal(id) {
  if (!confirm('Delete this deal? This cannot be undone.')) return;
  try {
    await apiDelete('/api/deals/' + id);
    deals = deals.filter(d => d.id != id);
    renderDeals();
    renderDashboard();
    showToast('🗑 Deal deleted');
  } catch (e) {
    showToast('❌ ' + e.message);
  }
}

// ── EMPLOYEES ─────────────────────────────────────────
function renderEmployees() {
  const tbody = document.getElementById('emp-tbody');
  if (!tbody) return;
  tbody.innerHTML = employees.map(emp => {
    const empDeals = deals.filter(d => String(d.employee_id) === String(emp.id));
    const totalSales = empDeals.reduce((s,d) => s + parseFloat(d.sale_price||0), 0);
    const totalComm  = empDeals.reduce((s,d) => s + calcCommAmount(d.gp, d.margin_pct), 0);
    const target     = getEmpTarget(emp);
    const cfg        = getRoleCfg(currentUser?.role);
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:${emp.color||'#1a56db'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">
            ${emp.name.charAt(0).toUpperCase()}
          </div>
          <strong>${emp.name}</strong>
        </div>
      </td>
      <td class="text-right" id="emp-target-cell-${emp.id}">
        <span class="emp-target-display">${fmtTHB(target)}</span>
        ${cfg.canEdit ? `<button class="btn-icon" onclick="openEmpTargetEdit(${emp.id})" title="Edit target" style="margin-left:6px;font-size:12px;">✏️</button>` : ''}
      </td>
      <td class="text-right mono">${fmtTHB(totalSales)}</td>
      <td class="text-right mono" style="color:var(--success);font-weight:600;">${fmtTHB(totalComm)}</td>
      <td class="text-center">
        ${cfg.canEdit ? `<button class="btn-icon" onclick="editEmployee(${emp.id})" title="Edit">✏️</button>
        <button class="btn-icon" onclick="deleteEmployee(${emp.id})" title="Delete" style="color:var(--danger);">🗑</button>` : '—'}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:24px;">No employees found</td></tr>';
}

function openAddEmpForm() {
  document.getElementById('ef-id').value = '';
  document.getElementById('ef-name').value = '';
  document.getElementById('ef-target').value = settings.defaultTarget || 40000000;
  document.getElementById('ef-color').value = '#1a56db';
  document.getElementById('emp-form-title').textContent = 'Add Employee';
  document.getElementById('emp-form-card').style.display = 'block';
  document.getElementById('emp-form-card').scrollIntoView({ behavior:'smooth' });
}

function editEmployee(id) {
  const emp = employees.find(e => e.id == id);
  if (!emp) return;
  document.getElementById('ef-id').value     = emp.id;
  document.getElementById('ef-name').value   = emp.name;
  document.getElementById('ef-target').value = emp.target;
  document.getElementById('ef-color').value  = emp.color || '#1a56db';
  document.getElementById('emp-form-title').textContent = 'Edit Employee';
  document.getElementById('emp-form-card').style.display = 'block';
  document.getElementById('emp-form-card').scrollIntoView({ behavior:'smooth' });
}

function closeEmpForm() { document.getElementById('emp-form-card').style.display = 'none'; }

async function saveEmployee() {
  const id     = document.getElementById('ef-id').value;
  const name   = document.getElementById('ef-name').value.trim();
  const target = parseFloat(document.getElementById('ef-target').value);
  const color  = document.getElementById('ef-color').value;
  if (!name) { showToast('⚠ Name is required'); return; }
  try {
    if (id) {
      const updated = await apiPut('/api/employees/' + id, { name, target, color });
      const idx = employees.findIndex(e => e.id == id);
      if (idx >= 0) employees[idx] = updated;
      showToast('✅ Employee updated');
    } else {
      const created = await apiPost('/api/employees', { name, target, color });
      employees.push(created);
      showToast('✅ Employee added');
    }
    closeEmpForm();
    populateFilters();
    populateEmployeeSelects();
    renderEmployees();
  } catch (e) { showToast('❌ ' + e.message); }
}

async function deleteEmployee(id) {
  const emp = employees.find(e => e.id == id);
  if (!emp) return;
  if (!confirm(`Delete "${emp.name}" and all their deals? This cannot be undone.`)) return;
  try {
    await apiDelete('/api/employees/' + id);
    employees = employees.filter(e => e.id != id);
    deals = deals.filter(d => d.employee_id != id);
    populateFilters();
    renderEmployees();
    renderDashboard();
    showToast('🗑 Employee deleted');
  } catch (e) { showToast('❌ ' + e.message); }
}

function openEmpTargetEdit(id) {
  const cell = document.getElementById('emp-target-cell-' + id);
  if (!cell) return;
  const emp = employees.find(e => e.id == id);
  cell.innerHTML = `
    <input type="number" id="et-input-${id}" value="${emp?.target || ''}"
           style="width:140px;padding:4px 8px;border:1.5px solid var(--primary);border-radius:6px;font-size:13px;text-align:right;">
    <button class="btn btn-sm btn-primary" onclick="saveEmpTarget(${id})" style="margin-left:4px;">✓</button>
    <button class="btn btn-sm btn-outline" onclick="renderEmployees()" style="margin-left:2px;">✕</button>
  `;
  document.getElementById('et-input-' + id)?.focus();
}

async function saveEmpTarget(id) {
  const val = parseFloat(document.getElementById('et-input-' + id)?.value);
  if (isNaN(val) || val < 0) { showToast('⚠ Invalid target value'); return; }
  const emp = employees.find(e => e.id == id);
  if (!emp) return;
  try {
    const updated = await apiPut('/api/employees/' + id, { name: emp.name, color: emp.color, target: val });
    const idx = employees.findIndex(e => e.id == id);
    if (idx >= 0) employees[idx] = updated;
    renderEmployees();
    showToast('✅ Target updated');
  } catch (e) { showToast('❌ ' + e.message); }
}

// ── COMMISSION RATE TABLE ─────────────────────────────
function renderRateTable() {
  const min = parseFloat(settings.minMargin || 3);
  const max = parseFloat(settings.maxRate || 10);
  document.getElementById('rt-minmargin').textContent = min + '%';
  document.getElementById('rt-maxrate').textContent   = max + '%';

  const rows = [];
  for (let m = 0; m <= 15; m += 0.5) {
    const rate = calcCommRate(m);
    rows.push(`<tr style="${m >= min ? '' : 'color:var(--gray-400);'}">
      <td>${m.toFixed(1)}%</td>
      <td class="text-right" style="font-weight:${rate>0?'600':'400'};color:${rate>0?'var(--success)':'var(--gray-400)'};">${rate.toFixed(1)}%</td>
      <td class="text-right mono">${fmtTHB(calcCommAmount(100000, m))}</td>
    </tr>`);
  }
  document.getElementById('rate-table-wrap').innerHTML = `
    <table>
      <thead><tr><th>Margin %</th><th class="text-right">Commission Rate</th><th class="text-right">Comm on ฿100,000 GP</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

// ── SETTINGS ─────────────────────────────────────────
function updateSettingsForm() {
  document.getElementById('s-target').value    = settings.defaultTarget || 40000000;
  document.getElementById('s-minmargin').value = settings.minMargin     || 3;
  document.getElementById('s-maxrate').value   = settings.maxRate       || 10;
}

async function saveSettings() {
  const defaultTarget = parseFloat(document.getElementById('s-target').value);
  const minMargin     = parseFloat(document.getElementById('s-minmargin').value);
  const maxRate       = parseFloat(document.getElementById('s-maxrate').value);
  try {
    await apiPut('/api/settings', { defaultTarget, minMargin, maxRate });
    settings = { defaultTarget, minMargin, maxRate };
    showToast('✅ Settings saved');
  } catch (e) { showToast('❌ ' + e.message); }
}

// ── USERS ─────────────────────────────────────────────
async function loadAndRenderUsers() {
  try {
    users = await apiGet('/api/users') || [];
    renderUsers();
  } catch (e) { showToast('❌ ' + e.message); }
}

function renderUsers() {
  const tbody = document.getElementById('users-tbody');
  const label = document.getElementById('user-count');
  if (!tbody) return;
  label.textContent = users.length + ' user' + (users.length !== 1 ? 's' : '');
  tbody.innerHTML = users.map(u => {
    const cfg    = getRoleCfg(u.role);
    const isSelf = currentUser?.id == u.id;
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:30px;height:30px;border-radius:50%;background:${cfg.color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">${u.name.charAt(0).toUpperCase()}</div>
          <div>
            <strong>${u.name}</strong>
            ${isSelf ? '<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:10px;margin-left:4px;font-weight:600;">You</span>' : ''}
          </div>
        </div>
      </td>
      <td style="font-family:monospace;font-size:13px;color:var(--gray-600);">${u.username}</td>
      <td><span style="background:${cfg.color}22;color:${cfg.color};border:1px solid ${cfg.color}44;border-radius:20px;padding:2px 12px;font-size:12px;font-weight:700;">${cfg.label}</span></td>
      <td class="text-center">
        <button class="btn-icon" onclick="editUser(${u.id})" title="Edit">✏️</button>
        <button class="btn-icon" onclick="deleteUser(${u.id})" title="Delete" style="color:var(--danger);" ${isSelf ? 'disabled' : ''}>🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function openUserForm() {
  document.getElementById('uf-id').value       = '';
  document.getElementById('uf-name').value     = '';
  document.getElementById('uf-username').value = '';
  document.getElementById('uf-password').value = '';
  document.getElementById('uf-role').value     = 'manager';
  document.getElementById('uf-pass-hint').textContent = '';
  document.getElementById('user-form-title').textContent = 'Add User';
  document.getElementById('user-form-card').style.display = 'block';
  document.getElementById('user-form-card').scrollIntoView({ behavior:'smooth' });
}

function editUser(id) {
  const u = users.find(x => x.id == id);
  if (!u) return;
  document.getElementById('uf-id').value       = u.id;
  document.getElementById('uf-name').value     = u.name;
  document.getElementById('uf-username').value = u.username;
  document.getElementById('uf-password').value = '';
  document.getElementById('uf-role').value     = u.role;
  document.getElementById('uf-pass-hint').textContent = 'Leave blank to keep existing password';
  document.getElementById('user-form-title').textContent = 'Edit User — ' + u.name;
  document.getElementById('user-form-card').style.display = 'block';
  document.getElementById('user-form-card').scrollIntoView({ behavior:'smooth' });
}

function closeUserForm() { document.getElementById('user-form-card').style.display = 'none'; }

function toggleUFPass() {
  const inp = document.getElementById('uf-password');
  const btn = document.getElementById('uf-eye');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

async function saveUser() {
  const id       = document.getElementById('uf-id').value;
  const name     = document.getElementById('uf-name').value.trim();
  const username = document.getElementById('uf-username').value.trim();
  const password = document.getElementById('uf-password').value;
  const role     = document.getElementById('uf-role').value;
  if (!name || !username) { showToast('⚠ Name and username are required'); return; }
  if (!id && !password)   { showToast('⚠ Password is required for new users'); return; }
  try {
    const body = { name, username, password, role };
    if (id) {
      const updated = await apiPut('/api/users/' + id, body);
      const idx = users.findIndex(u => u.id == id);
      if (idx >= 0) users[idx] = updated;
      if (currentUser?.id == id) {
        currentUser.name = updated.name; currentUser.role = updated.role;
        localStorage.setItem('tio_user', JSON.stringify(currentUser));
        applyUserRole();
      }
      showToast('✅ User updated');
    } else {
      const created = await apiPost('/api/users', body);
      users.push(created);
      showToast('✅ User "' + name + '" added');
    }
    closeUserForm();
    renderUsers();
  } catch (e) { showToast('❌ ' + e.message); }
}

async function deleteUser(id) {
  if (currentUser?.id == id) { showToast('⚠ Cannot delete your own account'); return; }
  const u = users.find(x => x.id == id);
  if (!u || !confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
  try {
    await apiDelete('/api/users/' + id);
    users = users.filter(x => x.id != id);
    renderUsers();
    showToast('🗑 User deleted');
  } catch (e) { showToast('❌ ' + e.message); }
}

// ── REPORTS ──────────────────────────────────────────
function getReportDeals() {
  const empId = document.getElementById('rpt-emp')?.value;
  const month = document.getElementById('rpt-month')?.value;
  const year  = document.getElementById('rpt-year')?.value;
  return deals.filter(d => {
    if (empId && String(d.employee_id) !== String(empId)) return false;
    if (month && month !== 'ALL' && d.month !== month)    return false;
    if (year  && d.date && !String(d.date).startsWith(year)) return false;
    return true;
  });
}

function getYTDSummary(empId, year) {
  const ytd = deals.filter(d => String(d.employee_id) === String(empId) && d.date && String(d.date).startsWith(year));
  const ytdSales    = ytd.reduce((s,d) => s + parseFloat(d.sale_price||0), 0);
  const ytdComm     = ytd.reduce((s,d) => s + calcCommAmount(d.gp, d.margin_pct), 0);
  const ytdAvgMargin = ytd.length ? ytd.reduce((s,d) => s + parseFloat(d.margin_pct||0), 0) / ytd.length : 0;
  return { ytdSales, ytdComm, ytdAvgMargin, count: ytd.length };
}

function buildReportHTML(forPrint) {
  const empId = document.getElementById('rpt-emp')?.value;
  const month = document.getElementById('rpt-month')?.value || 'ALL';
  const year  = document.getElementById('rpt-year')?.value  || String(new Date().getFullYear());
  const emp   = employees.find(e => String(e.id) === String(empId)) || {};
  const rDeals = getReportDeals();
  const netPaid = rDeals.reduce((s,d) => s + calcCommAmount(d.gp, d.margin_pct), 0);
  const avgMargin = rDeals.length ? rDeals.reduce((s,d) => s + parseFloat(d.margin_pct||0), 0) / rDeals.length : 0;
  const annualTarget = getEmpTarget(emp);
  const periodLabel  = month === 'ALL' ? year : month + ' ' + year;
  const ytd = getYTDSummary(empId, year);
  const targetPct = annualTarget > 0 ? Math.min(ytd.ytdSales / annualTarget * 100, 100) : 0;
  const _d = new Date();
  const now = _d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) + ' ' +
              _d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  const rows = rDeals.map((d, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${d.project||'—'}</td>
      <td>${d.customer||'—'}</td>
      <td style="font-family:monospace;font-size:10px;">${d.receipt||'—'}</td>
      <td>${d.date ? String(d.date).slice(0,10) : '—'}</td>
      <td class="text-right" style="font-family:monospace;">${fmtTHB(d.sale_price)}</td>
      <td class="text-right">${parseFloat(d.margin_pct||0).toFixed(2)}%</td>
      <td class="text-right">${calcCommRate(d.margin_pct).toFixed(2)}%</td>
      <td class="text-right" style="font-family:monospace;font-weight:600;color:#059669;">${fmtTHB(calcCommAmount(d.gp, d.margin_pct))}</td>
    </tr>`).join('');

  return `
  <div class="rpt-wrap">
    <div class="rpt-header">
      <div class="rpt-logo-row">
        <img src="https://i0.wp.com/techion.co.th/wp-content/uploads/2024/09/techion_mini_logo.png?resize=277%2C318&ssl=1"
             style="height:44px;object-fit:contain;" alt="TECH ION">
        <div>
          <div class="rpt-company">TECH ION Co., Ltd.</div>
          <div class="rpt-title-text">Commission Report</div>
        </div>
      </div>
      <div class="rpt-meta">
        <div><strong>Employee:</strong> ${emp.name || '—'}</div>
        <div><strong>Period:</strong> ${periodLabel}</div>
        <div><strong>Generated:</strong> ${now}</div>
        <div><strong>Prepared by:</strong> ${currentUser ? currentUser.name : '—'}</div>
      </div>
    </div>
    <div class="rpt-divider"></div>

    <table class="rpt-table">
      <thead>
        <tr>
          <th style="background:#1E3A8A;border-radius:4px 0 0 4px;">#</th>
          <th style="background:#1E3A8A;">Project</th>
          <th style="background:#1E3A8A;">Customer</th>
          <th style="background:#1E3A8A;">Receipt No.</th>
          <th style="background:#1E3A8A;">Date</th>
          <th style="background:#DC2626;text-align:right;">Sale Price (฿)</th>
          <th style="background:#7C3AED;text-align:right;">Margin %</th>
          <th style="background:#7C3AED;text-align:right;">Rate Com. %</th>
          <th style="background:#059669;text-align:right;border-radius:0 4px 4px 0;">Total Comm (฿)</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="9" style="text-align:center;color:#9ca3af;padding:16px;">No deals for this period</td></tr>'}
        <tr class="rpt-net-row">
          <td colspan="8" style="text-align:right;padding-right:12px;">Net Commission Paid</td>
          <td class="text-right" style="font-family:monospace;">${fmtTHB(netPaid)}</td>
        </tr>
      </tbody>
    </table>

    <div class="rpt-ytd">
      <div class="rpt-ytd-title">📊 Year-to-Date Summary (Jan – ${month === 'ALL' ? 'Dec' : month} ${year})</div>
      <div class="rpt-ytd-grid">
        <div class="rpt-ytd-item"><div class="label">Annual Target (฿)</div><div class="value">${fmtTHB(annualTarget)}</div></div>
        <div class="rpt-ytd-item"><div class="label">Total Sales YTD (฿)</div><div class="value">${fmtTHB(ytd.ytdSales)}</div></div>
        <div class="rpt-ytd-item"><div class="label">Target Achievement</div><div class="value">${targetPct.toFixed(1)}%</div></div>
        <div class="rpt-ytd-item"><div class="label">Avg Margin YTD</div><div class="value">${ytd.ytdAvgMargin.toFixed(2)}%</div></div>
        <div class="rpt-ytd-item"><div class="label">Total Commission YTD (฿)</div><div class="value">${fmtTHB(ytd.ytdComm)}</div></div>
        <div class="rpt-ytd-item"><div class="label">This Period Commission (฿)</div><div class="value">${fmtTHB(netPaid)}</div></div>
      </div>
    </div>

    <div class="rpt-footer">
      <span>TECH ION Co., Ltd. — Confidential</span>
      <span>Prepared by: ${currentUser ? currentUser.name : '—'} · ${now}</span>
    </div>
  </div>`;
}

function previewReport() {
  const el = document.getElementById('report-preview');
  if (el) el.innerHTML = buildReportHTML(false);
}

function exportPDF() {
  const frame = document.getElementById('print-frame');
  frame.innerHTML = `<link rel="stylesheet" href="css/style.css">` + buildReportHTML(true);
  window.print();
}

function exportExcel() {
  if (typeof XLSX === 'undefined') { showToast('⚠ SheetJS not loaded'); return; }
  const empId = document.getElementById('rpt-emp')?.value;
  const month = document.getElementById('rpt-month')?.value || 'ALL';
  const year  = document.getElementById('rpt-year')?.value  || String(new Date().getFullYear());
  const emp   = employees.find(e => String(e.id) === String(empId)) || {};
  const rDeals = getReportDeals();
  const netPaid = rDeals.reduce((s,d) => s + calcCommAmount(d.gp, d.margin_pct), 0);
  const annualTarget = getEmpTarget(emp);
  const ytd = getYTDSummary(empId, year);
  const targetPct = annualTarget > 0 ? Math.min(ytd.ytdSales / annualTarget * 100, 100) : 0;
  const _d = new Date();
  const now = _d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) + ' ' +
              _d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  const wsData = [];
  wsData.push(['TECH ION Co., Ltd. — Commission Report']);
  wsData.push([`Employee: ${emp.name||''}`, '', '', '', `Period: ${month === 'ALL' ? year : month+' '+year}`]);
  wsData.push([`Prepared by: ${currentUser?.name||'—'}`, '', '', '', `Generated: ${now}`]);
  wsData.push([]);
  wsData.push(['No.','Project','Customer','Receipt No.','Date','Sale Price (฿)','Margin (%)','Rate Com. (%)','Total Comm (฿)']);

  rDeals.forEach((d, i) => {
    wsData.push([
      i+1, d.project, d.customer, d.receipt,
      d.date ? String(d.date).slice(0,10) : '',
      parseFloat(d.sale_price||0),
      parseFloat(d.margin_pct||0) / 100,
      calcCommRate(d.margin_pct) / 100,
      calcCommAmount(d.gp, d.margin_pct)
    ]);
  });

  wsData.push([]); wsData.push(['','','','','','','','Net Paid', netPaid]);
  wsData.push([]); wsData.push([`YEAR-TO-DATE SUMMARY (Jan – ${month==='ALL'?'Dec':month} ${year})`]);
  wsData.push(['Annual Target (฿)',           annualTarget]);
  wsData.push(['Total Sales YTD (฿)',         ytd.ytdSales]);
  wsData.push(['Target Achievement (%)',       targetPct / 100]);
  wsData.push(['Average Margin (%)',           ytd.ytdAvgMargin / 100]);
  wsData.push(['Total Commission YTD (฿)',     ytd.ytdComm]);
  wsData.push(['This Period Commission (฿)',   netPaid]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:5},{wch:34},{wch:18},{wch:16},{wch:12},{wch:18},{wch:13},{wch:14},{wch:18}];

  const headerRow = 4;
  for (let c = 0; c < 9; c++) {
    const ref = XLSX.utils.encode_cell({ r: headerRow, c });
    if (!ws[ref]) continue;
    ws[ref].s = { fill:{fgColor:{rgb:'1E3A8A'}}, font:{bold:true,color:{rgb:'FFFFFF'},sz:11}, alignment:{horizontal:'center'} };
  }
  const numFmt = '#,##0.00'; const pctFmt = '0.00%';
  for (let r = headerRow + 1; r < headerRow + 1 + rDeals.length; r++) {
    [[5,numFmt],[6,pctFmt],[7,pctFmt],[8,numFmt]].forEach(([c,fmt]) => {
      const ref = XLSX.utils.encode_cell({r,c});
      if (ws[ref]) ws[ref].z = fmt;
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Commission Report');
  XLSX.writeFile(wb, `TIO_Commission_${emp.name||'Report'}_${month==='ALL'?year:month+'_'+year}.xlsx`);
}

// ── INIT ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Try restoring session from localStorage
  const savedToken = localStorage.getItem('tio_token');
  const savedUser  = localStorage.getItem('tio_user');

  if (savedToken && savedUser) {
    TOKEN = savedToken;
    try {
      // Verify token is still valid
      const me = await apiGet('/api/auth/me');
      if (me) {
        currentUser = me;
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('app').style.display        = 'block';
        applyUserRole();
        await loadAllData();
        showSection('dashboard');
        return;
      }
    } catch {
      TOKEN = null;
      localStorage.removeItem('tio_token');
      localStorage.removeItem('tio_user');
    }
  }
  // Show login
  document.getElementById('login-page').style.display = 'flex';
});
