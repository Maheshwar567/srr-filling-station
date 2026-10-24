/**
 * SRR Filling Station (Indian Oil) - Enterprise Client Application Controller
 * Features:
 * - Direct Role Segregation (Staff View OR Admin View ONLY upon login)
 * - Self-Service Authentication & Password Change for Employees & Admin
 * - Admin Assigned Read-Only Pump Lock for Attendants
 * - Dedicated Testing Tab (Litres automatically deducted from sale)
 * - Fleet Vehicle Multi-Day Ledger & Sum Calculator
 * - Amount Reminder (Customer temporary marker, NOT credit)
 * - Multi-Tenant Pluggable Database (Oracle PDB concept)
 */

const STATE = {
  currentUser: null, // { id, name, username, role, assignedStation }
  role: 'employee',
  adminUnlocked: false,
  activeTenant: 'srr-filling-station',
  tenants: [],
  selectedStation: 'S1',
  selectedEmployeeName: '',
  dutyAssignments: {},
  employeeTab: 'reading', // 'reading', 'testing', 'reminder', 'vehicle', 'handover'
  selectedDate: '2026-10-23', // Shift date
  adminTab: 'summary', // 'summary', 'fleet', 'reminders', 'employees', 'roster', 'pdbs', 'rates', 'tanks'
  rates: { petrol: 117.07, diesel: 105.23 },
  shift: null,
  summary: null,
  reminders: [],
  vehicleLedger: [],
  employees: [],
  tanks: []
};

const STATION_CONFIG = {
  S1: { pump: 'Pump 1', side: 'Side 1 (S1)', petrolCode: 'A1', dieselCode: 'A2' },
  S2: { pump: 'Pump 1', side: 'Side 2 (S2)', petrolCode: 'B1', dieselCode: 'B2' },
  S3: { pump: 'Pump 2', side: 'Side 3 (S3)', petrolCode: 'A1', dieselCode: 'A2' },
  S4: { pump: 'Pump 2', side: 'Side 4 (S4)', petrolCode: 'B1', dieselCode: 'B2' }
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  // Read tenant from URL query if present e.g. ?pump=srr-filling-station
  const urlParams = new URLSearchParams(window.location.search);
  const pumpParam = urlParams.get('pump');
  if (pumpParam) STATE.activeTenant = pumpParam;

  // Restore session from sessionStorage
  try {
    const savedUser = sessionStorage.getItem('srr_current_user');
    if (savedUser) {
      STATE.currentUser = JSON.parse(savedUser);
      if (STATE.currentUser?.role === 'admin') {
        STATE.adminUnlocked = true;
      }
    }
  } catch (e) {
    console.error("Session restore error", e);
  }

  // Set date picker
  const dateInput = document.getElementById('headerShiftDate');
  if (dateInput) {
    dateInput.value = STATE.selectedDate;
    dateInput.addEventListener('change', (e) => {
      STATE.selectedDate = e.target.value;
      loadAllData();
    });
  }

  const rateDateInput = document.getElementById('rateSetDate');
  if (rateDateInput) rateDateInput.value = STATE.selectedDate;

  // Load Tenants & Data
  loadTenantsAndData();
});

// Toast notification helper
function showToast(message, type = 'success') {
  const existing = document.getElementById('toastNotification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toastNotification';
  const bg = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-rose-600' : 'bg-slate-800');
  toast.className = `fixed bottom-5 right-5 ${bg} text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold z-50 flex items-center gap-2 animate-bounce`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠️'}</span><span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

// --- DATA FETCHING (TENANT SPECIFIC) ---
async function loadTenantsAndData() {
  try {
    // 1. Fetch Pluggable Database Tenants
    const tenantsRes = await fetch('/api/tenants');
    STATE.tenants = await tenantsRes.json();
    renderTenantSelector();

    // 2. Fetch System Info (Mobile App IP)
    fetch('/api/system-info')
      .then(r => r.json())
      .then(info => {
        const modalUrl = document.getElementById('modalMobileUrlText');
        if (modalUrl) modalUrl.innerText = info.mobileAppUrl;
        const qrImg = document.getElementById('mobileQrCodeImg');
        if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(info.mobileAppUrl)}`;
      }).catch(() => {});

    await loadAllData();
  } catch (err) {
    console.error("Initialization error:", err);
  }
}

async function loadAllData() {
  const tenant = STATE.activeTenant;

  try {
    // 1. Station Config & Employees
    const configRes = await fetch(`/api/config?pump=${tenant}`);
    const configData = await configRes.json();
    STATE.employees = configData.employees || [];
    STATE.tanks = configData.tanks || [];

    // Update Header Titles
    const hTitle = document.getElementById('headerStationTitle');
    const fTitle = document.getElementById('footerStationName');
    const loginTitle = document.getElementById('loginStationName');
    const slipBadge = document.getElementById('slipTenantBadge');

    const stName = configData.config?.stationName || "SRR FILLING STATION";
    if (hTitle) hTitle.innerText = stName;
    if (fTitle) fTitle.innerText = stName;
    if (loginTitle) loginTitle.innerText = stName;
    if (slipBadge) slipBadge.innerText = stName;

    // 2. Rates
    const ratesRes = await fetch(`/api/rates?pump=${tenant}&date=${STATE.selectedDate}`);
    const ratesData = await ratesRes.json();
    if (ratesData.currentRate) {
      STATE.rates = {
        petrol: ratesData.currentRate.petrol,
        diesel: ratesData.currentRate.diesel
      };
      updateTicker();
    }

    // 3. Shift Data & Duty Assignments
    const shiftRes = await fetch(`/api/shifts/active?pump=${tenant}&date=${STATE.selectedDate}`);
    STATE.shift = await shiftRes.json();

    const dutyRes = await fetch(`/api/duty-assignments?pump=${tenant}&date=${STATE.selectedDate}`);
    STATE.dutyAssignments = await dutyRes.json();

    // 4. Amount Reminders
    const remRes = await fetch(`/api/reminders?pump=${tenant}&date=${STATE.selectedDate}`);
    STATE.reminders = await remRes.json();

    // 5. Vehicle Fleet Ledger
    const vlogRes = await fetch(`/api/vehicle-ledger?pump=${tenant}&shiftDate=${STATE.selectedDate}`);
    STATE.vehicleLedger = await vlogRes.json();

    // 6. Daily Summary
    const sumRes = await fetch(`/api/daily-summary?pump=${tenant}&date=${STATE.selectedDate}`);
    STATE.summary = await sumRes.json();

    // Determine and enforce active view routing
    routeUserView();

  } catch (err) {
    console.error(`Error loading data for ${tenant}:`, err);
  }
}

function updateTicker() {
  const pEmp = document.getElementById('empPetrolRateDisplay');
  const dEmp = document.getElementById('empDieselRateDisplay');
  if (pEmp) pEmp.innerText = `₹${STATE.rates.petrol.toFixed(2)}`;
  if (dEmp) dEmp.innerText = `₹${STATE.rates.diesel.toFixed(2)}`;

  const rPetrol = document.getElementById('rateSetPetrol');
  const rDiesel = document.getElementById('rateSetDiesel');
  if (rPetrol) rPetrol.value = STATE.rates.petrol;
  if (rDiesel) rDiesel.value = STATE.rates.diesel;

  const qPetrol = document.getElementById('quickRatePetrol');
  const qDiesel = document.getElementById('quickRateDiesel');
  if (qPetrol) qPetrol.value = STATE.rates.petrol;
  if (qDiesel) qDiesel.value = STATE.rates.diesel;
}

// --- VIEW ROUTING (STAFF ONLY OR ADMIN ONLY UPON LOGIN) ---
function routeUserView() {
  const loginView = document.getElementById('loginView');
  const empView = document.getElementById('employeeView');
  const admView = document.getElementById('adminView');
  const navLogged = document.getElementById('navLoggedInBox');
  const navGuest = document.getElementById('navGuestBox');
  const navUser = document.getElementById('navUserName');
  const navRole = document.getElementById('navUserRole');

  // Case 1: NOT LOGGED IN -> Show Login Box ONLY
  if (!STATE.currentUser) {
    if (loginView) loginView.classList.remove('hidden');
    if (empView) empView.classList.add('hidden');
    if (admView) admView.classList.add('hidden');
    if (navLogged) navLogged.classList.add('hidden');
    if (navGuest) navGuest.classList.remove('hidden');
    return;
  }

  // Logged In: update top bar
  if (navGuest) navGuest.classList.add('hidden');
  if (navLogged) navLogged.classList.remove('hidden');
  if (navUser) navUser.innerText = STATE.currentUser.name || 'User';
  if (navRole) navRole.innerText = STATE.currentUser.role === 'admin' ? 'Admin' : 'Staff';

  // Case 2: ADMIN LOGGED IN -> Show Admin Dashboard ONLY
  if (STATE.currentUser.role === 'admin') {
    STATE.role = 'admin';
    STATE.adminUnlocked = true;
    if (loginView) loginView.classList.add('hidden');
    if (empView) empView.classList.add('hidden');
    if (admView) admView.classList.remove('hidden');

    const pinGate = document.getElementById('adminPinGate');
    const dashboard = document.getElementById('adminDashboard');
    if (pinGate) pinGate.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');

    renderAdminDashboard();
    return;
  }

  // Case 3: EMPLOYEE LOGGED IN -> Show Staff View ONLY
  if (STATE.currentUser.role === 'employee') {
    STATE.role = 'employee';
    if (loginView) loginView.classList.add('hidden');
    if (admView) admView.classList.add('hidden');
    if (empView) empView.classList.remove('hidden');

    // Resolve assigned pump for this employee from Admin Duty Roster
    resolveEmployeePumpLock();
    renderEmployeeView();
  }
}

// Resolve duty station assigned by Admin (attendant cannot tamper/choose)
function resolveEmployeePumpLock() {
  const empName = STATE.currentUser.name;
  const assignments = STATE.dutyAssignments || {};

  let assignedStation = null;
  for (const stKey of ['S1', 'S2', 'S3', 'S4']) {
    if (assignments[stKey]?.employeeName === empName || assignments[stKey]?.employeeId === STATE.currentUser.id) {
      assignedStation = stKey;
      break;
    }
  }

  // Check shift stations fallback
  if (!assignedStation && STATE.shift?.stations) {
    for (const stKey of ['S1', 'S2', 'S3', 'S4']) {
      if (STATE.shift.stations[stKey]?.employeeName === empName) {
        assignedStation = stKey;
        break;
      }
    }
  }

  // Set selected station & attendant
  STATE.selectedEmployeeName = empName;
  STATE.selectedStation = assignedStation || 'S1';
  STATE.currentUser.assignedStation = assignedStation;

  // Update Attendant Duty Banner
  const nameEl = document.getElementById('empLoggedInName');
  const pumpDesc = document.getElementById('empAssignedPumpDescription');
  const lockBadge = document.getElementById('empLockStatusBadge');
  const stCodeEl = document.getElementById('empReadingStationCode');

  if (nameEl) nameEl.innerText = empName;

  if (assignedStation) {
    const cfg = STATION_CONFIG[assignedStation];
    if (pumpDesc) {
      pumpDesc.innerHTML = `కేటాయించిన పంప్: <strong class="text-amber-300 font-bold">Station ${assignedStation} (${cfg.pump} - ${cfg.side})</strong>`;
    }
    if (lockBadge) lockBadge.innerText = `🔒 Duty Locked to Station ${assignedStation}`;
    if (stCodeEl) stCodeEl.innerText = `Station ${assignedStation} (${cfg.pump})`;
  } else {
    if (pumpDesc) {
      pumpDesc.innerHTML = `<span class="text-amber-400 font-bold">⚠️ ఈ షిఫ్ట్ కు మీకు పంప్ కేటాయించలేదు. దయచేసి అడ్మిన్ ను సంప్రదించండి.</span>`;
    }
    if (lockBadge) lockBadge.innerText = `Pending Duty Assignment`;
    if (stCodeEl) stCodeEl.innerText = `Station S1 (Default)`;
  }
}

// --- AUTHENTICATION (SIGN IN, LOGOUT, CHANGE PASSWORD) ---
async function handleLoginSubmit(event) {
  event.preventDefault();

  const userField = document.getElementById('loginUsernameInput');
  const passField = document.getElementById('loginPasswordInput');
  const errEl = document.getElementById('loginErrorMessage');

  const username = userField ? userField.value.trim() : '';
  const password = passField ? passField.value.trim() : '';

  if (!username || !password) {
    if (errEl) {
      errEl.innerText = 'Please enter mobile number/username and password';
      errEl.classList.remove('hidden');
    }
    return;
  }

  try {
    const res = await fetch(`/api/auth/login?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, date: STATE.selectedDate })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      if (errEl) {
        errEl.innerText = data.error || 'Invalid mobile number or password';
        errEl.classList.remove('hidden');
      }
      return;
    }

    // Success: store in state and sessionStorage
    STATE.currentUser = {
      ...data.user,
      role: data.role,
      assignedStation: data.assignedStation
    };
    sessionStorage.setItem('srr_current_user', JSON.stringify(STATE.currentUser));

    if (errEl) errEl.classList.add('hidden');
    if (passField) passField.value = '';

    showToast(`Welcome, ${STATE.currentUser.name}!`);
    routeUserView();

  } catch (err) {
    console.error('Login error:', err);
    if (errEl) {
      errEl.innerText = 'Connection error. Please try again.';
      errEl.classList.remove('hidden');
    }
  }
}

function logoutUser() {
  sessionStorage.removeItem('srr_current_user');
  STATE.currentUser = null;
  STATE.adminUnlocked = false;
  showToast('Logged out successfully');
  routeUserView();
}

function showLoginScreen() {
  STATE.currentUser = null;
  sessionStorage.removeItem('srr_current_user');
  routeUserView();
}

function togglePasswordVisibility(inputId) {
  const el = document.getElementById(inputId);
  if (el) {
    el.type = el.type === 'password' ? 'text' : 'password';
  }
}

// Change Password Modal
function openChangePasswordModal() {
  document.getElementById('cpOldPassword').value = '';
  document.getElementById('cpNewPassword').value = '';
  document.getElementById('cpConfirmPassword').value = '';
  document.getElementById('modalChangePassword').classList.remove('hidden');
}

function closeChangePasswordModal() {
  document.getElementById('modalChangePassword').classList.add('hidden');
}

async function submitChangePassword() {
  const oldPassword = document.getElementById('cpOldPassword').value.trim();
  const newPassword = document.getElementById('cpNewPassword').value.trim();
  const confirmPassword = document.getElementById('cpConfirmPassword').value.trim();

  if (!oldPassword || !newPassword) {
    showToast('Please enter both old and new password', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match!', 'error');
    return;
  }

  if (newPassword.length < 3) {
    showToast('Password must be at least 3 characters', 'error');
    return;
  }

  try {
    const payload = {
      role: STATE.currentUser?.role,
      userId: STATE.currentUser?.id,
      oldPassword,
      newPassword
    };

    const res = await fetch(`/api/auth/change-password?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Password changed successfully!');
      closeChangePasswordModal();
    } else {
      showToast(data.error || 'Failed to change password', 'error');
    }
  } catch (err) {
    showToast('Failed to update password', 'error');
  }
}

// --- MULTI-TENANT PDB SWITCHING ---
function renderTenantSelector() {
  const select = document.getElementById('tenantSelectDropdown');
  if (!select) return;

  select.innerHTML = STATE.tenants.map(t => `
    <option value="${t.id}" ${t.id === STATE.activeTenant ? 'selected' : ''}>
      🏢 ${t.name} (${t.brand})
    </option>
  `).join('');
}

function switchOilPumpTenant(tenantId) {
  STATE.activeTenant = tenantId;
  const url = new URL(window.location.href);
  url.searchParams.set('pump', tenantId);
  window.history.pushState({}, '', url);
  loadAllData();
  showToast(`Switched to ${tenantId.toUpperCase()} Database`);
}

// --- EMPLOYEE VIEW CONTROLLER ---
function switchEmployeeTab(tab) {
  STATE.employeeTab = tab;
  const tabs = ['reading', 'testing', 'reminder', 'vehicle', 'handover'];
  
  tabs.forEach(t => {
    const btn = document.getElementById(`empTabBtn-${t}`);
    const sec = document.getElementById(`empSection-${t}`);
    if (btn && sec) {
      if (t === tab) {
        btn.className = "emp-tab-btn active flex-1 py-2.5 px-2 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 bg-orange-600 text-white shadow-md shrink-0";
        sec.classList.remove('hidden');
      } else {
        btn.className = "emp-tab-btn flex-1 py-2.5 px-2 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 shrink-0";
        sec.classList.add('hidden');
      }
    }
  });

  if (tab === 'testing') renderTestingLog();
  if (tab === 'reminder') renderEmployeeReminders();
  if (tab === 'vehicle') renderEmployeeVehicleEntries();
}

function renderEmployeeView() {
  const stId = STATE.selectedStation;
  const cfg = STATION_CONFIG[stId] || STATION_CONFIG.S1;
  const stData = STATE.shift?.stations?.[stId] || {};

  // Update Headers & Meter codes
  const titleEl = document.getElementById('activeStationTitle');
  if (titleEl) titleEl.innerText = `రీడింగ్ నమోదు - Station ${stId} (${cfg.side})`;

  const pCodeEl = document.getElementById('petrolMeterCode');
  const dCodeEl = document.getElementById('dieselMeterCode');
  if (pCodeEl) pCodeEl.innerText = cfg.petrolCode;
  if (dCodeEl) dCodeEl.innerText = cfg.dieselCode;

  // Pre-fill meter readings
  const pOpen = stData.meters?.petrol?.open ?? '';
  const pClose = stData.meters?.petrol?.close ?? '';
  const dOpen = stData.meters?.diesel?.open ?? '';
  const dClose = stData.meters?.diesel?.close ?? '';

  const pOpenInput = document.getElementById('empPetrolOpen');
  const pCloseInput = document.getElementById('empPetrolClose');
  const dOpenInput = document.getElementById('empDieselOpen');
  const dCloseInput = document.getElementById('empDieselClose');

  if (pOpenInput) pOpenInput.value = pOpen;
  if (pCloseInput) pCloseInput.value = pClose ? pClose : '';
  if (dOpenInput) dOpenInput.value = dOpen;
  if (dCloseInput) dCloseInput.value = dClose ? dClose : '';

  // Testing litres (dedicated tab records)
  const pTesting = Number(stData.meters?.petrol?.testing || 0);
  const dTesting = Number(stData.meters?.diesel?.testing || 0);
  const totalTesting = (pTesting + dTesting).toFixed(1);

  const pTestDisp = document.getElementById('empPetrolTestingLitresDisplay');
  const dTestDisp = document.getElementById('empDieselTestingLitresDisplay');
  const testBadge = document.getElementById('empTestingBadgeCount');

  if (pTestDisp) pTestDisp.innerText = `${pTesting.toFixed(2)} L`;
  if (dTestDisp) dTestDisp.innerText = `${dTesting.toFixed(2)} L`;
  if (testBadge) testBadge.innerText = `${totalTesting} L`;

  // Pre-fill collections handover
  const cashInput = document.getElementById('empHandoverCash');
  const upiInput = document.getElementById('empHandoverUpi');
  const cardInput = document.getElementById('empHandoverCard');
  const expInput = document.getElementById('empHandoverExpenses');
  const expReasonInput = document.getElementById('empHandoverExpenseReason');
  const notesInput = document.getElementById('empHandoverNotes');

  if (cashInput) cashInput.value = stData.collections?.cash || '';
  if (upiInput) upiInput.value = stData.collections?.upi || '';
  if (cardInput) cardInput.value = stData.collections?.card || '';
  if (expInput) expInput.value = stData.collections?.expenses || '';
  if (expReasonInput) expReasonInput.value = stData.collections?.expenseReason || '';
  if (notesInput) notesInput.value = stData.collections?.notes || '';

  // Badges
  const pendingReminders = STATE.reminders.filter(r => r.stationId === stId && r.status === 'pending');
  const badgeRem = document.getElementById('empReminderBadgeCount');
  if (badgeRem) badgeRem.innerText = pendingReminders.length;

  const currentVehicles = STATE.vehicleLedger.filter(v => v.stationId === stId);
  const badgeVeh = document.getElementById('empVehicleBadgeCount');
  if (badgeVeh) badgeVeh.innerText = currentVehicles.length;

  calculateEmployeeLiveLitres();
  renderTestingLog();
  renderEmployeeReminders();
  renderEmployeeVehicleEntries();
}

function calculateEmployeeLiveLitres() {
  const stId = STATE.selectedStation;
  const stData = STATE.shift?.stations?.[stId] || {};

  const pOpen = parseFloat(document.getElementById('empPetrolOpen')?.value) || 0;
  const pClose = parseFloat(document.getElementById('empPetrolClose')?.value) || 0;
  const pTest = Number(stData.meters?.petrol?.testing || 0);

  let pLitres = 0;
  if (pClose > pOpen) pLitres = Math.max(0, pClose - pOpen - pTest);
  const pResEl = document.getElementById('empPetrolSaleResult');
  if (pResEl) pResEl.innerText = `${pLitres.toFixed(2)} L`;

  const dOpen = parseFloat(document.getElementById('empDieselOpen')?.value) || 0;
  const dClose = parseFloat(document.getElementById('empDieselClose')?.value) || 0;
  const dTest = Number(stData.meters?.diesel?.testing || 0);

  let dLitres = 0;
  if (dClose > dOpen) dLitres = Math.max(0, dClose - dOpen - dTest);
  const dResEl = document.getElementById('empDieselSaleResult');
  if (dResEl) dResEl.innerText = `${dLitres.toFixed(2)} L`;
}

async function saveStationReadings() {
  const pOpen = parseFloat(document.getElementById('empPetrolOpen').value) || 0;
  const pClose = parseFloat(document.getElementById('empPetrolClose').value) || 0;
  const dOpen = parseFloat(document.getElementById('empDieselOpen').value) || 0;
  const dClose = parseFloat(document.getElementById('empDieselClose').value) || 0;

  const stData = STATE.shift?.stations?.[STATE.selectedStation] || {};
  const pTest = Number(stData.meters?.petrol?.testing || 0);
  const dTest = Number(stData.meters?.diesel?.testing || 0);

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    employeeName: STATE.selectedEmployeeName,
    meters: {
      petrol: { open: pOpen, close: pClose, testing: pTest },
      diesel: { open: dOpen, close: dClose, testing: dTest }
    }
  };

  try {
    const res = await fetch(`/api/shifts/station-readings?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Station ${STATE.selectedStation} readings saved!`);
      loadAllData();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to save readings', 'error');
  }
}

// --- DEDICATED TESTING TAB CONTROLLER ---
async function submitTestingLitres() {
  const fuelType = document.getElementById('testingFuelSelect').value;
  const litres = parseFloat(document.getElementById('testingLitresInput').value) || 0;
  const reason = document.getElementById('testingReasonInput').value.trim();

  if (litres <= 0) {
    showToast('దయచేసి సరైన టెస్టింగ్ లీటర్లను నమోదు చేయండి (e.g. 5.0)', 'error');
    return;
  }

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    fuelType,
    litres,
    reason: reason || "Daily calibration check poured back to tank"
  };

  try {
    const res = await fetch(`/api/shifts/testing?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      showToast(`టెస్టింగ్ ${litres} L (${fuelType}) సేవ్ అయింది. అమ్మకం నుంచి మినహాయించబడింది.`);
      document.getElementById('testingLitresInput').value = '';
      document.getElementById('testingReasonInput').value = '';
      await loadAllData();
      switchEmployeeTab('reading');
    } else {
      showToast(result.error || 'Failed to save testing', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to record testing', 'error');
  }
}

async function deleteTestingLitres(id) {
  if (!confirm('ఈ టెస్టింగ్ రికార్డును తొలగించాలా? (Delete testing record?)')) return;

  try {
    const res = await fetch(`/api/shifts/testing/${id}?pump=${STATE.activeTenant}&date=${STATE.selectedDate}&stationId=${STATE.selectedStation}`, {
      method: 'DELETE'
    });

    const result = await res.json();
    if (result.success) {
      showToast('Testing record deleted');
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to delete testing record', 'error');
  }
}

function renderTestingLog() {
  const container = document.getElementById('empTestingLogContainer');
  if (!container) return;

  const stData = STATE.shift?.stations?.[STATE.selectedStation] || {};
  const records = stData.testingRecords || [];

  if (records.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
        ఈ స్టేషన్ వద్ద ఎలాంటి టెస్టింగ్ రికార్డులు లేవు. (No testing logged yet for this station)
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="w-full text-xs text-left border-collapse">
      <thead>
        <tr class="bg-purple-100 text-purple-950 uppercase font-bold border-b border-purple-200">
          <th class="p-2">Time</th>
          <th class="p-2">Fuel Type</th>
          <th class="p-2">Litres (L)</th>
          <th class="p-2">Reason / Details</th>
          <th class="p-2 text-right">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 font-medium">
        ${records.map(r => `
          <tr class="hover:bg-slate-50">
            <td class="p-2 font-mono text-slate-500">${r.time || '-'}</td>
            <td class="p-2 font-bold">${r.fuelType === 'Petrol' ? '⛽ పెట్రోల్ (MS)' : '🛢️ డీజిల్ (HSD)'}</td>
            <td class="p-2 font-mono font-black text-purple-800 text-sm">${(r.litres || 0).toFixed(2)} L</td>
            <td class="p-2 text-slate-600">${r.reason || 'Calibration testing'}</td>
            <td class="p-2 text-right">
              <button onclick="deleteTestingLitres('${r.id}')" class="text-rose-600 hover:text-rose-800 font-bold text-[11px] px-2 py-0.5 rounded border border-rose-200 hover:bg-rose-50">
                🗑️ Delete
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// --- SHIFT HANDOVER ---
async function submitShiftHandover() {
  const cash = parseFloat(document.getElementById('empHandoverCash').value) || 0;
  const upi = parseFloat(document.getElementById('empHandoverUpi').value) || 0;
  const card = parseFloat(document.getElementById('empHandoverCard').value) || 0;
  const expenses = parseFloat(document.getElementById('empHandoverExpenses').value) || 0;
  const expenseReason = document.getElementById('empHandoverExpenseReason').value.trim();
  const notes = document.getElementById('empHandoverNotes').value.trim();

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    collections: { cash, upi, card, expenses, expenseReason, notes }
  };

  try {
    const res = await fetch(`/api/shifts/station-handover?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Shift collections submitted!`);
      loadAllData();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to submit handover', 'error');
  }
}

// --- AMOUNT REMINDERS (TEMPORARY MARKER, NOT CREDIT) ---
async function submitQuickReminder() {
  const customerName = document.getElementById('quickReminderCustomer').value.trim();
  const vehicleNumber = document.getElementById('quickReminderVehicle').value.trim();
  const fuelType = document.getElementById('quickReminderFuel').value;
  const amount = parseFloat(document.getElementById('quickReminderAmount').value) || 0;
  const notes = document.getElementById('quickReminderNotes').value.trim();

  if (!customerName || amount <= 0) {
    showToast('దయచేసి కస్టమర్ పేరు మరియు అమౌంట్ నమోదు చేయండి', 'error');
    return;
  }

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    employeeName: STATE.selectedEmployeeName,
    customerName,
    vehicleNumber,
    fuelType,
    amount,
    notes
  };

  try {
    const res = await fetch(`/api/reminders?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast('రిమైండర్ సేవ్ అయింది (Reminder saved!)');
      document.getElementById('quickReminderCustomer').value = '';
      document.getElementById('quickReminderVehicle').value = '';
      document.getElementById('quickReminderAmount').value = '';
      document.getElementById('quickReminderNotes').value = '';
      loadAllData();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to save reminder', 'error');
  }
}

function renderEmployeeReminders() {
  const container = document.getElementById('empReminderListContainer');
  if (!container) return;

  const list = STATE.reminders.filter(r => r.stationId === STATE.selectedStation);
  if (list.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs">ఈ స్టేషన్ వద్ద ఎలాంటి రిమైండర్లు లేవు.</div>`;
    return;
  }

  container.innerHTML = `
    <table class="w-full text-xs text-left border-collapse">
      <thead>
        <tr class="bg-amber-100 text-amber-950 uppercase font-bold border-b border-amber-200">
          <th class="p-2">Time</th>
          <th class="p-2">Customer Name</th>
          <th class="p-2">Vehicle No</th>
          <th class="p-2">Fuel</th>
          <th class="p-2">Amount (₹)</th>
          <th class="p-2">Notes</th>
          <th class="p-2">Status</th>
          <th class="p-2 text-right">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 font-medium">
        ${list.map(r => `
          <tr class="hover:bg-slate-50">
            <td class="p-2 font-mono text-slate-500">${r.time || '-'}</td>
            <td class="p-2 font-bold text-slate-900">${r.customerName}</td>
            <td class="p-2 font-mono font-bold text-slate-700">${r.vehicleNumber || '-'}</td>
            <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.fuelType === 'Petrol' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">${r.fuelType}</span></td>
            <td class="p-2 font-mono font-black text-amber-800 text-sm">₹${r.amount.toLocaleString('en-IN')}</td>
            <td class="p-2 text-slate-600">${r.notes || '-'}</td>
            <td class="p-2"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'cleared' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${r.status === 'cleared' ? '✓ Received' : '⏳ Pending'}</span></td>
            <td class="p-2 text-right">
              ${r.status === 'pending' ? `
                <button onclick="clearReminder('${r.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1 rounded shadow">
                  డబ్బులు వచ్చాయి (Received)
                </button>
              ` : `<span class="text-[10px] text-emerald-600 font-bold">Done</span>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function clearReminder(id) {
  if (!confirm('Mark reminder as Received / Cleared?')) return;
  try {
    const res = await fetch(`/api/reminders/${id}/clear?pump=${STATE.activeTenant}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearedMode: 'Cash' })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Reminder cleared!');
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to clear reminder', 'error');
  }
}

// --- FLEET VEHICLE ACCOUNT (RECURRING MULTI-DAY LEDGER) ---
function updateVehicleRateAndAmount() {
  const fuel = document.getElementById('vlogFuelType').value;
  const litres = parseFloat(document.getElementById('vlogLitres').value) || 0;
  const rate = fuel === 'Petrol' ? STATE.rates.petrol : STATE.rates.diesel;
  const amount = Math.round(litres * rate);
  document.getElementById('vlogAmount').value = amount > 0 ? amount : '';
}

async function submitVehicleFuelingEntry() {
  const vehicleNumber = document.getElementById('vlogVehicleNo').value.trim();
  const driverName = document.getElementById('vlogDriverName').value.trim();
  const fuelType = document.getElementById('vlogFuelType').value;
  const litres = parseFloat(document.getElementById('vlogLitres').value) || 0;
  const rate = fuelType === 'Petrol' ? STATE.rates.petrol : STATE.rates.diesel;
  const amount = parseFloat(document.getElementById('vlogAmount').value) || Math.round(litres * rate);
  const slipNo = document.getElementById('vlogSlipNo').value.trim();

  if (!vehicleNumber || amount <= 0) {
    showToast('దయచేసి వాహనం నంబర్ మరియు సరైన వివరాలు నమోదు చేయండి', 'error');
    return;
  }

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    employeeName: STATE.selectedEmployeeName,
    vehicleNumber,
    driverName,
    fuelType,
    litres,
    rate,
    amount,
    slipNo
  };

  try {
    const res = await fetch(`/api/vehicle-ledger?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast('వాహనం ఖాతాలో ఇంధనం నమోదు చేయబడింది!');
      document.getElementById('vlogVehicleNo').value = '';
      document.getElementById('vlogDriverName').value = '';
      document.getElementById('vlogLitres').value = '';
      document.getElementById('vlogAmount').value = '';
      document.getElementById('vlogSlipNo').value = '';
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to save vehicle fueling entry', 'error');
  }
}

function renderEmployeeVehicleEntries() {
  const container = document.getElementById('empVehicleListContainer');
  if (!container) return;

  // STRICT RULE: Attendant ONLY sees entries from current shift
  const currentEntries = STATE.vehicleLedger.filter(v => v.stationId === STATE.selectedStation);
  if (currentEntries.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs">ఈ షిఫ్ట్ లో ఎలాంటి వాహనాల ఖాతా నమోదు కాలేదు.</div>`;
    return;
  }

  container.innerHTML = `
    <table class="w-full text-xs text-left border-collapse">
      <thead>
        <tr class="bg-blue-100 text-blue-950 uppercase font-bold border-b border-blue-200">
          <th class="p-2">Time</th>
          <th class="p-2">Vehicle No</th>
          <th class="p-2">Driver</th>
          <th class="p-2">Fuel</th>
          <th class="p-2">Litres</th>
          <th class="p-2">Amount (₹)</th>
          <th class="p-2">Slip No</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 font-medium">
        ${currentEntries.map(v => `
          <tr class="hover:bg-slate-50">
            <td class="p-2 font-mono text-slate-500">${v.time || '-'}</td>
            <td class="p-2 font-mono font-black text-slate-900">${v.vehicleNumber}</td>
            <td class="p-2 font-semibold text-slate-700">${v.driverName || '-'}</td>
            <td class="p-2 font-bold">${v.fuelType}</td>
            <td class="p-2 font-mono font-bold text-blue-700">${(v.litres || 0).toFixed(2)} L</td>
            <td class="p-2 font-mono font-black text-slate-900">₹${(v.amount || 0).toLocaleString('en-IN')}</td>
            <td class="p-2 font-mono text-slate-500">${v.slipNo || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// --- ADMIN DASHBOARD CONTROLLER ---
function switchAdminTab(tabKey) {
  STATE.adminTab = tabKey;
  const tabs = ['summary', 'fleet', 'reminders', 'employees', 'roster', 'pdbs', 'rates', 'tanks'];
  
  tabs.forEach(t => {
    const btn = document.getElementById(`admTab-${t}`);
    const sec = document.getElementById(`admSection-${t}`);
    if (btn && sec) {
      if (t === tabKey) {
        btn.className = "admin-tab-btn active px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all bg-orange-600 text-white shadow";
        sec.classList.remove('hidden');
      } else {
        btn.className = "admin-tab-btn px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white text-slate-700 hover:bg-slate-100 border border-slate-200";
        sec.classList.add('hidden');
      }
    }
  });

  renderAdminDashboard();
}

function renderAdminDashboard() {
  if (!STATE.summary) return;

  // 1. Slip & Financials
  const preSlip = document.getElementById('preSlipText');
  if (preSlip) preSlip.innerText = STATE.summary.slipText;

  const sumDateEl = document.getElementById('sumShiftDate');
  if (sumDateEl) sumDateEl.innerText = STATE.summary.dateFormatted;

  const grandAmtEl = document.getElementById('cardGrandTotalAmount');
  if (grandAmtEl) grandAmtEl.innerText = `₹${STATE.summary.grandTotal.formattedAmount}`;

  const pAmtEl = document.getElementById('cardPetrolAmt');
  const pVolEl = document.getElementById('cardPetrolVol');
  if (pAmtEl) pAmtEl.innerText = `₹${STATE.summary.petrol.formattedAmount}`;
  if (pVolEl) pVolEl.innerText = `${STATE.summary.petrol.formattedLitres} Litres`;

  const dAmtEl = document.getElementById('cardDieselAmt');
  const dVolEl = document.getElementById('cardDieselVol');
  if (dAmtEl) dAmtEl.innerText = `₹${STATE.summary.diesel.formattedAmount}`;
  if (dVolEl) dVolEl.innerText = `${STATE.summary.diesel.formattedLitres} Litres`;

  // Reconciliation
  const totalCash = document.getElementById('recTotalCash');
  const totalUpi = document.getElementById('recTotalUpi');
  const totalCard = document.getElementById('recTotalCard');
  if (totalCash) totalCash.innerText = `₹${(STATE.summary.reconciliation.totalCash || 0).toLocaleString('en-IN')}`;
  if (totalUpi) totalUpi.innerText = `₹${(STATE.summary.reconciliation.totalUpi || 0).toLocaleString('en-IN')}`;
  if (totalCard) totalCard.innerText = `₹${(STATE.summary.reconciliation.totalCard || 0).toLocaleString('en-IN')}`;

  // Reminders badge
  const pendingRems = STATE.reminders.filter(r => r.status === 'pending');
  const badgeRem = document.getElementById('badgePendingReminderCount');
  if (badgeRem) badgeRem.innerText = pendingRems.length;

  // Station breakdown cards
  renderStationBreakdownCards();

  // Active admin tab rendering
  if (STATE.adminTab === 'fleet') renderAdminFleetLedger();
  if (STATE.adminTab === 'reminders') renderAdminRemindersTable();
  if (STATE.adminTab === 'employees') renderAdminEmployeesTable();
  if (STATE.adminTab === 'roster') renderAdminDutyRoster();
  if (STATE.adminTab === 'pdbs') renderAdminPdbs();
  if (STATE.adminTab === 'tanks') renderTanksView();
}

function renderStationBreakdownCards() {
  const container = document.getElementById('stationBreakdownContainer');
  if (!container || !STATE.summary?.stationBreakdown) return;

  container.innerHTML = Object.entries(STATE.summary.stationBreakdown).map(([stKey, info]) => {
    const cfg = STATION_CONFIG[stKey];
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span class="font-black text-slate-900 text-sm">Station ${stKey}</span>
            <span class="text-[11px] text-slate-500">(${cfg.pump})</span>
          </div>
          <span class="bg-blue-50 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">${info.employeeName}</span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="bg-amber-50/60 p-2 rounded-lg border border-amber-200">
            <span class="text-[10px] text-amber-900 font-bold block">Petrol (${info.petrol.meterCode}):</span>
            <span class="font-mono font-bold text-slate-900">${info.petrol.saleLitres.toFixed(2)} L</span>
            <span class="text-[10px] font-mono font-black text-orange-600 block">₹${info.petrol.amount.toLocaleString('en-IN')}</span>
          </div>
          <div class="bg-blue-50/60 p-2 rounded-lg border border-blue-200">
            <span class="text-[10px] text-blue-900 font-bold block">Diesel (${info.diesel.meterCode}):</span>
            <span class="font-mono font-bold text-slate-900">${info.diesel.saleLitres.toFixed(2)} L</span>
            <span class="text-[10px] font-mono font-black text-blue-600 block">₹${info.diesel.amount.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <span class="text-slate-500 font-bold">Station Total:</span>
          <span class="font-mono font-black text-slate-900 text-sm">₹${info.totalAmount.toLocaleString('en-IN')}</span>
        </div>
      </div>
    `;
  }).join('');
}

// --- ADMIN FLEET VEHICLE LEDGER & SUM CALCULATOR ---
async function renderAdminFleetLedger() {
  try {
    const res = await fetch(`/api/vehicle-ledger?pump=${STATE.activeTenant}`);
    const fullLedger = await res.json();
    const tbody = document.getElementById('adminFleetTableBody');
    if (!tbody) return;

    if (fullLedger.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400 text-xs">No fleet vehicle logs found.</td></tr>`;
      return;
    }

    tbody.innerHTML = fullLedger.map(v => `
      <tr class="hover:bg-slate-50 transition-all">
        <td class="p-2.5 font-mono text-slate-500 text-[11px]">${v.date} ${v.time || ''}</td>
        <td class="p-2.5 font-mono font-black text-blue-900 cursor-pointer underline" onclick="setFleetSearchAndCalculate('${v.vehicleNumber}')">${v.vehicleNumber}</td>
        <td class="p-2.5 font-semibold text-slate-800">${v.driverName || '-'}</td>
        <td class="p-2.5 font-bold">${v.stationId}</td>
        <td class="p-2.5 font-bold">${v.fuelType}</td>
        <td class="p-2.5 font-mono font-bold text-blue-700">${(v.litres || 0).toFixed(2)} L</td>
        <td class="p-2.5 font-mono text-slate-600">₹${v.rate || '-'}</td>
        <td class="p-2.5 font-mono font-black text-slate-900">₹${(v.amount || 0).toLocaleString('en-IN')}</td>
        <td class="p-2.5 font-mono text-slate-500">${v.slipNo || '-'}</td>
        <td class="p-2.5">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${v.status === 'settled' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${v.status === 'settled' ? '✓ Settled' : '⏳ Unsettled'}
          </span>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function setFleetSearchAndCalculate(vNo) {
  const searchInput = document.getElementById('adminFleetVehicleSearch');
  if (searchInput) searchInput.value = vNo;
  calculateVehicleSum();
  window.scrollTo({ top: 300, behavior: 'smooth' });
}

async function calculateVehicleSum() {
  const searchInput = document.getElementById('adminFleetVehicleSearch');
  const vNo = searchInput ? searchInput.value.trim() : '';
  if (!vNo) return;

  try {
    const res = await fetch(`/api/vehicle-ledger/summary/${encodeURIComponent(vNo)}?pump=${STATE.activeTenant}`);
    const data = await res.json();

    const elVNo = document.getElementById('fleetResVehicleNo');
    const elVol = document.getElementById('fleetResTotalLitres');
    const elTot = document.getElementById('fleetResTotalAmount');
    const elDue = document.getElementById('fleetResDueAmount');

    if (elVNo) elVNo.innerText = data.vehicleNumber;
    if (elVol) elVol.innerText = `${data.totalLitres} Litres (${data.totalTrips} Trips)`;
    if (elTot) elTot.innerText = `₹${data.formattedTotalAmount}`;
    if (elDue) elDue.innerText = `₹${data.formattedUnsettledAmount} (${data.unsettledLitres} L)`;
  } catch (err) {
    console.error(err);
  }
}

async function settleCurrentVehicleFleet() {
  const elVNo = document.getElementById('fleetResVehicleNo');
  const vNo = elVNo ? elVNo.innerText.trim() : '';
  if (!vNo || vNo === '--') {
    showToast('Please search and calculate a vehicle first', 'error');
    return;
  }

  if (!confirm(`Settle all unsettled balances for vehicle "${vNo}"?`)) return;

  try {
    const res = await fetch(`/api/vehicle-ledger/settle?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleNumber: vNo, paymentMode: 'Cash' })
    });
    const result = await res.json();
    if (result.success) {
      showToast(result.message);
      calculateVehicleSum();
      renderAdminFleetLedger();
    }
  } catch (err) {
    showToast('Failed to settle vehicle account', 'error');
  }
}

// --- ADMIN AMOUNT REMINDERS TABLE ---
function renderAdminRemindersTable() {
  const tbody = document.getElementById('adminRemindersTableBody');
  if (!tbody) return;

  if (STATE.reminders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400 text-xs">No amount reminders logged.</td></tr>`;
    return;
  }

  tbody.innerHTML = STATE.reminders.map(r => `
    <tr class="hover:bg-slate-50 transition-all">
      <td class="p-2.5 font-mono text-slate-500 text-[11px]">${r.date} ${r.time || ''}</td>
      <td class="p-2.5 font-bold text-slate-900">${r.customerName}</td>
      <td class="p-2.5 font-mono font-bold text-slate-700">${r.vehicleNumber || '-'}</td>
      <td class="p-2.5 font-mono text-slate-600">${r.phone || '-'}</td>
      <td class="p-2.5 font-bold text-slate-800">${r.stationId}</td>
      <td class="p-2.5 font-mono font-black text-amber-800 text-sm">₹${r.amount.toLocaleString('en-IN')}</td>
      <td class="p-2.5 text-slate-600">${r.notes || '-'}</td>
      <td class="p-2.5">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'cleared' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          ${r.status === 'cleared' ? '✓ Received' : '⏳ Pending'}
        </span>
      </td>
      <td class="p-2.5 text-right">
        ${r.status === 'pending' ? `
          <button onclick="clearReminder('${r.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1 rounded shadow">
            Mark Received
          </button>
        ` : `<span class="text-[10px] text-emerald-600 font-bold">Done</span>`}
      </td>
    </tr>
  `).join('');
}

// --- ADMIN EMPLOYEE MANAGEMENT (KYC PROFILE) ---
function renderAdminEmployeesTable() {
  const tbody = document.getElementById('adminEmployeesTableBody');
  if (!tbody) return;

  if (STATE.employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 text-xs">No employees found.</td></tr>`;
    return;
  }

  tbody.innerHTML = STATE.employees.map(emp => `
    <tr class="hover:bg-slate-50 transition-all cursor-pointer" onclick="openEmpProfileModal('${emp.id}')">
      <td class="p-3 font-bold text-slate-900 flex items-center gap-2">
        <span class="text-base">👤</span>
        <span class="text-blue-700 hover:underline">${emp.name}</span>
      </td>
      <td class="p-3 font-semibold text-slate-800">${emp.fatherName || '-'}</td>
      <td class="p-3 text-slate-700 font-semibold">${emp.villageName || '-'}</td>
      <td class="p-3 font-mono text-slate-600">${emp.phone || '-'}</td>
      <td class="p-3 font-mono text-slate-700">${emp.aadhaarNumber || '-'}</td>
      <td class="p-3 text-right" onclick="event.stopPropagation()">
        <button onclick="deleteEmployee('${emp.id}', '${emp.name}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-[11px] px-2.5 py-1 rounded-lg">
          🗑️ Remove
        </button>
      </td>
    </tr>
  `).join('');
}

function openEmpProfileModal(empId) {
  const emp = STATE.employees.find(e => e.id === empId);
  if (!emp) return;

  document.getElementById('profEmpName').innerText = emp.name;
  document.getElementById('profEmpRole').innerText = emp.role || 'Attendant';
  document.getElementById('profEmpLoginPhone').innerText = emp.username || emp.phone || '-';
  document.getElementById('profEmpFatherName').innerText = emp.fatherName || 'Not recorded';
  document.getElementById('profEmpVillage').innerText = emp.villageName || 'Not recorded';
  document.getElementById('profEmpAadhaar').innerText = emp.aadhaarNumber || 'Not recorded';
  document.getElementById('profEmpEmergency').innerText = emp.emergencyContact || 'Not recorded';
  document.getElementById('profEmpAddress').innerText = emp.address || 'Not recorded';

  document.getElementById('modalEmpProfile').classList.remove('hidden');
}

function closeEmpProfileModal() {
  document.getElementById('modalEmpProfile').classList.add('hidden');
}

function openAddEmployeeModal() {
  document.getElementById('modalEmpName').value = '';
  document.getElementById('modalEmpFatherName').value = '';
  document.getElementById('modalEmpVillage').value = '';
  document.getElementById('modalEmpPhone').value = '';
  document.getElementById('modalEmpPassword').value = '1234';
  document.getElementById('modalEmpAadhaar').value = '';
  document.getElementById('modalEmpEmergency').value = '';
  document.getElementById('modalEmpAddress').value = '';
  document.getElementById('modalAddEmployee').classList.remove('hidden');
}

function closeAddEmployeeModal() {
  document.getElementById('modalAddEmployee').classList.add('hidden');
}

async function saveNewEmployee() {
  const name = document.getElementById('modalEmpName').value.trim();
  const fatherName = document.getElementById('modalEmpFatherName').value.trim();
  const villageName = document.getElementById('modalEmpVillage').value.trim();
  const phone = document.getElementById('modalEmpPhone').value.trim();
  const password = document.getElementById('modalEmpPassword').value.trim() || '1234';
  const aadhaarNumber = document.getElementById('modalEmpAadhaar').value.trim();
  const emergencyContact = document.getElementById('modalEmpEmergency').value.trim();
  const address = document.getElementById('modalEmpAddress').value.trim();
  const role = document.getElementById('modalEmpRole')?.value || 'Attendant';

  if (!name || !phone) {
    showToast('Name and Phone are required', 'error');
    return;
  }

  const payload = { name, fatherName, villageName, phone, password, aadhaarNumber, emergencyContact, address, role };

  try {
    const res = await fetch(`/api/employees?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Employee "${name}" added successfully!`);
      closeAddEmployeeModal();
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to add employee', 'error');
  }
}

async function deleteEmployee(id, name) {
  if (!confirm(`Are you sure you want to remove employee "${name}"?`)) return;
  try {
    const res = await fetch(`/api/employees/${id}?pump=${STATE.activeTenant}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      showToast(`Employee "${name}" removed`);
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to remove employee', 'error');
  }
}

// --- ADMIN DUTY ROSTER & PUMP ALLOCATION ---
function renderAdminDutyRoster() {
  const container = document.getElementById('dutyRosterCardsContainer');
  if (!container) return;

  const assignments = STATE.dutyAssignments || {};
  const stations = ['S1', 'S2', 'S3', 'S4'];

  container.innerHTML = stations.map(stKey => {
    const cfg = STATION_CONFIG[stKey];
    const assignedName = assignments[stKey]?.employeeName || STATE.shift?.stations?.[stKey]?.employeeName || "";

    return `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="font-black text-slate-900 text-sm">Station ${stKey}</span>
          <span class="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded">${cfg.pump}</span>
        </div>
        <div class="text-[11px] text-slate-600">
          Meters: Petrol (${cfg.petrolCode}) • Diesel (${cfg.dieselCode})
        </div>
        <div>
          <label class="text-[11px] font-bold text-slate-700 block mb-1">Assign Attendant:</label>
          <select id="rosterAssign-${stKey}" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900">
            <option value="">-- Choose Staff --</option>
            ${STATE.employees.map(e => `
              <option value="${e.name}" ${e.name === assignedName ? 'selected' : ''}>
                ${e.name}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
    `;
  }).join('');
}

async function saveDutyRosterAssignments() {
  const assignments = {};
  ['S1', 'S2', 'S3', 'S4'].forEach(stKey => {
    const empName = document.getElementById(`rosterAssign-${stKey}`)?.value || "";
    assignments[stKey] = { employeeName: empName };
  });

  try {
    const res = await fetch(`/api/duty-assignments?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: STATE.selectedDate, assignments })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Duty roster saved! Attendant screens updated.');
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to save duty assignments', 'error');
  }
}

// --- ORACLE PDB PROVISIONING ---
function renderAdminPdbs() {
  const container = document.getElementById('pdbTenantsContainer');
  if (!container) return;

  container.innerHTML = STATE.tenants.map(t => {
    const isActive = t.id === STATE.activeTenant;
    return `
      <div class="bg-white rounded-2xl shadow-md border ${isActive ? 'border-2 border-orange-500 ring-2 ring-orange-200' : 'border-slate-200'} p-5 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-black uppercase text-orange-600 bg-orange-50 px-2 py-0.5 rounded">${t.brand}</span>
          ${isActive ? '<span class="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">ACTIVE PDB</span>' : ''}
        </div>
        <div>
          <h4 class="font-black text-slate-900 text-base">${t.name}</h4>
          <span class="text-xs text-slate-500 font-mono">DB File: data/pdb/${t.dbFile}</span>
        </div>
        <div class="text-xs text-slate-600">${t.oilCompany}</div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-end">
          <button onclick="switchOilPumpTenant('${t.id}')" class="text-xs font-bold ${isActive ? 'bg-slate-200 text-slate-700' : 'bg-slate-900 text-white hover:bg-black'} px-3 py-1.5 rounded-lg shadow">
            ${isActive ? 'Currently Loaded' : 'Load This Database'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openCreatePdbModal() {
  document.getElementById('modalPdbName').value = '';
  document.getElementById('modalCreatePdb').classList.remove('hidden');
}

function closeCreatePdbModal() {
  document.getElementById('modalCreatePdb').classList.add('hidden');
}

async function provisionNewOilPumpPdb() {
  const name = document.getElementById('modalPdbName').value.trim();
  const brand = document.getElementById('modalPdbBrand').value;
  const adminPin = document.getElementById('modalPdbPin').value.trim();
  const location = document.getElementById('modalPdbLocation')?.value?.trim() || 'Highway Station';

  if (!name) {
    showToast('Please enter Oil Pump Name', 'error');
    return;
  }

  try {
    const res = await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, brand, adminPin, location })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`PDB for "${name}" provisioned successfully!`);
      closeCreatePdbModal();
      loadTenantsAndData();
    } else {
      showToast(result.error || 'Failed to create PDB', 'error');
    }
  } catch (err) {
    showToast('Failed to provision database', 'error');
  }
}

// --- RATES MANAGEMENT ---
function quickOpenRateModal() {
  document.getElementById('quickRatePetrol').value = STATE.rates.petrol;
  document.getElementById('quickRateDiesel').value = STATE.rates.diesel;
  document.getElementById('modalQuickRate').classList.remove('hidden');
}

function closeQuickRateModal() {
  document.getElementById('modalQuickRate').classList.add('hidden');
}

async function saveQuickRates() {
  const petrol = parseFloat(document.getElementById('quickRatePetrol').value);
  const diesel = parseFloat(document.getElementById('quickRateDiesel').value);

  try {
    const res = await fetch(`/api/rates?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: STATE.selectedDate, petrol, diesel })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Today’s Rates Updated! Sales slip recalculated.');
      closeQuickRateModal();
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to update rates', 'error');
  }
}

async function saveDailyRates() {
  const pRate = parseFloat(document.getElementById('rateSetPetrol').value);
  const dRate = parseFloat(document.getElementById('rateSetDiesel').value);
  const date = document.getElementById('rateSetDate').value || STATE.selectedDate;

  try {
    const res = await fetch(`/api/rates?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, petrol: pRate, diesel: dRate })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Rates updated! Slip recalculated.');
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to update rates', 'error');
  }
}

// --- TANK STOCK MANAGEMENT ---
function renderTanksView() {
  const container = document.getElementById('tanksContainer');
  if (!container || !STATE.tanks) return;

  container.innerHTML = STATE.tanks.map(t => {
    const pct = Math.min(100, Math.round((t.currentStock / t.capacity) * 100));
    const isPetrol = t.fuel === 'Petrol';
    const color = isPetrol ? 'orange' : 'blue';

    return `
      <div class="bg-white rounded-2xl shadow-md border border-slate-200 p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-3xl">${isPetrol ? '⛽' : '🛢️'}</span>
            <div>
              <h4 class="font-black text-slate-900 text-base">${t.name}</h4>
              <span class="text-xs text-slate-500">Underground Storage (${t.fuel})</span>
            </div>
          </div>
          <span class="text-xs font-mono font-bold bg-slate-100 px-2 py-1 rounded">Dip: ${t.dipCm || 0} CM</span>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-bold">
            <span class="text-slate-600">Stock Balance:</span>
            <span class="font-mono text-slate-900 text-sm">${(t.currentStock || 0).toLocaleString('en-IN')} / ${(t.capacity || 0).toLocaleString('en-IN')} L</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
            <div class="h-full bg-${color}-500 transition-all duration-500" style="width: ${pct}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// --- MOBILE APP LINK & QR MODAL ---
function openMobileLinkModal() {
  document.getElementById('modalMobileLink').classList.remove('hidden');
}

function closeMobileLinkModal() {
  document.getElementById('modalMobileLink').classList.add('hidden');
}

function copyMobileLink() {
  const url = document.getElementById('modalMobileUrlText').innerText;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Mobile Link copied to clipboard!');
  });
}

// --- SLIP ACTION UTILITIES ---
function shareSlipWhatsApp() {
  if (!STATE.summary?.slipText) return;
  const encoded = encodeURIComponent(STATE.summary.slipText);
  window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
}

function copySlipToClipboard() {
  if (!STATE.summary?.slipText) return;
  navigator.clipboard.writeText(STATE.summary.slipText).then(() => {
    const copyText = document.getElementById('copyText');
    const copyIcon = document.getElementById('copyIcon');
    if (copyText) copyText.innerText = 'Copied!';
    if (copyIcon) copyIcon.innerText = '✓';
    showToast('Daily Slip copied to clipboard');
    setTimeout(() => {
      if (copyText) copyText.innerText = 'Copy Slip';
      if (copyIcon) copyIcon.innerText = '📋';
    }, 2000);
  });
}

function printDailySlip() {
  window.print();
}
