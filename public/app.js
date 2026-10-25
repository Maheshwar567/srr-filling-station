/**
 * SRR Filling Station (Indian Oil) - Enterprise Client Application Controller
 * Features:
 * - English / Telugu Bilingual Language Toggle Option Tab
 * - Direct Role Segregation (Staff View OR Admin View ONLY upon login)
 * - Self-Service Authentication & Password Change for Employees & Admin
 * - Admin Assigned Read-Only Pump Lock for Attendants
 * - Dedicated Testing Tab (Litres automatically deducted from sale)
 * - Dedicated Card Swipe (POS) Tab with Auto-populated & Editable Date-Time
 * - Fleet Vehicle Multi-Day Ledger with Mandatory 10-Digit Mobile Number
 * - Automated "Nagadhu Lekka" (Cash Handover) Calculation Dashboard with live Tally
 * - Expense Reason & Amount Auto-Calculation
 * - Multi-Tenant Pluggable Database (Oracle PDB concept)
 */

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const STATE = {
  currentUser: null, // { id, name, username, role, assignedStation }
  role: 'employee',
  lang: localStorage.getItem('srr_lang') || 'te', // 'te' or 'en'
  adminUnlocked: false,
  activeTenant: 'srr-filling-station',
  tenants: [],
  selectedStation: 'S1',
  selectedEmployeeName: '',
  dutyAssignments: {},
  employeeTab: 'reading', // 'reading', 'testing', 'card', 'reminder', 'vehicle', 'handover'
  selectedDate: getTodayDateString(), // Defaults to Today's Date
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

  // Apply Language UI
  applyLanguageUI();

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

// --- LANGUAGE SWITCHER CONTROLLER (ENGLISH | TELUGU) ---
// User requirement: "when i choose english give english, telugu mean give telugu only"
function setAppLanguage(lang) {
  STATE.lang = lang;
  localStorage.setItem('srr_lang', lang);
  applyLanguageUI();
  showToast(lang === 'te' ? 'భాష తెలుగులోకి మార్చబడింది' : 'Language set to English');
}

function applyLanguageUI() {
  const isTe = STATE.lang === 'te';
  const btnTe = document.getElementById('langBtn-te');
  const btnEn = document.getElementById('langBtn-en');

  if (btnTe && btnEn) {
    if (isTe) {
      btnTe.className = "px-2.5 py-1 rounded-full text-xs font-black transition-all bg-amber-400 text-slate-900 shadow";
      btnEn.className = "px-2.5 py-1 rounded-full text-xs font-bold transition-all text-white hover:text-amber-300";
    } else {
      btnEn.className = "px-2.5 py-1 rounded-full text-xs font-black transition-all bg-amber-400 text-slate-900 shadow";
      btnTe.className = "px-2.5 py-1 rounded-full text-xs font-bold transition-all text-white hover:text-amber-300";
    }
  }

  // 1. Employee / Attendant Navigation Tabs
  const tReading = document.getElementById('tabText-reading');
  const tTesting = document.getElementById('tabText-testing');
  const tCard = document.getElementById('tabText-card');
  const tUpi = document.getElementById('tabText-upi');
  const tReminder = document.getElementById('tabText-reminder');
  const tVehicle = document.getElementById('tabText-vehicle');
  const tHandover = document.getElementById('tabText-handover');

  if (tReading) tReading.innerText = isTe ? 'రీడింగ్ నమోదు' : 'Meter Reading';
  if (tTesting) tTesting.innerText = isTe ? 'టెస్టింగ్ లీటర్లు' : 'Testing Litres';
  if (tCard) tCard.innerText = isTe ? 'కార్డ్ స్వైపులు' : 'Card Swipes';
  if (tUpi) tUpi.innerText = isTe ? 'యూపీఐ' : 'UPI';
  if (tReminder) tReminder.innerText = isTe ? 'రిమైండర్లు' : 'Reminders';
  if (tVehicle) tVehicle.innerText = isTe ? 'వాహనాల ఖాతా' : 'Vehicle Fleet';
  if (tHandover) tHandover.innerText = isTe ? 'నగదు లెక్క' : 'Cash Handover';

  // 2. Top Bar & Login Form
  const lblUser = document.getElementById('lblLoginUser');
  const lblPass = document.getElementById('lblLoginPass');
  const btnLogin = document.getElementById('btnLoginSubmit');
  const navSignIn = document.getElementById('navSignInLabel');
  const navLogout = document.getElementById('navLogoutLabel');
  const navPassword = document.getElementById('navPasswordLabel');

  if (lblUser) lblUser.innerText = isTe ? 'మొదటి పేరు లేదా యూజర్‌నేమ్:' : 'First Name or Username:';
  if (lblPass) lblPass.innerText = isTe ? 'పాస్‌వర్డ్:' : 'Password:';
  if (btnLogin) btnLogin.innerText = isTe ? 'లాగిన్ చేయండి' : 'Sign In';
  if (navSignIn) navSignIn.innerText = isTe ? 'లాగిన్' : 'Sign In';
  if (navLogout) navLogout.innerText = isTe ? 'నిష్క్రమించు' : 'Logout';
  if (navPassword) navPassword.innerText = isTe ? 'పాస్‌వర్డ్' : 'Password';

  // 3. Admin / Owner / Management Tabs
  const tabSum = document.getElementById('admTab-summary');
  const tabFin = document.getElementById('tabLabel-financials');
  const tabFlt = document.getElementById('tabLabel-fleet');
  const tabRem = document.getElementById('tabLabel-reminders');
  const tabEmp = document.getElementById('tabLabel-employees');
  const tabAdminHo = document.getElementById('tabLabel-adminHandover');
  const tabRos = document.getElementById('tabLabel-roster');
  const tabAtt = document.getElementById('tabLabel-attendance');
  const tabRat = document.getElementById('admTab-rates');
  const tabTnk = document.getElementById('admTab-tanks');
  const tabDue = document.getElementById('tabLabel-dues');
  const tabPdb = document.getElementById('admTab-pdbs');

  if (tabSum) tabSum.innerHTML = isTe ? '📄 రోజువారీ రసీదు' : '📄 Daily Sales Slip';
  if (tabAdminHo) tabAdminHo.innerText = isTe ? 'నగదు లెక్క' : 'Cash Handover';
  if (tabRos) tabRos.innerText = isTe ? 'పంపుల కేటాయింపు' : 'Pump Assignment';
  if (tabEmp) tabEmp.innerText = isTe ? 'సిబ్బంది జాబితా' : 'Employee List';
  if (tabDue) tabDue.innerText = isTe ? 'బాకీలు' : 'Due';
  if (tabAtt) tabAtt.innerText = isTe ? 'డ్యూటీ & జీతాలు' : 'Duty & Salary Days';
  if (tabFlt) tabFlt.innerText = isTe ? 'వాహనాల బిల్లులు' : 'Vehicle Bills';
  if (tabFin) tabFin.innerText = isTe ? 'ఆర్థిక నివేదికలు' : 'Financial Reports';
  if (tabRem) tabRem.innerText = isTe ? 'రిమైండర్లు' : 'Reminders';
  if (tabRat) tabRat.innerHTML = isTe ? '🏷️ ధరలు' : '🏷️ Rates';
  if (tabTnk) tabTnk.innerHTML = isTe ? '🛢️ ట్యాంక్ నిల్వ' : '🛢️ Tank Stock';
  if (tabPdb) tabPdb.innerHTML = isTe ? '🏢 ప్లగ్గబుల్ DBs' : '🏢 Pluggable DBs (PDBs)';

  // 4. Update Active Daily Sales Slip text
  if (STATE.summary) {
    const preSlip = document.getElementById('preSlipText');
    if (preSlip) {
      preSlip.innerText = isTe ? (STATE.summary.slipTextTe || STATE.summary.slipText) : (STATE.summary.slipTextEn || STATE.summary.slipText);
    }
  }

  // 5. Update Financial Reports Section (Owner only)
  const finTitle = document.getElementById('finHeaderTitle');
  const finSubtitle = document.getElementById('finHeaderSubtitle');
  const finRefreshBtn = document.getElementById('finRefreshBtn');
  const finTotalSalesLbl = document.getElementById('finLblTotalSales');
  const finPetrolSoldLbl = document.getElementById('finLblPetrolSold');
  const finDieselSoldLbl = document.getElementById('finLblDieselSold');
  const finFleetDuesLbl = document.getElementById('finLblFleetDues');
  const finHistSlipHeading = document.getElementById('finHistSlipHeading');
  const finCopySlipBtn = document.getElementById('finCopySlipBtn');
  const finPastShiftsHeading = document.getElementById('finPastShiftsHeading');

  if (finTitle) finTitle.innerText = isTe ? 'బంక్ సమగ్ర ఆర్థిక నివేదికలు & రికార్డులు' : 'Bunk Financial Reports & Archive';
  if (finSubtitle) finSubtitle.innerText = isTe ? 'బంక్ ఓనర్ ప్రత్యేకం • గత షిఫ్టుల రికార్డులు, రెవెన్యూ & వాహనాల బాకీల ఆడిట్' : 'Exclusive to Bunk Owner • Historical Shift Archives, Revenue & Fleet Debt Audit';
  if (finRefreshBtn) finRefreshBtn.innerText = isTe ? 'తాజా వివరాలు' : 'Refresh Reports';
  if (finTotalSalesLbl) finTotalSalesLbl.innerText = isTe ? 'మొత్తం అమ్మకాలు' : 'Accumulated Sales';
  if (finPetrolSoldLbl) finPetrolSoldLbl.innerText = isTe ? 'అమ్మిన మొత్తం పెట్రోల్' : 'Total Petrol Sold';
  if (finDieselSoldLbl) finDieselSoldLbl.innerText = isTe ? 'అమ్మిన మొత్తం డీజిల్' : 'Total Diesel Sold';
  if (finFleetDuesLbl) finFleetDuesLbl.innerText = isTe ? 'రావలసిన వాహనాల బాకీలు' : 'Unsettled Fleet Dues';
  if (finHistSlipHeading) finHistSlipHeading.innerText = isTe ? 'గత షిఫ్ట్ రసీదు' : 'Historical Daily Slip';
  if (finCopySlipBtn) finCopySlipBtn.innerText = isTe ? 'రసీదు కాపీ చేయి' : 'Copy Slip';
  if (finPastShiftsHeading) finPastShiftsHeading.innerText = isTe ? 'గత షిఫ్టుల పూర్తి రికార్డు' : 'Historical Shifts Archive';

  // 6. Recalculate Live Handover Tally
  calculateLiveHandoverTally();
  if (STATE.adminTab === 'handover') {
    calculateAdminHandoverTally();
  }

  // 7. Enforce Role Visibility
  updateAdminTabVisibility();
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

    // 7. Employee Dues (Permanent Shortage Tracking)
    try {
      const duesRes = await fetch(`/api/employee-dues?pump=${tenant}`);
      if (duesRes.ok) {
        const duesData = await duesRes.json();
        STATE.employeeDues = duesData.dues || [];
        STATE.duesMetrics = duesData.metrics || {};
        const duesBadge = document.getElementById('badgePendingDuesCount');
        if (duesBadge) duesBadge.innerText = STATE.duesMetrics.pendingCount || 0;
      }
    } catch (e) {}

    // Synchronize employees table and duty roster
    renderAdminEmployeesTable();
    renderAdminDutyRoster();

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
}

// --- STRICT ROLE TAB PERMISSIONS CONTROLLER ---
// Rules:
// 1. Pluggable DBs (PDBs) -> ONLY Developer / Superadmin can see. Hidden from mgmt and owner.
// 2. Financial Reports -> ONLY Bunk Owner and Developer can see. Strictly HIDDEN from mgmt.
// 3. Rates, Tank Stock, Reminders -> ONLY Bunk Owner and Developer can see. Strictly HIDDEN from mgmt.
// 4. Management -> Daily Sales Slip, Cash Handover, Pump Assignment, Employee List, Due, Duty & Salary Days, Vehicle Bills.
function updateAdminTabVisibility() {
  const role = STATE.currentUser?.role;
  const isOwner = role === 'owner';
  const isDev = role === 'developer' || role === 'admin';

  const tabFin = document.getElementById('admTab-financials');
  const tabRem = document.getElementById('admTab-reminders');
  const tabRates = document.getElementById('admTab-rates');
  const tabTanks = document.getElementById('admTab-tanks');
  const tabPdbs = document.getElementById('admTab-pdbs');
  const pdbSelectorBox = document.getElementById('headerTenantSelectorBox');

  // Pluggable DBs: Strictly Developer / Admin ONLY
  if (tabPdbs) {
    if (isDev) {
      tabPdbs.classList.remove('hidden');
      tabPdbs.style.display = '';
    } else {
      tabPdbs.classList.add('hidden');
      tabPdbs.style.display = 'none';
    }
  }
  if (pdbSelectorBox) {
    if (isDev) {
      pdbSelectorBox.classList.remove('hidden');
      pdbSelectorBox.style.display = '';
    } else {
      pdbSelectorBox.classList.add('hidden');
      pdbSelectorBox.style.display = 'none';
    }
  }

  // Financial Reports: Owner and Dev ONLY (Strictly hidden for mgmt)
  if (tabFin) {
    if (isOwner || isDev) {
      tabFin.classList.remove('hidden');
      tabFin.style.display = '';
    } else {
      tabFin.classList.add('hidden');
      tabFin.style.display = 'none';
    }
  }

  // Rates: Owner and Dev ONLY (Strictly hidden for mgmt)
  if (tabRates) {
    if (isOwner || isDev) {
      tabRates.classList.remove('hidden');
      tabRates.style.display = '';
    } else {
      tabRates.classList.add('hidden');
      tabRates.style.display = 'none';
    }
  }

  // Tanks: Owner and Dev ONLY (Strictly hidden for mgmt)
  if (tabTanks) {
    if (isOwner || isDev) {
      tabTanks.classList.remove('hidden');
      tabTanks.style.display = '';
    } else {
      tabTanks.classList.add('hidden');
      tabTanks.style.display = 'none';
    }
  }

  // Reminders: Owner and Dev ONLY (Strictly hidden for mgmt)
  if (tabRem) {
    if (isOwner || isDev) {
      tabRem.classList.remove('hidden');
      tabRem.style.display = '';
    } else {
      tabRem.classList.add('hidden');
      tabRem.style.display = 'none';
    }
  }
}

// --- VIEW ROUTING (ATTENDANT / MANAGEMENT / BUNK OWNER / DEVELOPER) ---
// User requirement: "in bunk owner (lets keep mgmt) and lets create one more login with bunk owner(or only owner) to see all the financial report. Note : mgmt user will not be allowed to see the historical finance/sale/ whatever the old cannot viewed where as only owner can see it. bunk owner cannot know the PDB and all which developer can see"
function routeUserView() {
  const loginView = document.getElementById('loginView');
  const empView = document.getElementById('employeeView');
  const admView = document.getElementById('adminView');
  const navLogged = document.getElementById('navLoggedInBox');
  const navGuest = document.getElementById('navGuestBox');
  const navUser = document.getElementById('navUserName');
  const navRole = document.getElementById('navUserRole');
  const headerDateInput = document.getElementById('headerShiftDate');
  const pdbDropdown = document.getElementById('headerTenantSelectorBox');
  const pdbTab = document.getElementById('admTab-pdbs');
  const finTab = document.getElementById('admTab-financials');
  const isTe = STATE.lang === 'te';

  // Case 1: NOT LOGGED IN -> Show Login Box ONLY
  if (!STATE.currentUser) {
    if (loginView) loginView.classList.remove('hidden');
    if (empView) empView.classList.add('hidden');
    if (admView) admView.classList.add('hidden');
    if (navLogged) navLogged.classList.add('hidden');
    if (navGuest) navGuest.classList.remove('hidden');
    if (pdbDropdown) pdbDropdown.classList.add('hidden');
    return;
  }

  // Logged In: update top bar
  if (navGuest) navGuest.classList.add('hidden');
  if (navLogged) navLogged.classList.remove('hidden');
  if (navUser) navUser.innerText = STATE.currentUser.name || 'User';

  const userRole = STATE.currentUser.role;
  const isStaff = userRole !== 'owner' && userRole !== 'mgmt' && userRole !== 'developer' && userRole !== 'admin';

  // User requirement: "once staff logged , dont show attendant logged in show only their name next to date"
  if (navRole) {
    if (isStaff) {
      navRole.classList.add('hidden');
    } else {
      navRole.classList.remove('hidden');
      let roleLabel = 'Staff';
      if (userRole === 'owner') roleLabel = isTe ? 'ఓనర్' : 'Bunk Owner';
      else if (userRole === 'mgmt') roleLabel = isTe ? 'మేనేజ్‌మెంట్' : 'Management';
      else if (userRole === 'developer' || userRole === 'admin') roleLabel = isTe ? 'డెవలపర్' : 'Developer';
      navRole.innerText = roleLabel;
    }
  }

  // Case 2: MANAGEMENT / BUNK OWNER / DEVELOPER LOGGED IN
  // User requirement: "in management login: show only daily sales slip, pump assigment, emp list (remove kyc), Due (...), and when month end comes to give salary how many days that emp has done work in station, remove Finance report from mgmt login (show only owner login), Vehicle bills (replace vehicle fleet ledger with it), remove pluggable DBs every where except dev login. for owner: mgmt options along with finance"
  if (userRole === 'mgmt' || userRole === 'owner' || userRole === 'developer' || userRole === 'admin') {
    STATE.role = userRole;
    STATE.adminUnlocked = true;
    if (loginView) loginView.classList.add('hidden');
    if (empView) empView.classList.add('hidden');
    if (admView) admView.classList.remove('hidden');

    const tabHandover = document.getElementById('admTab-handover');
    const tabRoster = document.getElementById('admTab-roster');
    const tabEmployees = document.getElementById('admTab-employees');
    const tabDues = document.getElementById('admTab-dues');
    const tabAttendance = document.getElementById('admTab-attendance');
    const tabFleet = document.getElementById('admTab-fleet');
    const tabRates = document.getElementById('admTab-rates');
    const tabTanks = document.getElementById('admTab-tanks');
    const tabReminders = document.getElementById('admTab-reminders');

    // Management visible core tabs: Daily Sales Slip, Cash Handover, Pump Assignment, Employee List, Due, Duty & Salary, Vehicle Bills
    if (tabHandover) tabHandover.classList.remove('hidden');
    if (tabRoster) tabRoster.classList.remove('hidden');
    if (tabEmployees) tabEmployees.classList.remove('hidden');
    if (tabDues) tabDues.classList.remove('hidden');
    if (tabAttendance) tabAttendance.classList.remove('hidden');
    if (tabFleet) tabFleet.classList.remove('hidden');

    // Apply strict visibility rules
    updateAdminTabVisibility();

    // Role-Specific Restrictions:
    if (userRole === 'mgmt') {
      const mgmtAllowedTabs = ['summary', 'handover', 'roster', 'employees', 'dues', 'attendance', 'fleet'];
      if (!mgmtAllowedTabs.includes(STATE.adminTab)) {
        STATE.adminTab = 'summary';
      }

      // Lock shift date to active shift for mgmt
      if (headerDateInput) {
        headerDateInput.value = STATE.shift?.date || STATE.selectedDate || getTodayDateString();
        headerDateInput.disabled = true;
      }
    } else if (userRole === 'owner') {
      if (headerDateInput) headerDateInput.disabled = false;
      if (STATE.adminTab === 'pdbs') STATE.adminTab = 'summary';
    } else {
      if (headerDateInput) headerDateInput.disabled = false;
    }

    renderAdminDashboard();
    renderAdminEmployeesTable();
    renderAdminDutyRoster();
    if (STATE.adminTab === 'handover') {
      renderAdminHandoverDashboard();
    }
    return;
  }

  // Case 3: EMPLOYEE / ATTENDANT LOGGED IN -> Show Staff View ONLY
  if (userRole === 'employee') {
    STATE.role = 'employee';
    if (loginView) loginView.classList.add('hidden');
    if (admView) admView.classList.add('hidden');
    if (empView) empView.classList.remove('hidden');
    if (pdbDropdown) pdbDropdown.classList.add('hidden');

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

  // Update Attendant Duty Banner (Clean: shows Name and S1 only)
  // User requirement: "just keep emy name and S1 only (because as we know S1 means from pump1 only - so no need to mentions all other)"
  const nameEl = document.getElementById('empLoggedInName');
  const badgeEl = document.getElementById('empAssignedStationBadge');
  const stCodeEl = document.getElementById('empReadingStationCode');
  const hoBadge = document.getElementById('hoStationBadge');

  if (nameEl) nameEl.innerText = empName;
  if (badgeEl) badgeEl.innerText = assignedStation || 'S1';
  if (stCodeEl) stCodeEl.innerText = assignedStation || 'S1';
  if (hoBadge) hoBadge.innerText = assignedStation || 'S1';
}

// --- LOGIN MODE CONTROLLER (STAFF DUTY-PIN ONLY vs MGMT/OWNER PASSWORD ONLY) ---
// User requirement: "when even admin owner mgmt username entered thn remove pin. pin only for emp log (remove password option for emp keep only pin/otp given by mgmt/owner)"
let currentLoginMode = 'staff';

function setLoginMode(mode) {
  currentLoginMode = mode;
  const btnStaff = document.getElementById('loginModeBtnStaff');
  const btnMgmt = document.getElementById('loginModeBtnMgmt');
  const passContainer = document.getElementById('loginPasswordContainer');
  const pinContainer = document.getElementById('loginDutyPinContainer');
  const lblUser = document.getElementById('lblLoginUser');
  const userInput = document.getElementById('loginUsernameInput');
  const passInput = document.getElementById('loginPasswordInput');
  const pinInput = document.getElementById('loginDutyPinInput');
  const errEl = document.getElementById('loginErrorMessage');
  if (errEl) errEl.classList.add('hidden');

  const isTe = STATE.lang === 'te';

  if (mode === 'staff') {
    if (btnStaff) btnStaff.className = "flex-1 py-2 rounded-xl text-xs font-black transition-all bg-orange-600 text-white shadow-sm flex items-center justify-center gap-1.5";
    if (btnMgmt) btnMgmt.className = "flex-1 py-2 rounded-xl text-xs font-bold transition-all text-slate-700 hover:text-black flex items-center justify-center gap-1.5";
    
    // Staff: Show PIN, HIDE Password
    if (pinContainer) pinContainer.classList.remove('hidden');
    if (passContainer) passContainer.classList.add('hidden');
    if (passInput) passInput.required = false;
    if (pinInput) pinInput.required = true;

    if (lblUser) lblUser.innerText = isTe ? 'ఉద్యోగి పేరు / యూజర్‌నేమ్ (Employee Username):' : 'Employee Username / First Name:';
    if (userInput) userInput.placeholder = 'e.g. emp, ramesh, or suresh';
  } else {
    // Management / Owner: Show Password, HIDE PIN
    if (btnMgmt) btnMgmt.className = "flex-1 py-2 rounded-xl text-xs font-black transition-all bg-orange-600 text-white shadow-sm flex items-center justify-center gap-1.5";
    if (btnStaff) btnStaff.className = "flex-1 py-2 rounded-xl text-xs font-bold transition-all text-slate-700 hover:text-black flex items-center justify-center gap-1.5";

    if (pinContainer) pinContainer.classList.add('hidden');
    if (passContainer) passContainer.classList.remove('hidden');
    if (passInput) passInput.required = true;
    if (pinInput) pinInput.required = false;

    if (lblUser) lblUser.innerText = isTe ? 'యూజర్‌నేమ్ (మేనేజ్‌మెంట్ / ఓనర్):' : 'Management / Owner Username:';
    if (userInput) userInput.placeholder = 'mgmt, owner, admin, or dev';
  }
}

function onLoginUsernameChange(val) {
  const clean = (val || '').trim().toLowerCase();
  const mgmtKeywords = ['admin', 'mgmt', 'owner', 'manager', 'developer', 'dev', 'bunkowner', 'administrator'];
  if (mgmtKeywords.includes(clean)) {
    if (currentLoginMode !== 'mgmt') setLoginMode('mgmt');
  } else if (clean === 'emp' || clean.startsWith('s1') || clean.startsWith('s2') || clean.startsWith('s3') || clean.startsWith('s4')) {
    if (currentLoginMode !== 'staff') setLoginMode('staff');
  }
}

// --- AUTHENTICATION (SIGN IN, LOGOUT, CHANGE PASSWORD) ---
async function handleLoginSubmit(event) {
  event.preventDefault();

  const userField = document.getElementById('loginUsernameInput');
  const passField = document.getElementById('loginPasswordInput');
  const pinField = document.getElementById('loginDutyPinInput');
  const errEl = document.getElementById('loginErrorMessage');

  const username = userField ? userField.value.trim() : '';
  const password = passField ? passField.value.trim() : '';
  const dutyPin = pinField ? pinField.value.trim() : '';

  if (!username) {
    if (errEl) {
      errEl.innerText = STATE.lang === 'te' ? 'దయచేసి యూజర్‌నేమ్ నమోదు చేయండి' : 'Please enter username';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const isMgmt = currentLoginMode === 'mgmt';

  if (isMgmt) {
    if (!password) {
      if (errEl) {
        errEl.innerText = STATE.lang === 'te' ? 'దయచేసి పాస్‌వర్డ్ నమోదు చేయండి (default: 123)' : 'Please enter password (default: 123)';
        errEl.classList.remove('hidden');
      }
      return;
    }
  } else {
    // Staff mode: PIN is required, password is NOT required
    if (!dutyPin) {
      if (errEl) {
        errEl.innerText = STATE.lang === 'te' ? 'డ్యూటీ పిన్ నమోదు చేయండి (Duty PIN / OTP required)' : 'Please enter Duty PIN assigned by Manager/Owner';
        errEl.classList.remove('hidden');
      }
      return;
    }
  }

  try {
    const res = await fetch(`/api/auth/login?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: isMgmt ? password : '',
        dutyPin: !isMgmt ? dutyPin : '',
        date: STATE.selectedDate
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      if (errEl) {
        errEl.innerText = data.error || (STATE.lang === 'te' ? 'లాగిన్ విఫలమైంది. సరైన వివరాలు నమోదు చేయండి.' : 'Invalid credentials');
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
  const tabs = ['reading', 'testing', 'card', 'upi', 'reminder', 'vehicle', 'handover'];
  
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
  if (tab === 'card') {
    ensureCardSwipeDateTimeAuto();
    renderCardSwipesLog();
  }
  if (tab === 'upi') renderUpiList();
  if (tab === 'reminder') renderEmployeeReminders();
  if (tab === 'vehicle') renderEmployeeVehicleEntries();
  if (tab === 'handover') {
    calculateLiveHandoverTally();
    renderExpensesLog();
  }
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
  // User Requirement: "once the close reading will be given the that close reading will default comes in opening reading"
  const pOpen = (stData.nextOpenPetrol !== undefined && stData.nextOpenPetrol !== null) ? stData.nextOpenPetrol : (stData.meters?.petrol?.open ?? '');
  const pClose = ''; // Fresh for new entry
  const dOpen = (stData.nextOpenDiesel !== undefined && stData.nextOpenDiesel !== null) ? stData.nextOpenDiesel : (stData.meters?.diesel?.open ?? '');
  const dClose = ''; // Fresh for new entry

  const pOpenInput = document.getElementById('empPetrolOpen');
  const pCloseInput = document.getElementById('empPetrolClose');
  const dOpenInput = document.getElementById('empDieselOpen');
  const dCloseInput = document.getElementById('empDieselClose');

  if (pOpenInput) pOpenInput.value = pOpen !== '' ? pOpen : 0;
  if (pCloseInput) pCloseInput.value = pClose;
  if (dOpenInput) dOpenInput.value = dOpen !== '' ? dOpen : 0;
  if (dCloseInput) dCloseInput.value = dClose;

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
  const notesInput = document.getElementById('empHandoverNotes');

  if (cashInput) cashInput.value = stData.collections?.cash || '';
  if (upiInput) upiInput.value = stData.collections?.upi || '';
  if (notesInput) notesInput.value = stData.collections?.notes || '';

  // Badges
  const pendingReminders = STATE.reminders.filter(r => r.stationId === stId && r.status === 'pending');
  const badgeRem = document.getElementById('empReminderBadgeCount');
  if (badgeRem) badgeRem.innerText = pendingReminders.length;

  const currentVehicles = STATE.vehicleLedger.filter(v => v.stationId === stId);
  const badgeVeh = document.getElementById('empVehicleBadgeCount');
  if (badgeVeh) badgeVeh.innerText = currentVehicles.length;

  const cardSwipes = stData.cardSwipes || [];
  const totalCard = cardSwipes.reduce((s, c) => s + (c.amount || 0), 0);
  const badgeCard = document.getElementById('empCardBadgeCount');
  const cardTotDisp = document.getElementById('cardTotalDisplay');
  if (badgeCard) badgeCard.innerText = `₹${totalCard.toLocaleString('en-IN')}`;
  if (cardTotDisp) cardTotDisp.innerText = `₹${totalCard.toLocaleString('en-IN')}`;

  const upiPayments = stData.upiPayments || [];
  const totalUpi = upiPayments.reduce((s, u) => s + (u.amount || 0), 0);
  const badgeUpi = document.getElementById('empUpiBadgeCount');
  const upiTotDisp = document.getElementById('upiTotalDisplay');
  if (badgeUpi) badgeUpi.innerText = `₹${totalUpi.toLocaleString('en-IN')}`;
  if (upiTotDisp) upiTotDisp.innerText = `₹${totalUpi.toLocaleString('en-IN')}`;

  calculateEmployeeLiveLitres();
  renderReadingSessionsHistory();
  renderTestingLog();
  renderCardSwipesLog();
  renderUpiList();
  renderEmployeeReminders();
  renderEmployeeVehicleEntries();
  renderExpensesLog();
  calculateLiveHandoverTally();
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

  calculateLiveHandoverTally();
}

// Render Reading Sessions & Break Log Table
function renderReadingSessionsHistory() {
  const container = document.getElementById('empReadingHistoryContainer');
  const banner = document.getElementById('empShiftOverallReadingsBanner');
  const badge = document.getElementById('empSessionsCountBadge');
  if (!container) return;

  const stId = STATE.selectedStation;
  const stData = STATE.shift?.stations?.[stId] || {};
  const history = stData.readingsHistory || [];

  if (badge) badge.innerText = `${history.length} session${history.length === 1 ? '' : 's'}`;

  // Render Overall Shift Readings Banner (Joined Reading ➔ Current/Final Reading)
  if (banner) {
    const joinedPetrol = stData.initialJoinedMeters?.petrol?.open ?? stData.meters?.petrol?.open ?? 0;
    const joinedDiesel = stData.initialJoinedMeters?.diesel?.open ?? stData.meters?.diesel?.open ?? 0;
    const currentClosePetrol = stData.meters?.petrol?.close || joinedPetrol;
    const currentCloseDiesel = stData.meters?.diesel?.close || joinedDiesel;
    const netPetrolL = stData.meters?.petrol?.saleLitres || 0;
    const netDieselL = stData.meters?.diesel?.saleLitres || 0;
    const joinedTime = stData.initialJoinedMeters?.joinedAt || 'Shift Start';

    banner.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-700">
        <div>
          <span class="text-[10px] font-black uppercase tracking-wider text-amber-400">Shift Overview (ఈ షిఫ్ట్ మొత్తం సారాంశం)</span>
          <h4 class="text-sm font-black text-white">స్టాఫ్ చేరిన రీడింగ్ ➔ ప్రస్తుత ముగింపు రీడింగ్</h4>
        </div>
        <div class="text-right">
          <span class="text-[10px] text-slate-300 font-mono">చేరిన సమయం (Joined): <strong>${joinedTime}</strong></span>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
        <div class="bg-slate-800/90 p-3 rounded-xl border border-amber-500/40">
          <div class="text-xs font-bold text-amber-300 flex items-center justify-between">
            <span>⛽ పెట్రోల్ (${stData.meters?.petrol?.code || 'A1'})</span>
            <span class="font-mono font-black text-amber-400 text-sm">${netPetrolL.toFixed(2)} L Net</span>
          </div>
          <div class="flex items-center justify-between mt-1 text-xs font-mono text-slate-300">
            <span>Joined: <strong class="text-white">${joinedPetrol}</strong></span>
            <span>➔</span>
            <span>End: <strong class="text-amber-300 text-sm">${currentClosePetrol}</strong></span>
          </div>
        </div>
        <div class="bg-slate-800/90 p-3 rounded-xl border border-blue-500/40">
          <div class="text-xs font-bold text-blue-300 flex items-center justify-between">
            <span>🛢️ డీజిల్ (${stData.meters?.diesel?.code || 'A2'})</span>
            <span class="font-mono font-black text-blue-400 text-sm">${netDieselL.toFixed(2)} L Net</span>
          </div>
          <div class="flex items-center justify-between mt-1 text-xs font-mono text-slate-300">
            <span>Joined: <strong class="text-white">${joinedDiesel}</strong></span>
            <span>➔</span>
            <span>End: <strong class="text-blue-300 text-sm">${currentCloseDiesel}</strong></span>
          </div>
        </div>
      </div>
    `;
  }

  // Render Table
  if (history.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-xs text-slate-500 font-medium">
        ఇంకా ఎలాంటి విరామం రీడింగ్‌లు నమోదు కాలేదు. భోజనం/డిన్నర్ వెళ్లేటప్పుడు ముగింపు రీడింగ్ నమోదు చేసి సేవ్ చేయండి.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="w-full text-left text-xs bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <thead class="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
        <tr>
          <th class="py-2.5 px-3"># సెషన్</th>
          <th class="py-2.5 px-3">సమయం & రకం</th>
          <th class="py-2.5 px-3">పెట్రోల్ (Open ➔ Close)</th>
          <th class="py-2.5 px-3">డీజిల్ (Open ➔ Close)</th>
          <th class="py-2.5 px-3">సేల్ లీటర్లు</th>
          <th class="py-2.5 px-3 text-right">చర్య</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        ${history.map((sess, idx) => `
          <tr class="hover:bg-slate-50">
            <td class="py-2.5 px-3 font-mono font-bold text-slate-600">#${idx + 1}</td>
            <td class="py-2.5 px-3">
              <span class="font-bold text-slate-900 block">${sess.tag}</span>
              <span class="text-[10px] text-slate-500 font-mono">${sess.time}</span>
            </td>
            <td class="py-2.5 px-3 font-mono text-[11px]">
              <span class="text-slate-600">${sess.petrol.open}</span> ➔ <span class="font-black text-amber-900">${sess.petrol.close}</span>
              <div class="text-[10px] text-emerald-700 font-bold">${sess.petrol.saleLitres} L</div>
            </td>
            <td class="py-2.5 px-3 font-mono text-[11px]">
              <span class="text-slate-600">${sess.diesel.open}</span> ➔ <span class="font-black text-blue-900">${sess.diesel.close}</span>
              <div class="text-[10px] text-emerald-700 font-bold">${sess.diesel.saleLitres} L</div>
            </td>
            <td class="py-2.5 px-3 font-mono font-black text-slate-900">
              ${(sess.petrol.saleLitres + sess.diesel.saleLitres).toFixed(2)} L
            </td>
            <td class="py-2.5 px-3 text-right">
              <button onclick="deleteReadingSession('${sess.id}')" class="text-rose-600 hover:text-rose-800 text-xs font-bold hover:underline">
                🗑️ Delete
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function deleteReadingSession(sessionId) {
  if (!confirm('ఈ రీడింగ్ సెషన్ రికార్డు డిలీట్ చేయాలా? (Delete this reading session?)')) return;
  try {
    const res = await fetch(`/api/shifts/station-readings/${sessionId}?pump=${STATE.activeTenant}&date=${STATE.selectedDate}&stationId=${STATE.selectedStation}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (result.success) {
      showToast('రీడింగ్ సెషన్ తొలగించబడింది');
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to delete reading session', 'error');
  }
}

async function saveStationReadings() {
  const pOpen = parseFloat(document.getElementById('empPetrolOpen').value) || 0;
  const pClose = parseFloat(document.getElementById('empPetrolClose').value) || 0;
  const dOpen = parseFloat(document.getElementById('empDieselOpen').value) || 0;
  const dClose = parseFloat(document.getElementById('empDieselClose').value) || 0;

  if (pClose <= 0 && dClose <= 0) {
    showToast('దయచేసి ముగింపు రీడింగ్ (Closing Reading) నమోదు చేయండి', 'error');
    return;
  }

  if (pClose > 0 && pClose < pOpen) {
    showToast('పెట్రోల్ ముగింపు రీడింగ్ ప్రారంభ రీడింగ్ కంటే తక్కువగా ఉండకూడదు', 'error');
    return;
  }

  if (dClose > 0 && dClose < dOpen) {
    showToast('డీజిల్ ముగింపు రీడింగ్ ప్రారంభ రీడింగ్ కంటే తక్కువగా ఉండకూడదు', 'error');
    return;
  }

  const sessionTag = document.getElementById('empReadingSessionTag')?.value || 'Meals / Lunch Break';
  const stData = STATE.shift?.stations?.[STATE.selectedStation] || {};
  const pTest = Number(stData.meters?.petrol?.testing || 0);
  const dTest = Number(stData.meters?.diesel?.testing || 0);

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    employeeName: STATE.selectedEmployeeName,
    sessionTag,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
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
      showToast(`రీడింగ్ సేవ్ చేయబడింది! ముగింపు రీడింగ్ తదుపరి ప్రారంభ రీడింగ్‌గా సెట్ చేయబడింది.`);
      // User Requirement: "once the close reading will be given the that close reading will default comes in opening reading"
      document.getElementById('empPetrolOpen').value = result.nextOpen?.petrol ?? pClose;
      document.getElementById('empPetrolClose').value = '';
      document.getElementById('empDieselOpen').value = result.nextOpen?.diesel ?? dClose;
      document.getElementById('empDieselClose').value = '';
      calculateEmployeeLiveLitres();
      loadAllData();
    } else {
      showToast(result.error || 'Failed to save readings', 'error');
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

// --- DEDICATED CARD SWIPE TAB CONTROLLER (AUTO/EDITABLE DATE-TIME) ---
function ensureCardSwipeDateTimeAuto() {
  const dtInput = document.getElementById('cardSwipeDateTime');
  if (dtInput && !dtInput.value) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    dtInput.value = now.toISOString().slice(0, 16);
  }
}

async function submitCardSwipeEntry() {
  const amount = parseFloat(document.getElementById('cardSwipeAmount').value) || 0;
  const machine = document.getElementById('cardSwipeMachine').value;
  const dateTime = document.getElementById('cardSwipeDateTime').value;
  const slipNo = document.getElementById('cardSwipeSlipNo').value.trim();

  if (amount <= 0) {
    showToast('దయచేసి సరైన స్వైప్ అమౌంట్ నమోదు చేయండి (Please enter valid amount)', 'error');
    document.getElementById('cardSwipeAmount').focus();
    return;
  }

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    amount,
    machine,
    slipNo,
    dateTime: dateTime ? new Date(dateTime).toISOString() : new Date().toISOString()
  };

  try {
    const res = await fetch(`/api/shifts/card-swipes?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      showToast(`కార్డ్ స్వైప్ ₹${amount.toLocaleString('en-IN')} నమోదు చేయబడింది!`);
      document.getElementById('cardSwipeAmount').value = '';
      document.getElementById('cardSwipeSlipNo').value = '';
      ensureCardSwipeDateTimeAuto();
      await loadAllData();
    } else {
      showToast(result.error || 'Failed to record card swipe', 'error');
    }
  } catch (err) {
    showToast('Failed to record card swipe', 'error');
  }
}

async function deleteCardSwipeEntry(id) {
  if (!confirm('ఈ కార్డ్ స్వైప్ రికార్డును తొలగించాలా? (Delete swipe record?)')) return;

  try {
    const res = await fetch(`/api/shifts/card-swipes/${id}?pump=${STATE.activeTenant}&date=${STATE.selectedDate}&stationId=${STATE.selectedStation}`, {
      method: 'DELETE'
    });

    const result = await res.json();
    if (result.success) {
      showToast('Card swipe record removed');
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to delete card swipe', 'error');
  }
}

function renderCardSwipesLog() {
  const container = document.getElementById('empCardSwipesListContainer');
  if (!container) return;

  const stData = STATE.shift?.stations?.[STATE.selectedStation] || {};
  const swipes = stData.cardSwipes || [];

  if (swipes.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
        ఈ షిఫ్ట్ లో ఇంకా ఎలాంటి కార్డ్ స్వైప్‌లు నమోదు కాలేదు. (No card swipes logged yet for this shift)
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="w-full text-xs text-left border-collapse">
      <thead>
        <tr class="bg-blue-100 text-blue-950 uppercase font-bold border-b border-blue-200">
          <th class="p-2">Date & Time</th>
          <th class="p-2">POS Machine</th>
          <th class="p-2">Slip / RRN</th>
          <th class="p-2 text-right">Amount (₹)</th>
          <th class="p-2 text-right">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 font-medium">
        ${swipes.map(s => `
          <tr class="hover:bg-slate-50">
            <td class="p-2 font-mono text-slate-600">${s.date} ${s.time || ''}</td>
            <td class="p-2 font-bold text-slate-900">${s.machine || 'IOCL POS'}</td>
            <td class="p-2 font-mono text-slate-500">${s.slipNo || '-'}</td>
            <td class="p-2 font-mono font-black text-blue-900 text-sm text-right">₹${Number(s.amount || 0).toLocaleString('en-IN')}</td>
            <td class="p-2 text-right">
              <button onclick="deleteCardSwipeEntry('${s.id}')" class="text-rose-600 hover:text-rose-800 font-bold text-[11px] px-2 py-0.5 rounded border border-rose-200 hover:bg-rose-50">
                🗑️ Delete
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// --- UPI / QR ONLINE PAYMENTS (PhonePe, GPay, Paytm Soundbox) ---
// User requirement: "also give a tab UPI on employee page"
async function submitUpiEntry() {
  const amount = parseFloat(document.getElementById('upiPaymentAmount')?.value) || 0;
  const app = document.getElementById('upiPaymentApp')?.value || 'PhonePe';
  const ref = document.getElementById('upiPaymentRef')?.value.trim() || '';
  const time = document.getElementById('upiPaymentTime')?.value.trim() || '';

  if (amount <= 0) {
    showToast(STATE.lang === 'te' ? 'దయచేసి సరైన యూపీఐ అమౌంట్ నమోదు చేయండి' : 'Please enter valid UPI amount', 'error');
    document.getElementById('upiPaymentAmount')?.focus();
    return;
  }

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    amount,
    app,
    ref,
    time: time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  };

  try {
    const res = await fetch(`/api/shifts/upi-payments?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      showToast(STATE.lang === 'te' ? `యూపీఐ ₹${amount.toLocaleString('en-IN')} నమోదు చేయబడింది!` : `UPI ₹${amount.toLocaleString('en-IN')} recorded!`);
      if (document.getElementById('upiPaymentAmount')) document.getElementById('upiPaymentAmount').value = '';
      if (document.getElementById('upiPaymentRef')) document.getElementById('upiPaymentRef').value = '';
      const timeEl = document.getElementById('upiPaymentTime');
      if (timeEl) timeEl.value = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      await loadAllData();
    } else {
      showToast(result.error || 'Failed to record UPI payment', 'error');
    }
  } catch (err) {
    showToast('Failed to record UPI payment', 'error');
  }
}

async function deleteUpiEntry(id) {
  if (!confirm(STATE.lang === 'te' ? 'ఈ యూపీఐ రికార్డును తొలగించాలా?' : 'Delete this UPI payment record?')) return;

  try {
    const res = await fetch(`/api/shifts/upi-payments/${id}?pump=${STATE.activeTenant}&date=${STATE.selectedDate}&stationId=${STATE.selectedStation}`, {
      method: 'DELETE'
    });

    const result = await res.json();
    if (result.success) {
      showToast('UPI payment removed');
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to delete UPI payment', 'error');
  }
}

function renderUpiList() {
  const container = document.getElementById('empUpiListContainer');
  const timeInput = document.getElementById('upiPaymentTime');
  if (timeInput && !timeInput.value) {
    timeInput.value = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  if (!container) return;

  const stData = STATE.shift?.stations?.[STATE.selectedStation] || {};
  const upiList = stData.upiPayments || [];
  const totalUpi = upiList.reduce((s, u) => s + (u.amount || 0), 0);

  const upiTotDisp = document.getElementById('upiTotalDisplay');
  const upiBadge = document.getElementById('empUpiBadgeCount');
  if (upiTotDisp) upiTotDisp.innerText = `₹${totalUpi.toLocaleString('en-IN')}`;
  if (upiBadge) upiBadge.innerText = `₹${totalUpi.toLocaleString('en-IN')}`;

  if (upiList.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
        ${STATE.lang === 'te' ? 'ఈ షిఫ్ట్ లో ఇంకా ఎలాంటి యూపీఐ పేమెంట్లు నమోదు కాలేదు.' : 'No UPI payments recorded yet for this shift.'}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="w-full text-xs text-left border-collapse">
      <thead>
        <tr class="bg-indigo-100 text-indigo-950 uppercase font-bold border-b border-indigo-200">
          <th class="p-2">Time</th>
          <th class="p-2">App / Mode</th>
          <th class="p-2">Reference / UTR</th>
          <th class="p-2 text-right">Amount (₹)</th>
          <th class="p-2 text-right">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 font-medium">
        ${upiList.map(u => `
          <tr class="hover:bg-slate-50">
            <td class="p-2 font-mono text-slate-600">${u.time || '-'}</td>
            <td class="p-2 font-bold text-slate-900">${u.app || 'PhonePe'}</td>
            <td class="p-2 font-mono text-slate-500">${u.ref || '-'}</td>
            <td class="p-2 font-mono font-black text-indigo-900 text-sm text-right">₹${Number(u.amount || 0).toLocaleString('en-IN')}</td>
            <td class="p-2 text-right">
              <button onclick="deleteUpiEntry('${u.id}')" class="text-rose-600 hover:text-rose-800 font-bold text-[11px] px-2 py-0.5 rounded border border-rose-200 hover:bg-rose-50">
                🗑️ Delete
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// --- VEHICLE ACCOUNT (MANDATORY 10-DIGIT MOBILE NUMBER RULE) ---
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
  const mobileNumber = document.getElementById('vlogMobileNumber').value.trim();
  const fuelType = document.getElementById('vlogFuelType').value;
  const litres = parseFloat(document.getElementById('vlogLitres').value) || 0;
  const rate = fuelType === 'Petrol' ? STATE.rates.petrol : STATE.rates.diesel;
  const amount = parseFloat(document.getElementById('vlogAmount').value) || Math.round(litres * rate);
  const slipNo = document.getElementById('vlogSlipNo').value.trim();

  // 10 Numbers Validation Rule
  if (!mobileNumber || !/^[0-9]{10}$/.test(mobileNumber)) {
    showToast(STATE.lang === 'te' ? 'దయచేసి 10 అంకెల సరైన మొబైల్ నంబర్ నమోదు చేయండి' : 'Please enter valid 10-digit mobile number (10 numbers rule)', 'error');
    document.getElementById('vlogMobileNumber').focus();
    return;
  }

  if (!vehicleNumber || amount <= 0) {
    showToast('దయచేసి వాహనం నంబర్ మరియు అమౌంట్ నమోదు చేయండి', 'error');
    return;
  }

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    employeeName: STATE.selectedEmployeeName,
    vehicleNumber,
    driverName,
    driverPhone: mobileNumber,
    mobileNumber,
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
      document.getElementById('vlogMobileNumber').value = '';
      document.getElementById('vlogLitres').value = '';
      document.getElementById('vlogAmount').value = '';
      document.getElementById('vlogSlipNo').value = '';
      loadAllData();
    } else {
      showToast(result.error || 'Failed to save vehicle entry', 'error');
    }
  } catch (err) {
    showToast('Failed to save vehicle fueling entry', 'error');
  }
}

function renderEmployeeVehicleEntries() {
  const container = document.getElementById('empVehicleListContainer');
  if (!container) return;

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
          <th class="p-2">Mobile (10-digits)</th>
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
            <td class="p-2 font-mono font-bold text-blue-900">${v.mobileNumber || v.driverPhone || '-'}</td>
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

// --- SHIFT EXPENSES CONTROLLER (AUTO-CALCULATED WITH PRESETS) ---
function setExpensePreset(reason, defaultAmount) {
  const rInput = document.getElementById('expenseReasonInput');
  const aInput = document.getElementById('expenseAmountInput');
  if (rInput) rInput.value = reason;
  if (aInput && defaultAmount) aInput.value = defaultAmount;
  if (aInput) aInput.focus();
}

async function submitExpenseEntry() {
  const reason = document.getElementById('expenseReasonInput').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmountInput').value) || 0;

  if (!reason || amount <= 0) {
    showToast('దయచేసి ఖర్చు కారణం మరియు అమౌంట్ నమోదు చేయండి', 'error');
    return;
  }

  const payload = {
    date: STATE.selectedDate,
    stationId: STATE.selectedStation,
    amount,
    reason
  };

  try {
    const res = await fetch(`/api/shifts/expenses?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      showToast(`ఖర్చు ₹${amount} నమోదు అయింది! నగదు నుంచి మినహాయించబడింది.`);
      document.getElementById('expenseReasonInput').value = '';
      document.getElementById('expenseAmountInput').value = '';
      await loadAllData();
    } else {
      showToast(result.error || 'Failed to record expense', 'error');
    }
  } catch (err) {
    showToast('Failed to record expense', 'error');
  }
}

async function deleteExpenseEntry(id) {
  if (!confirm('ఈ ఖర్చు రికార్డును తొలగించాలా? (Delete expense record?)')) return;

  try {
    const res = await fetch(`/api/shifts/expenses/${id}?pump=${STATE.activeTenant}&date=${STATE.selectedDate}&stationId=${STATE.selectedStation}`, {
      method: 'DELETE'
    });

    const result = await res.json();
    if (result.success) {
      showToast('Expense record removed');
      loadAllData();
    }
  } catch (err) {
    showToast('Failed to delete expense', 'error');
  }
}

function renderExpensesLog() {
  const container = document.getElementById('hoExpensesListContainer');
  if (!container) return;

  const stData = STATE.shift?.stations?.[STATE.selectedStation] || {};
  const expenses = stData.expensesList || [];
  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  const totalBadge = document.getElementById('hoExpenseTotalBadge');
  if (totalBadge) totalBadge.innerText = `మొత్తం ఖర్చులు: ₹${total.toLocaleString('en-IN')}`;

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-slate-400 text-xs bg-white rounded-xl border border-rose-100">
        ఈ షిఫ్ట్ లో ఇప్పటివరకు ఎలాంటి ఖర్చులు నమోదు కాలేదు. (No expenses recorded yet)
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="w-full text-xs text-left border-collapse bg-white rounded-xl overflow-hidden border border-rose-100">
      <thead>
        <tr class="bg-rose-100 text-rose-950 uppercase font-bold border-b border-rose-200">
          <th class="p-2">Time</th>
          <th class="p-2">Reason</th>
          <th class="p-2 text-right">Amount (₹)</th>
          <th class="p-2 text-right">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-rose-50 font-medium">
        ${expenses.map(e => `
          <tr class="hover:bg-rose-50/50">
            <td class="p-2 font-mono text-slate-500">${e.time || '-'}</td>
            <td class="p-2 font-bold text-slate-900">${e.reason}</td>
            <td class="p-2 font-mono font-black text-rose-800 text-sm text-right">₹${Number(e.amount || 0).toLocaleString('en-IN')}</td>
            <td class="p-2 text-right">
              <button onclick="deleteExpenseEntry('${e.id}')" class="text-rose-600 hover:text-rose-800 font-bold text-[11px] px-2 py-0.5 rounded border border-rose-200 hover:bg-rose-50">
                🗑️ Delete
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// --- NAGADHU LEKKA (AUTOMATED LIVE RECONCILIATION DASHBOARD) ---
function calculateLiveHandoverTally() {
  const stId = STATE.selectedStation;
  const stData = STATE.shift?.stations?.[stId] || {};

  // 1. Gross Meter Fuel Sales
  // User requirement: "shift ended, the opending closing reading showing in meter reading tab, but cash handover showing nothing (only what ever entered in card swipe, upi showing amounts those showing in cash handover)"
  const pOpenInput = parseFloat(document.getElementById('empPetrolOpen')?.value) || 0;
  const pCloseInput = parseFloat(document.getElementById('empPetrolClose')?.value) || 0;
  const pTest = Number(stData.meters?.petrol?.testing || 0);

  let pLitres = Number(stData.meters?.petrol?.saleLitres || 0);
  if (pCloseInput > pOpenInput) {
    const pOpenActual = Number(stData.initialJoinedMeters?.petrol?.open ?? pOpenInput);
    pLitres = Math.max(0, pCloseInput - pOpenActual - pTest);
  }
  const pRate = STATE.rates.petrol || 117.07;
  const pAmt = Math.round(pLitres * pRate);

  const dOpenInput = parseFloat(document.getElementById('empDieselOpen')?.value) || 0;
  const dCloseInput = parseFloat(document.getElementById('empDieselClose')?.value) || 0;
  const dTest = Number(stData.meters?.diesel?.testing || 0);

  let dLitres = Number(stData.meters?.diesel?.saleLitres || 0);
  if (dCloseInput > dOpenInput) {
    const dOpenActual = Number(stData.initialJoinedMeters?.diesel?.open ?? dOpenInput);
    dLitres = Math.max(0, dCloseInput - dOpenActual - dTest);
  }
  const dRate = STATE.rates.diesel || 105.23;
  const dAmt = Math.round(dLitres * dRate);

  const grossSale = pAmt + dAmt;

  // 2. Shift Deductions
  // Fleet Vehicle Fueling on account
  const currentVehicles = STATE.vehicleLedger.filter(v => v.stationId === stId);
  const vehicleTotal = currentVehicles.reduce((s, v) => s + (v.amount || 0), 0);

  // Pending Reminders
  const pendingReminders = STATE.reminders.filter(r => r.stationId === stId && r.status === 'pending');
  const reminderTotal = pendingReminders.reduce((s, r) => s + (r.amount || 0), 0);

  // Card Swipes
  const cardSwipes = stData.cardSwipes || [];
  const cardTotal = cardSwipes.reduce((s, c) => s + (c.amount || 0), 0);

  // Expenses
  const expensesList = stData.expensesList || [];
  const expenseTotal = expensesList.reduce((s, e) => s + (e.amount || 0), 0);

  // UPI Received
  const upiPayments = stData.upiPayments || [];
  const loggedUpiTotal = upiPayments.reduce((s, u) => s + (u.amount || 0), 0);
  const upiInput = document.getElementById('empHandoverUpi');
  if (upiInput && (!upiInput.value || upiInput.value === '0')) {
    if (loggedUpiTotal > 0) upiInput.value = loggedUpiTotal;
  }
  const upiTotal = (parseFloat(upiInput?.value) || 0) || loggedUpiTotal;

  const totalDeductions = vehicleTotal + reminderTotal + cardTotal + expenseTotal + upiTotal;

  // 3. Expected Net Cash
  const expectedCash = Math.max(0, grossSale - totalDeductions);

  // Update UI Elements
  const elGross = document.getElementById('hoGrossSaleDisplay');
  const elPSub = document.getElementById('hoPetrolSaleSubtext');
  const elDSub = document.getElementById('hoDieselSaleSubtext');
  const elTotDed = document.getElementById('hoTotalDeductionsDisplay');
  const elVehDed = document.getElementById('hoVehicleDeduction');
  const elRemDed = document.getElementById('hoReminderDeduction');
  const elCardDed = document.getElementById('hoCardDeduction');
  const elUpiDed = document.getElementById('hoUpiDeduction');
  const elExpDed = document.getElementById('hoExpenseDeduction');
  const elExpCash = document.getElementById('hoExpectedCashDisplay');

  if (elGross) elGross.innerText = `₹${grossSale.toLocaleString('en-IN')}`;
  if (elPSub) elPSub.innerText = `${pLitres.toFixed(2)} L • ₹${pAmt.toLocaleString('en-IN')}`;
  if (elDSub) elDSub.innerText = `${dLitres.toFixed(2)} L • ₹${dAmt.toLocaleString('en-IN')}`;
  if (elTotDed) elTotDed.innerText = `- ₹${totalDeductions.toLocaleString('en-IN')}`;
  if (elVehDed) elVehDed.innerText = `- ₹${vehicleTotal.toLocaleString('en-IN')}`;
  if (elRemDed) elRemDed.innerText = `- ₹${reminderTotal.toLocaleString('en-IN')}`;
  if (elCardDed) elCardDed.innerText = `- ₹${cardTotal.toLocaleString('en-IN')}`;
  if (elUpiDed) elUpiDed.innerText = `- ₹${upiTotal.toLocaleString('en-IN')}`;
  if (elExpDed) elExpDed.innerText = `- ₹${expenseTotal.toLocaleString('en-IN')}`;
  if (elExpCash) elExpCash.innerText = `₹${expectedCash.toLocaleString('en-IN')}`;

  // 4. Actual Physical Cash Entered vs Expected Cash
  const cashInput = document.getElementById('empHandoverCash');
  const actualCash = parseFloat(cashInput?.value);
  const tallyBadge = document.getElementById('hoTallyBadge');

  if (!tallyBadge) return;

  if (isNaN(actualCash) || cashInput.value === '') {
    tallyBadge.className = 'bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-center font-bold text-xs flex items-center justify-center gap-1.5 border';
    tallyBadge.innerHTML = STATE.lang === 'te' ? '<span>⏳ చేతి నగదు నమోదు చేయండి</span>' : '<span>⏳ Enter physical cash</span>';
    return;
  }

  const diff = actualCash - expectedCash;

  if (diff === 0) {
    tallyBadge.className = 'bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-center font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 animate-pulse';
    tallyBadge.innerHTML = STATE.lang === 'te' ? '<span>✓ లెక్క ఖచ్చితంగా సరిపోయింది! (₹0)</span>' : '<span>✓ Exact Tally Balanced! (₹0)</span>';
  } else if (diff < 0) {
    tallyBadge.className = 'bg-rose-600 text-white px-4 py-2.5 rounded-xl text-center font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5';
    tallyBadge.innerHTML = STATE.lang === 'te' 
      ? `<span>⚠️ నగదు తక్కువగా ఉంది: -₹${Math.abs(diff).toLocaleString('en-IN')} (Shortage)</span>`
      : `<span>⚠️ Cash Shortage: -₹${Math.abs(diff).toLocaleString('en-IN')}</span>`;
  } else {
    tallyBadge.className = 'bg-amber-500 text-slate-900 px-4 py-2.5 rounded-xl text-center font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5';
    tallyBadge.innerHTML = STATE.lang === 'te'
      ? `<span>💰 అదనపు నగదు ఉంది: +₹${diff.toLocaleString('en-IN')} (Excess)</span>`
      : `<span>💰 Excess Cash: +₹${diff.toLocaleString('en-IN')}</span>`;
  }
}

async function submitShiftHandover() {
  const cash = parseFloat(document.getElementById('empHandoverCash')?.value) || 0;
  const stData = STATE.shift?.stations?.[STATE.selectedStation] || {};
  const loggedUpiTotal = (stData.upiPayments || []).reduce((s, u) => s + (u.amount || 0), 0);
  const upi = parseFloat(document.getElementById('empHandoverUpi')?.value) || loggedUpiTotal || 0;
  const notes = document.getElementById('empHandoverNotes')?.value.trim() || "";

  const card = (stData.cardSwipes || []).reduce((s, c) => s + (c.amount || 0), 0);
  const expenses = (stData.expensesList || []).reduce((s, e) => s + (e.amount || 0), 0);
  const expenseReason = stData.collections?.expenseReason || "";

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
      if (result.shortage > 0) {
        showToast(STATE.lang === 'te' 
          ? `నగదు సమర్పించబడింది. షార్టేజ్ ₹${result.shortage.toLocaleString('en-IN')} బాకీగా నమోదు చేయబడింది!` 
          : `Handover saved. Shortage of ₹${result.shortage.toLocaleString('en-IN')} marked as due!`);
      } else {
        showToast(STATE.lang === 'te' ? 'షిఫ్ట్ కలెక్షన్ లెక్క విజయవంతంగా సమర్పించబడింది!' : 'Shift collections submitted successfully!');
      }
      loadAllData();
    } else {
      showToast('Failed to submit handover', 'error');
    }
  } catch (err) {
    showToast('Failed to submit handover', 'error');
  }
}

// --- AMOUNT REMINDERS ---
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

// --- ADMIN / OWNER / MANAGEMENT DASHBOARD CONTROLLER ---
function switchAdminTab(tabKey) {
  const role = STATE.currentUser?.role;

  // If mgmt user tries to open restricted tabs, restrict and redirect
  if (role === 'mgmt') {
    const mgmtBlocked = ['financials', 'reminders', 'rates', 'tanks', 'pdbs'];
    if (mgmtBlocked.includes(tabKey)) {
      showToast(STATE.lang === 'te' ? 'ఈ విభాగం కేవలం ఓనర్ కు మాత్రమే అందుబాటులో ఉంటుంది' : 'Restricted to Bunk Owner only', 'error');
      tabKey = 'summary';
    }
  }

  // If non-developer tries to open PDBs, restrict
  if (tabKey === 'pdbs' && role !== 'developer' && role !== 'admin') {
    tabKey = 'summary';
  }

  STATE.adminTab = tabKey;
  const tabs = ['summary', 'handover', 'financials', 'dues', 'attendance', 'fleet', 'reminders', 'employees', 'roster', 'rates', 'tanks', 'pdbs'];
  
  tabs.forEach(t => {
    const btn = document.getElementById(`admTab-${t}`);
    const sec = document.getElementById(`admSection-${t}`);
    if (btn && sec) {
      if (t === tabKey) {
        btn.classList.add('active', 'bg-orange-600', 'text-white', 'shadow');
        btn.classList.remove('bg-white', 'text-slate-700', 'hover:bg-slate-100');
        sec.classList.remove('hidden');
      } else {
        btn.classList.remove('active', 'bg-orange-600', 'text-white', 'shadow');
        btn.classList.add('bg-white', 'text-slate-700', 'hover:bg-slate-100');
        sec.classList.add('hidden');
      }
    }
  });

  // Re-enforce visibility rules immediately
  updateAdminTabVisibility();

  renderAdminDashboard();
  if (tabKey === 'handover') {
    renderAdminHandoverDashboard();
  }
  if (tabKey === 'roster') {
    renderAdminDutyRoster();
  }
  if (tabKey === 'employees') {
    renderAdminEmployeesTable();
  }
  if (tabKey === 'financials') {
    loadFinancialReports();
  }
  if (tabKey === 'dues') {
    loadEmployeeDues();
  }
  if (tabKey === 'attendance') {
    loadDutyAttendanceData();
  }
  if (tabKey === 'fleet') {
    renderAdminFleetLedger();
  }
}

// =========================================================================
// MANAGEMENT & OWNER CASH HANDOVER CONTROLLER
// User requirement: "for mgmt and owner should also do cash handover in their login too.. because they need to their own and before checking with staff (think same caluclation will show on both staff and owner pages)"
// =========================================================================

function getStationHandoverMetrics(stId) {
  const stData = STATE.shift?.stations?.[stId] || {};
  const pRate = STATE.rates?.petrol || 117.07;
  const dRate = STATE.rates?.diesel || 105.23;

  const pOpen = Number(stData.initialJoinedMeters?.petrol?.open ?? stData.meters?.petrol?.open ?? 0);
  const pClose = Number(stData.meters?.petrol?.close || 0);
  const pTest = Number(stData.meters?.petrol?.testing || 0);
  let pLitres = Number(stData.meters?.petrol?.saleLitres || 0);
  if (pClose > pOpen) {
    pLitres = Math.max(0, pClose - pOpen - pTest);
  }
  const pAmt = Math.round(pLitres * pRate);

  const dOpen = Number(stData.initialJoinedMeters?.diesel?.open ?? stData.meters?.diesel?.open ?? 0);
  const dClose = Number(stData.meters?.diesel?.close || 0);
  const dTest = Number(stData.meters?.diesel?.testing || 0);
  let dLitres = Number(stData.meters?.diesel?.saleLitres || 0);
  if (dClose > dOpen) {
    dLitres = Math.max(0, dClose - dOpen - dTest);
  }
  const dAmt = Math.round(dLitres * dRate);

  const grossSale = pAmt + dAmt;

  const currentVehicles = (STATE.vehicleLedger || []).filter(v => v.stationId === stId);
  const vehicleTotal = currentVehicles.reduce((s, v) => s + (v.amount || 0), 0);

  const pendingReminders = (STATE.reminders || []).filter(r => r.stationId === stId && r.status === 'pending');
  const reminderTotal = pendingReminders.reduce((s, r) => s + (r.amount || 0), 0);

  const cardSwipes = stData.cardSwipes || [];
  const cardTotal = cardSwipes.reduce((s, c) => s + (c.amount || 0), 0);

  const expensesList = stData.expensesList || [];
  const expenseTotal = expensesList.reduce((s, e) => s + (e.amount || 0), 0);

  const upiPayments = stData.upiPayments || [];
  const loggedUpiTotal = upiPayments.reduce((s, u) => s + (u.amount || 0), 0);

  const staffCash = Number(stData.collections?.cash || 0);
  const staffUpi = Number(stData.collections?.upi ?? loggedUpiTotal);
  const staffNotes = stData.collections?.notes || '';

  const totalDeductions = vehicleTotal + reminderTotal + cardTotal + expenseTotal + staffUpi;
  const expectedCash = Math.max(0, grossSale - totalDeductions);
  const staffShortage = staffCash ? Math.max(0, expectedCash - staffCash) : 0;
  const staffExcess = staffCash > expectedCash ? (staffCash - expectedCash) : 0;

  return {
    stationId: stId,
    attendantName: stData.employeeName || STATE.dutyAssignments?.[stId]?.employeeName || 'Unassigned',
    pOpen, pClose, pTest, pLitres, pRate, pAmt,
    dOpen, dClose, dTest, dLitres, dRate, dAmt,
    grossSale,
    vehicleTotal,
    reminderTotal,
    cardTotal,
    expenseTotal,
    expensesList,
    loggedUpiTotal,
    staffCash,
    staffUpi,
    staffNotes,
    expectedCash,
    totalDeductions,
    staffShortage,
    staffExcess,
    status: stData.status || 'in_progress',
    adminVerification: stData.adminVerification || null
  };
}

function renderAdminHandoverDashboard() {
  if (!STATE.adminSelectedStation) STATE.adminSelectedStation = 'S1';
  const activeSt = STATE.adminSelectedStation;
  const metrics = getStationHandoverMetrics(activeSt);
  const isTe = STATE.lang === 'te';

  // 1. Render Station Pill Buttons (S1, S2, S3, S4)
  const pillsContainer = document.getElementById('admHoStationPills');
  if (pillsContainer) {
    const stKeys = ['S1', 'S2', 'S3', 'S4'];
    pillsContainer.innerHTML = stKeys.map(k => {
      const m = getStationHandoverMetrics(k);
      const isSelected = k === activeSt;
      const isVerified = m.status === 'verified';
      const isSubmitted = m.status === 'submitted';

      let statusBadge = '';
      if (isVerified) {
        statusBadge = `<span class="bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full ml-1">✓</span>`;
      } else if (isSubmitted) {
        statusBadge = `<span class="bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded-full ml-1">📩</span>`;
      }

      const activeClass = isSelected 
        ? "bg-slate-900 text-white shadow-md ring-2 ring-emerald-500" 
        : "bg-slate-100 text-slate-700 hover:bg-slate-200";

      return `
        <button onclick="switchAdminHandoverStation('${k}')" class="px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 ${activeClass}">
          <span>${k} (${STATION_CONFIG[k]?.pump || k})</span>
          <span class="text-[10px] opacity-75 font-normal">(${m.attendantName.split(' ')[0]})</span>
          ${statusBadge}
        </button>
      `;
    }).join('');
  }

  // Active Station Attendant Info in selector bar
  const infoEl = document.getElementById('admHoActiveStationAttendantInfo');
  if (infoEl) {
    infoEl.innerHTML = `
      <span>🧑‍💼 సిబ్బంది: <strong>${metrics.attendantName}</strong></span>
      <span class="mx-1.5 text-slate-300">•</span>
      <span>నోజిల్స్: <strong>${STATION_CONFIG[activeSt]?.side || activeSt}</strong></span>
    `;
  }

  // 2. Update Reconciliation Summary Cards
  const elGross = document.getElementById('admHoGrossSaleDisplay');
  const elPSub = document.getElementById('admHoPetrolSaleSubtext');
  const elDSub = document.getElementById('admHoDieselSaleSubtext');
  const elTotDed = document.getElementById('admHoTotalDeductionsDisplay');
  const elVehDed = document.getElementById('admHoVehicleDeduction');
  const elRemDed = document.getElementById('admHoReminderDeduction');
  const elCardDed = document.getElementById('admHoCardDeduction');
  const elUpiDed = document.getElementById('admHoUpiDeduction');
  const elExpDed = document.getElementById('admHoExpenseDeduction');
  const elExpCash = document.getElementById('admHoExpectedCashDisplay');

  if (elGross) elGross.innerText = `₹${metrics.grossSale.toLocaleString('en-IN')}`;
  if (elPSub) elPSub.innerText = `${metrics.pLitres.toFixed(2)} L • ₹${metrics.pAmt.toLocaleString('en-IN')}`;
  if (elDSub) elDSub.innerText = `${metrics.dLitres.toFixed(2)} L • ₹${metrics.dAmt.toLocaleString('en-IN')}`;
  if (elTotDed) elTotDed.innerText = `- ₹${metrics.totalDeductions.toLocaleString('en-IN')}`;
  if (elVehDed) elVehDed.innerText = `- ₹${metrics.vehicleTotal.toLocaleString('en-IN')}`;
  if (elRemDed) elRemDed.innerText = `- ₹${metrics.reminderTotal.toLocaleString('en-IN')}`;
  if (elCardDed) elCardDed.innerText = `- ₹${metrics.cardTotal.toLocaleString('en-IN')}`;
  if (elUpiDed) elUpiDed.innerText = `- ₹${metrics.staffUpi.toLocaleString('en-IN')}`;
  if (elExpDed) elExpDed.innerText = `- ₹${metrics.expenseTotal.toLocaleString('en-IN')}`;
  if (elExpCash) elExpCash.innerText = `₹${metrics.expectedCash.toLocaleString('en-IN')}`;

  // 3. Populate Staff Attendant Submission info
  const staffNameEl = document.getElementById('admHoStaffName');
  const staffCashEl = document.getElementById('admHoStaffCash');
  const staffUpiEl = document.getElementById('admHoStaffUpi');
  const staffDiffEl = document.getElementById('admHoStaffDiff');
  const staffNotesEl = document.getElementById('admHoStaffNotes');
  const staffStatusBadge = document.getElementById('admHoStaffStatusBadge');
  const verifBanner = document.getElementById('admHoVerificationBanner');

  if (staffNameEl) staffNameEl.innerText = metrics.attendantName;
  if (staffCashEl) staffCashEl.innerText = `₹${metrics.staffCash.toLocaleString('en-IN')}`;
  if (staffUpiEl) staffUpiEl.innerText = `₹${metrics.staffUpi.toLocaleString('en-IN')}`;

  if (staffDiffEl) {
    if (metrics.staffCash === 0 && metrics.status !== 'submitted' && metrics.status !== 'verified') {
      staffDiffEl.innerText = 'Pending Submission';
      staffDiffEl.className = 'font-mono font-bold text-slate-500 text-xs';
    } else {
      const diff = metrics.staffCash - metrics.expectedCash;
      if (diff === 0) {
        staffDiffEl.innerText = '✓ Balanced (₹0)';
        staffDiffEl.className = 'font-mono font-black text-emerald-700 text-sm';
      } else if (diff < 0) {
        staffDiffEl.innerText = `-₹${Math.abs(diff).toLocaleString('en-IN')} (Shortage)`;
        staffDiffEl.className = 'font-mono font-black text-rose-700 text-sm';
      } else {
        staffDiffEl.innerText = `+₹${diff.toLocaleString('en-IN')} (Excess)`;
        staffDiffEl.className = 'font-mono font-black text-amber-700 text-sm';
      }
    }
  }

  if (staffNotesEl) staffNotesEl.innerText = metrics.staffNotes || (isTe ? 'ఎలాంటి రిమార్క్స్ లేవు' : 'No remarks');

  if (staffStatusBadge) {
    if (metrics.status === 'verified') {
      staffStatusBadge.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
      staffStatusBadge.innerText = isTe ? '✓ ఆమోదించబడింది (Verified)' : '✓ Verified & Approved';
    } else if (metrics.status === 'submitted') {
      staffStatusBadge.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300';
      staffStatusBadge.innerText = isTe ? '📩 సమర్పించారు (Submitted)' : '📩 Submitted by Staff';
    } else {
      staffStatusBadge.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700';
      staffStatusBadge.innerText = isTe ? '⏳ నడుస్తోంది (In Progress)' : '⏳ In Progress';
    }
  }

  if (verifBanner) {
    if (metrics.adminVerification?.verified) {
      verifBanner.classList.remove('hidden');
      verifBanner.className = 'p-2.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-200';
      verifBanner.innerHTML = `
        <div class="flex items-center gap-1.5 text-emerald-800">
          <span>✓</span>
          <span>Verified by <strong>${metrics.adminVerification.verifiedBy || 'Management'}</strong> on ${new Date(metrics.adminVerification.verifiedAt).toLocaleTimeString()}</span>
        </div>
        ${metrics.adminVerification.notes ? `<div class="text-[11px] text-emerald-700 mt-1">Note: ${metrics.adminVerification.notes}</div>` : ''}
      `;
    } else {
      verifBanner.classList.add('hidden');
    }
  }

  // 4. Pre-fill Management Input Fields
  const cashInput = document.getElementById('admHandoverCashInput');
  const upiInput = document.getElementById('admHandoverUpiInput');
  const notesInput = document.getElementById('admHandoverNotesInput');

  if (cashInput) {
    if (metrics.adminVerification?.adminCash != null && metrics.adminVerification.adminCash > 0) {
      cashInput.value = metrics.adminVerification.adminCash;
    } else if (metrics.staffCash > 0) {
      cashInput.value = metrics.staffCash;
    } else {
      cashInput.value = '';
    }
  }

  if (upiInput) {
    if (metrics.adminVerification?.adminUpi != null && metrics.adminVerification.adminUpi > 0) {
      upiInput.value = metrics.adminVerification.adminUpi;
    } else {
      upiInput.value = metrics.staffUpi || (metrics.loggedUpiTotal > 0 ? metrics.loggedUpiTotal : '');
    }
  }

  if (notesInput) {
    notesInput.value = metrics.adminVerification?.notes || '';
  }

  // 5. Calculate live tally badge
  calculateAdminHandoverTally();

  // 6. Render expenses for active station
  renderAdminExpensesList(activeSt);

  // 7. Render 4 stations overview table
  renderAdminAllStationsTable();
}

function calculateAdminHandoverTally() {
  const activeSt = STATE.adminSelectedStation || 'S1';
  const metrics = getStationHandoverMetrics(activeSt);

  const cashVal = parseFloat(document.getElementById('admHandoverCashInput')?.value);
  const upiVal = parseFloat(document.getElementById('admHandoverUpiInput')?.value) || metrics.loggedUpiTotal || 0;

  // Re-calculate expected cash with management's UPI value
  const totalDeductions = metrics.vehicleTotal + metrics.reminderTotal + metrics.cardTotal + metrics.expenseTotal + upiVal;
  const expectedCash = Math.max(0, metrics.grossSale - totalDeductions);

  // Update Expected Cash card display
  const elExpCash = document.getElementById('admHoExpectedCashDisplay');
  const elTotDed = document.getElementById('admHoTotalDeductionsDisplay');
  const elUpiDed = document.getElementById('admHoUpiDeduction');

  if (elExpCash) elExpCash.innerText = `₹${expectedCash.toLocaleString('en-IN')}`;
  if (elTotDed) elTotDed.innerText = `- ₹${totalDeductions.toLocaleString('en-IN')}`;
  if (elUpiDed) elUpiDed.innerText = `- ₹${upiVal.toLocaleString('en-IN')}`;

  const tallyBadge = document.getElementById('admHoTallyBadge');
  if (!tallyBadge) return;

  if (isNaN(cashVal) || document.getElementById('admHandoverCashInput')?.value === '') {
    tallyBadge.className = 'bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl text-center font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-200';
    tallyBadge.innerHTML = STATE.lang === 'te' ? '<span>⏳ నగదు నమోదు చేయండి</span>' : '<span>⏳ Enter physical cash</span>';
    return;
  }

  const diff = cashVal - expectedCash;

  if (diff === 0) {
    tallyBadge.className = 'bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-center font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 animate-pulse';
    tallyBadge.innerHTML = STATE.lang === 'te' ? '<span>✓ లెక్క ఖచ్చితంగా సరిపోయింది! (₹0)</span>' : '<span>✓ Exact Tally Balanced! (₹0)</span>';
  } else if (diff < 0) {
    tallyBadge.className = 'bg-rose-600 text-white px-4 py-2.5 rounded-xl text-center font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5';
    tallyBadge.innerHTML = STATE.lang === 'te'
      ? `<span>⚠️ నగదు తక్కువగా ఉంది: -₹${Math.abs(diff).toLocaleString('en-IN')} (Shortage)</span>`
      : `<span>⚠️ Cash Shortage: -₹${Math.abs(diff).toLocaleString('en-IN')}</span>`;
  } else {
    tallyBadge.className = 'bg-amber-500 text-slate-900 px-4 py-2.5 rounded-xl text-center font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5';
    tallyBadge.innerHTML = STATE.lang === 'te'
      ? `<span>💰 అదనపు నగదు ఉంది: +₹${diff.toLocaleString('en-IN')} (Excess)</span>`
      : `<span>💰 Excess Cash: +₹${diff.toLocaleString('en-IN')}</span>`;
  }
}

function switchAdminHandoverStation(stKey) {
  STATE.adminSelectedStation = stKey;
  renderAdminHandoverDashboard();
}

async function saveAdminHandoverCount(silent = false) {
  const activeSt = STATE.adminSelectedStation || 'S1';
  const cash = parseFloat(document.getElementById('admHandoverCashInput')?.value) || 0;
  const upi = parseFloat(document.getElementById('admHandoverUpiInput')?.value) || 0;
  const notes = document.getElementById('admHandoverNotesInput')?.value.trim() || '';

  const payload = {
    date: STATE.selectedDate,
    stationId: activeSt,
    adminCash: cash,
    adminUpi: upi,
    verifiedBy: STATE.currentUser?.name || (STATE.currentUser?.role === 'owner' ? 'Bunk Owner' : 'Management'),
    notes,
    updateCollections: false
  };

  try {
    const res = await fetch(`/api/shifts/admin-verify-handover?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      if (!silent) {
        showToast(STATE.lang === 'te' ? 'మేనేజ్‌మెంట్ లెక్క విజయవంతంగా సేవ్ చేయబడింది!' : 'Management count saved successfully!');
      }
      await loadAllData();
      renderAdminHandoverDashboard();
    } else {
      if (!silent) showToast('Failed to save count', 'error');
    }
  } catch (e) {
    if (!silent) showToast('Failed to save count', 'error');
  }
}

async function confirmAndVerifyStaffHandover() {
  const activeSt = STATE.adminSelectedStation || 'S1';
  const cash = parseFloat(document.getElementById('admHandoverCashInput')?.value) || 0;
  const upi = parseFloat(document.getElementById('admHandoverUpiInput')?.value) || 0;
  const notes = document.getElementById('admHandoverNotesInput')?.value.trim() || '';

  const payload = {
    date: STATE.selectedDate,
    stationId: activeSt,
    adminCash: cash,
    adminUpi: upi,
    verifiedBy: STATE.currentUser?.name || (STATE.currentUser?.role === 'owner' ? 'Bunk Owner' : 'Management'),
    notes: notes || 'Verified and approved by management/owner',
    updateCollections: true
  };

  try {
    const res = await fetch(`/api/shifts/admin-verify-handover?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(STATE.lang === 'te' ? `స్టేషన్ ${activeSt} నగదు లెక్క సరిచూసి ఆమోదించబడింది! ✓` : `Station ${activeSt} handover verified and confirmed! ✓`);
      await loadAllData();
      renderAdminHandoverDashboard();
    } else {
      showToast('Failed to confirm handover', 'error');
    }
  } catch (e) {
    showToast('Failed to confirm handover', 'error');
  }
}

function renderAdminExpensesList(stId) {
  const container = document.getElementById('admHoExpensesListContainer');
  if (!container) return;

  const stData = STATE.shift?.stations?.[stId] || {};
  const expenses = stData.expensesList || [];
  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  const totalBadge = document.getElementById('admHoExpenseTotalBadge');
  if (totalBadge) totalBadge.innerText = `మొత్తం ఖర్చులు: ₹${total.toLocaleString('en-IN')}`;

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="text-center py-3 text-slate-400 text-xs bg-white rounded-xl border border-rose-100">
        ఈ స్టేషన్ లో ఇప్పటివరకు ఎలాంటి ఖర్చులు నమోదు కాలేదు. (No expenses recorded yet)
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="w-full text-xs text-left border-collapse bg-white rounded-xl overflow-hidden border border-rose-100">
      <thead>
        <tr class="bg-rose-100 text-rose-950 uppercase font-bold border-b border-rose-200">
          <th class="p-2">Time</th>
          <th class="p-2">Reason</th>
          <th class="p-2 text-right">Amount (₹)</th>
          <th class="p-2 text-right">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-rose-50 font-medium">
        ${expenses.map(e => `
          <tr class="hover:bg-rose-50/50">
            <td class="p-2 font-mono text-slate-500">${e.time || '-'}</td>
            <td class="p-2 font-bold text-slate-900">${e.reason}</td>
            <td class="p-2 font-mono font-black text-rose-800 text-sm text-right">₹${Number(e.amount || 0).toLocaleString('en-IN')}</td>
            <td class="p-2 text-right">
              <button onclick="deleteAdminExpenseEntry('${e.id}')" class="text-rose-600 hover:text-rose-800 font-bold text-[11px] px-2 py-0.5 rounded border border-rose-200 hover:bg-rose-50">
                🗑️ Delete
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function submitAdminExpenseEntry() {
  const activeSt = STATE.adminSelectedStation || 'S1';
  const reason = document.getElementById('admExpenseReasonInput')?.value.trim() || '☕ టీ / భోజనం (Tea / Food)';
  const amount = parseFloat(document.getElementById('admExpenseAmountInput')?.value) || 0;

  if (amount <= 0) {
    showToast(STATE.lang === 'te' ? 'దయచేసి ఖర్చు అమౌంట్ నమోదు చేయండి' : 'Please enter expense amount', 'error');
    return;
  }

  const payload = {
    date: STATE.selectedDate,
    stationId: activeSt,
    amount,
    reason
  };

  try {
    const res = await fetch(`/api/shifts/expenses?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`ఖర్చు ₹${amount} చేర్చబడింది!`);
      const amtInput = document.getElementById('admExpenseAmountInput');
      if (amtInput) amtInput.value = '';
      await loadAllData();
      renderAdminHandoverDashboard();
    } else {
      showToast('Failed to add expense', 'error');
    }
  } catch (e) {
    showToast('Failed to add expense', 'error');
  }
}

async function deleteAdminExpenseEntry(id) {
  const activeSt = STATE.adminSelectedStation || 'S1';
  if (!confirm(STATE.lang === 'te' ? 'ఈ ఖర్చును తొలగించాలనుకుంటున్నారా?' : 'Delete this expense entry?')) return;

  try {
    const res = await fetch(`/api/shifts/expenses/${id}?pump=${STATE.activeTenant}&date=${STATE.selectedDate}&stationId=${activeSt}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (result.success) {
      showToast('Expense removed');
      await loadAllData();
      renderAdminHandoverDashboard();
    } else {
      showToast('Failed to delete expense', 'error');
    }
  } catch (e) {
    showToast('Failed to delete expense', 'error');
  }
}

function renderAdminAllStationsTable() {
  const container = document.getElementById('admHoAllStationsTableContainer');
  if (!container) return;

  const stKeys = ['S1', 'S2', 'S3', 'S4'];
  let totalBunkGross = 0;
  let totalBunkDed = 0;
  let totalBunkExpCash = 0;
  let totalBunkStaffCash = 0;

  const rowsHtml = stKeys.map(k => {
    const m = getStationHandoverMetrics(k);
    totalBunkGross += m.grossSale;
    totalBunkDed += m.totalDeductions;
    totalBunkExpCash += m.expectedCash;
    totalBunkStaffCash += m.staffCash;

    const diff = m.staffCash - m.expectedCash;
    let diffDisplay = `<span class="text-slate-400">-</span>`;
    if (m.staffCash > 0 || m.status === 'submitted' || m.status === 'verified') {
      if (diff === 0) {
        diffDisplay = `<span class="text-emerald-700 font-black">✓ ₹0</span>`;
      } else if (diff < 0) {
        diffDisplay = `<span class="text-rose-700 font-black">-₹${Math.abs(diff).toLocaleString('en-IN')}</span>`;
      } else {
        diffDisplay = `<span class="text-amber-700 font-black">+₹${diff.toLocaleString('en-IN')}</span>`;
      }
    }

    let statusPill = `<span class="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">In Progress</span>`;
    if (m.status === 'verified') {
      statusPill = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">✓ Verified</span>`;
    } else if (m.status === 'submitted') {
      statusPill = `<span class="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-300">📩 Submitted</span>`;
    }

    const isCurrent = k === (STATE.adminSelectedStation || 'S1');
    const rowBg = isCurrent ? "bg-emerald-50/50 font-bold" : "hover:bg-slate-50";

    return `
      <tr class="${rowBg} border-b border-slate-100">
        <td class="p-2.5 font-black text-slate-900 flex items-center gap-1.5">
          <span>${k}</span>
          <span class="text-[10px] font-semibold text-slate-500">(${STATION_CONFIG[k]?.pump || k})</span>
        </td>
        <td class="p-2.5 text-slate-800 font-bold">${m.attendantName}</td>
        <td class="p-2.5 font-mono text-right text-slate-900 font-bold">₹${m.grossSale.toLocaleString('en-IN')}</td>
        <td class="p-2.5 font-mono text-right text-amber-800 font-semibold">-₹${m.totalDeductions.toLocaleString('en-IN')}</td>
        <td class="p-2.5 font-mono text-right font-black text-emerald-700">₹${m.expectedCash.toLocaleString('en-IN')}</td>
        <td class="p-2.5 font-mono text-right font-black text-slate-900">₹${m.staffCash.toLocaleString('en-IN')}</td>
        <td class="p-2.5 font-mono text-right">${diffDisplay}</td>
        <td class="p-2.5 text-center">${statusPill}</td>
        <td class="p-2.5 text-center">
          <button onclick="switchAdminHandoverStation('${k}')" class="bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-black px-2.5 py-1 rounded-lg shadow-sm">
            ${isCurrent ? 'Viewing' : 'Inspect'}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const bunkDiff = totalBunkStaffCash - totalBunkExpCash;
  let bunkDiffDisplay = `<span class="text-slate-400">-</span>`;
  if (totalBunkStaffCash > 0) {
    if (bunkDiff === 0) bunkDiffDisplay = `<span class="text-emerald-700 font-black">✓ ₹0</span>`;
    else if (bunkDiff < 0) bunkDiffDisplay = `<span class="text-rose-700 font-black">-₹${Math.abs(bunkDiff).toLocaleString('en-IN')}</span>`;
    else bunkDiffDisplay = `<span class="text-amber-700 font-black">+₹${bunkDiff.toLocaleString('en-IN')}</span>`;
  }

  container.innerHTML = `
    <table class="w-full text-xs text-left border-collapse">
      <thead>
        <tr class="bg-slate-100 text-slate-700 uppercase font-black border-b border-slate-200">
          <th class="p-2.5">Station</th>
          <th class="p-2.5">Attendant</th>
          <th class="p-2.5 text-right">Gross Fuel</th>
          <th class="p-2.5 text-right">Deductions</th>
          <th class="p-2.5 text-right">Expected Cash</th>
          <th class="p-2.5 text-right">Staff Handed</th>
          <th class="p-2.5 text-right">Diff</th>
          <th class="p-2.5 text-center">Status</th>
          <th class="p-2.5 text-center">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 font-medium">
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr class="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-700">
          <td class="p-3" colspan="2">BUNK GRAND TOTAL (మొత్తం బంక్):</td>
          <td class="p-3 font-mono text-right text-amber-300">₹${totalBunkGross.toLocaleString('en-IN')}</td>
          <td class="p-3 font-mono text-right text-rose-300">-₹${totalBunkDed.toLocaleString('en-IN')}</td>
          <td class="p-3 font-mono text-right text-emerald-400 text-sm">₹${totalBunkExpCash.toLocaleString('en-IN')}</td>
          <td class="p-3 font-mono text-right text-white text-sm">₹${totalBunkStaffCash.toLocaleString('en-IN')}</td>
          <td class="p-3 font-mono text-right">${bunkDiffDisplay}</td>
          <td class="p-3" colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  `;
}

async function refreshAdminHandoverData() {
  await loadAllData();
  renderAdminHandoverDashboard();
  showToast(STATE.lang === 'te' ? 'తాజా లెక్కలు అప్‌డేట్ చేయబడ్డాయి' : 'Handover data refreshed');
}

function renderAdminDashboard() {
  if (!STATE.summary) return;

  const isTe = STATE.lang === 'te';

  // 1. Slip & Financials (Language-Aware Slip Text)
  const preSlip = document.getElementById('preSlipText');
  if (preSlip) {
    preSlip.innerText = isTe ? (STATE.summary.slipTextTe || STATE.summary.slipText) : (STATE.summary.slipTextEn || STATE.summary.slipText);
  }

  const sumDateEl = document.getElementById('sumShiftDate');
  if (sumDateEl) sumDateEl.innerText = STATE.summary.dateFormatted;

  const grandAmtEl = document.getElementById('cardGrandTotalAmount');
  if (grandAmtEl) grandAmtEl.innerText = `₹${STATE.summary.grandTotal.formattedAmount}`;

  const pAmtEl = document.getElementById('cardPetrolAmt');
  const pVolEl = document.getElementById('cardPetrolVol');
  if (pAmtEl) pAmtEl.innerText = `₹${STATE.summary.petrol.formattedAmount}`;
  if (pVolEl) pVolEl.innerText = `${STATE.summary.petrol.formattedLitres} ${isTe ? 'లీటర్లు' : 'Litres'}`;

  const dAmtEl = document.getElementById('cardDieselAmt');
  const dVolEl = document.getElementById('cardDieselVol');
  if (dAmtEl) dAmtEl.innerText = `₹${STATE.summary.diesel.formattedAmount}`;
  if (dVolEl) dVolEl.innerText = `${STATE.summary.diesel.formattedLitres} ${isTe ? 'లీటర్లు' : 'Litres'}`;

  // Reconciliation
  const totalCash = document.getElementById('recTotalCash');
  const totalUpi = document.getElementById('recTotalUpi');
  const totalCard = document.getElementById('recTotalCard');
  const totalExp = document.getElementById('recTotalExpenses');
  if (totalCash) totalCash.innerText = `₹${(STATE.summary.reconciliation.totalCash || 0).toLocaleString('en-IN')}`;
  if (totalUpi) totalUpi.innerText = `₹${(STATE.summary.reconciliation.totalUpi || 0).toLocaleString('en-IN')}`;
  if (totalCard) totalCard.innerText = `₹${(STATE.summary.reconciliation.totalCard || 0).toLocaleString('en-IN')}`;
  if (totalExp) totalExp.innerText = `₹${(STATE.summary.reconciliation.totalExpenses || 0).toLocaleString('en-IN')}`;

  // Reminders badge
  const pendingRems = STATE.reminders.filter(r => r.status === 'pending');
  const badgeRem = document.getElementById('badgePendingReminderCount');
  if (badgeRem) badgeRem.innerText = pendingRems.length;

  // Station breakdown cards
  renderStationBreakdownCards();
  renderSummaryPumpAssignments();

  // Active admin tab rendering
  if (STATE.adminTab === 'financials') loadFinancialReports();
  if (STATE.adminTab === 'dues') loadEmployeeDues();
  if (STATE.adminTab === 'fleet') renderAdminFleetLedger();
  if (STATE.adminTab === 'reminders') renderAdminRemindersTable();
  if (STATE.adminTab === 'employees') renderAdminEmployeesTable();
  if (STATE.adminTab === 'roster') renderAdminDutyRoster();
  if (STATE.adminTab === 'pdbs') renderAdminPdbs();
  if (STATE.adminTab === 'tanks') renderTanksView();
}

// --- BUNK OWNER FINANCIAL REPORTS & HISTORICAL ARCHIVE ---
// User requirement: "in bunk owner (lets keep mgmt) and lets create one more login with bunk owner(or only owner) to see all the financial report. Note : mgmt user will not be allowed to see the historical finance/sale/ whatever the old cannot viewed where as only owner can see it"
async function loadFinancialReports() {
  if (STATE.currentUser?.role === 'mgmt') return;

  try {
    const headers = {};
    if (STATE.currentUser?.role) headers['x-user-role'] = STATE.currentUser.role;

    const res = await fetch(`/api/financial-reports?pump=${STATE.activeTenant}`, { headers });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to load financial reports', 'error');
      return;
    }

    const data = await res.json();
    STATE.financialReports = data;
    renderFinancialReports();
  } catch (err) {
    console.error('Error loading financial reports:', err);
  }
}

function renderFinancialReports() {
  const data = STATE.financialReports;
  if (!data) return;

  const m = data.metrics || {};
  const isTe = STATE.lang === 'te';

  // 1. Metric Cards
  const elTotSales = document.getElementById('finMetricTotalSales');
  const elTotShifts = document.getElementById('finMetricTotalShifts');
  const elPetrolAmt = document.getElementById('finMetricPetrolAmount');
  const elPetrolVol = document.getElementById('finMetricPetrolLitres');
  const elDieselAmt = document.getElementById('finMetricDieselAmount');
  const elDieselVol = document.getElementById('finMetricDieselLitres');
  const elFleetDues = document.getElementById('finMetricFleetDues');
  const elFleetVol = document.getElementById('finMetricFleetLitres');
  const elShiftsCount = document.getElementById('finShiftsCountBadge');

  if (elTotSales) elTotSales.innerText = `₹${(m.totalAccumulatedSales || 0).toLocaleString('en-IN')}`;
  if (elTotShifts) elTotShifts.innerText = isTe ? `${m.totalShifts || 0} షిఫ్టులు రికార్డయ్యాయి` : `${m.totalShifts || 0} Shifts Recorded`;
  if (elPetrolAmt) elPetrolAmt.innerText = `₹${(m.totalPetrolAmount || 0).toLocaleString('en-IN')}`;
  if (elPetrolVol) elPetrolVol.innerText = `${(m.totalPetrolLitres || 0).toFixed(2)} ${isTe ? 'లీటర్లు' : 'Litres'}`;
  if (elDieselAmt) elDieselAmt.innerText = `₹${(m.totalDieselAmount || 0).toLocaleString('en-IN')}`;
  if (elDieselVol) elDieselVol.innerText = `${(m.totalDieselLitres || 0).toFixed(2)} ${isTe ? 'లీటర్లు' : 'Litres'}`;
  if (elFleetDues) elFleetDues.innerText = `₹${(m.unsettledFleetDues || 0).toLocaleString('en-IN')}`;
  if (elFleetVol) elFleetVol.innerText = `${(m.unsettledFleetLitres || 0).toFixed(2)} L ${isTe ? 'బాకీ' : 'Pending'}`;
  if (elShiftsCount) elShiftsCount.innerText = `${m.totalShifts || 0} ${isTe ? 'షిఫ్టులు' : 'shifts'}`;

  // 2. Table of Past Shifts
  const tbody = document.getElementById('finShiftsTableBody');
  if (tbody) {
    if (!data.history || data.history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 text-xs">${isTe ? 'గత షిఫ్టుల రికార్డులు లేవు' : 'No historical shifts found.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.history.map(h => `
      <tr class="hover:bg-amber-50/50 transition-all">
        <td class="p-2.5 font-mono font-bold text-slate-900">${h.dateFormatted || h.date}</td>
        <td class="p-2.5 font-mono text-orange-700 font-bold">${h.petrolLitres.toFixed(2)} L<span class="block text-[10px] text-slate-500 font-normal">₹${h.petrolAmount.toLocaleString('en-IN')}</span></td>
        <td class="p-2.5 font-mono text-blue-700 font-bold">${h.dieselLitres.toFixed(2)} L<span class="block text-[10px] text-slate-500 font-normal">₹${h.dieselAmount.toLocaleString('en-IN')}</span></td>
        <td class="p-2.5 font-mono font-black text-slate-900">₹${h.grandTotalAmount.toLocaleString('en-IN')}</td>
        <td class="p-2.5 font-mono text-emerald-700 font-bold">₹${(h.cash || 0).toLocaleString('en-IN')}</td>
        <td class="p-2.5">
          <button onclick="loadHistoricalSlipForDate('${h.date}')" class="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-amber-300 shadow-sm flex items-center gap-1 transition-all active:scale-95">
            <span>📄</span>
            <span>${isTe ? 'రసీదు' : 'View Slip'}</span>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Set picker default and load first available historical slip
  if (data.history && data.history.length > 0) {
    const firstDate = data.history[0].date;
    loadHistoricalSlipForDate(firstDate);
  }
}

async function loadHistoricalSlipForDate(date) {
  if (!date) return;
  const isTe = STATE.lang === 'te';
  const pre = document.getElementById('finHistoricalSlipText');
  const dateLbl = document.getElementById('finSlipDateLabel');
  const picker = document.getElementById('finHistoricalShiftDatePicker');

  if (dateLbl) dateLbl.innerText = date;
  if (picker) picker.value = date;

  try {
    const res = await fetch(`/api/daily-summary?pump=${STATE.activeTenant}&date=${date}&lang=${STATE.lang}`);
    const summary = await res.json();
    const slip = isTe ? (summary.slipTextTe || summary.slipText) : (summary.slipTextEn || summary.slipText);
    if (pre) pre.innerText = slip;
    STATE.currentHistoricalSlip = slip;
  } catch (err) {
    if (pre) pre.innerText = isTe ? 'రసీదు లోడ్ చేయడంలో విఫలమైంది.' : 'Failed to load slip for selected date.';
  }
}

function copyHistoricalSlip() {
  const text = STATE.currentHistoricalSlip || document.getElementById('finHistoricalSlipText')?.innerText;
  if (!text) return;
  navigator.clipboard.writeText(text);
  showToast(STATE.lang === 'te' ? 'రసీదు క్లిప్‌బోర్డుకు కాపీ చేయబడింది!' : 'Historical slip copied to clipboard!');
}

function shareHistoricalSlipWhatsApp() {
  const text = STATE.currentHistoricalSlip || document.getElementById('finHistoricalSlipText')?.innerText;
  if (!text) return;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
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
          <div>
            <span class="text-slate-500 font-bold block text-[10px]">Station Total:</span>
            <span class="font-mono font-black text-slate-900 text-sm">₹${info.totalAmount.toLocaleString('en-IN')}</span>
          </div>
          <button onclick="openAdminEditStationModal('${stKey}')" class="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-amber-300 shadow-sm flex items-center gap-1 transition-all active:scale-95">
            <span>✏️</span>
            <span>సవరణ (Edit)</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Admin Station Readings Override Modal
function openAdminEditStationModal(stKey) {
  const modal = document.getElementById('modalAdminEditStationReading');
  if (!modal) return;

  const cfg = STATION_CONFIG[stKey] || STATION_CONFIG.S1;
  const shiftSt = STATE.shift?.stations?.[stKey] || {};
  const sumSt = STATE.summary?.stationBreakdown?.[stKey] || {};

  document.getElementById('admEditStationId').value = stKey;
  document.getElementById('admModalStationTitle').innerText = `స్టేషన్ ${stKey} రీడింగ్ సవరణ (Edit Station ${stKey})`;
  document.getElementById('admModalStationSubtitle').innerText = `${cfg.pump} (${cfg.side}) • Nozzles ${cfg.petrolCode} & ${cfg.dieselCode}`;
  document.getElementById('admEditEmployeeName').value = shiftSt.employeeName || sumSt.employeeName || '';

  document.getElementById('admEditPetrolMeterCode').innerText = `పెట్రోల్ (Petrol - ${cfg.petrolCode})`;
  document.getElementById('admEditDieselMeterCode').innerText = `డీజిల్ (Diesel - ${cfg.dieselCode})`;

  const pOpen = shiftSt.meters?.petrol?.open ?? sumSt.petrol?.open ?? 0;
  const pClose = shiftSt.meters?.petrol?.close ?? sumSt.petrol?.close ?? 0;
  const pTest = shiftSt.meters?.petrol?.testing ?? sumSt.petrol?.testing ?? 0;

  const dOpen = shiftSt.meters?.diesel?.open ?? sumSt.diesel?.open ?? 0;
  const dClose = shiftSt.meters?.diesel?.close ?? sumSt.diesel?.close ?? 0;
  const dTest = shiftSt.meters?.diesel?.testing ?? sumSt.diesel?.testing ?? 0;

  document.getElementById('admEditPetrolOpen').value = pOpen;
  document.getElementById('admEditPetrolClose').value = pClose || '';
  document.getElementById('admEditPetrolTesting').value = pTest || 0;

  document.getElementById('admEditDieselOpen').value = dOpen;
  document.getElementById('admEditDieselClose').value = dClose || '';
  document.getElementById('admEditDieselTesting').value = dTest || 0;

  calculateAdminLiveEditLitres();
  modal.classList.remove('hidden');
}

function closeAdminEditStationModal() {
  const modal = document.getElementById('modalAdminEditStationReading');
  if (modal) modal.classList.add('hidden');
}

function calculateAdminLiveEditLitres() {
  const pOpen = parseFloat(document.getElementById('admEditPetrolOpen')?.value) || 0;
  const pClose = parseFloat(document.getElementById('admEditPetrolClose')?.value) || 0;
  const pTest = parseFloat(document.getElementById('admEditPetrolTesting')?.value) || 0;
  const pLitres = pClose > pOpen ? Math.max(0, pClose - pOpen - pTest) : 0;
  const pRate = STATE.rates?.petrol || 117.07;
  const pAmt = Math.round(pLitres * pRate);

  const dOpen = parseFloat(document.getElementById('admEditDieselOpen')?.value) || 0;
  const dClose = parseFloat(document.getElementById('admEditDieselClose')?.value) || 0;
  const dTest = parseFloat(document.getElementById('admEditDieselTesting')?.value) || 0;
  const dLitres = dClose > dOpen ? Math.max(0, dClose - dOpen - dTest) : 0;
  const dRate = STATE.rates?.diesel || 105.23;
  const dAmt = Math.round(dLitres * dRate);

  const totAmt = pAmt + dAmt;

  const pPrev = document.getElementById('admEditPetrolPreview');
  const dPrev = document.getElementById('admEditDieselPreview');
  const totPrev = document.getElementById('admEditStationTotalPreview');

  if (pPrev) pPrev.innerText = `${pLitres.toFixed(2)} L • ₹${pAmt.toLocaleString('en-IN')}`;
  if (dPrev) dPrev.innerText = `${dLitres.toFixed(2)} L • ₹${dAmt.toLocaleString('en-IN')}`;
  if (totPrev) totPrev.innerText = `₹${totAmt.toLocaleString('en-IN')}`;
}

async function saveAdminStationReading() {
  const stationId = document.getElementById('admEditStationId').value;
  const employeeName = document.getElementById('admEditEmployeeName').value.trim();
  const pOpen = parseFloat(document.getElementById('admEditPetrolOpen').value) || 0;
  const pClose = parseFloat(document.getElementById('admEditPetrolClose').value) || 0;
  const pTest = parseFloat(document.getElementById('admEditPetrolTesting').value) || 0;

  const dOpen = parseFloat(document.getElementById('admEditDieselOpen').value) || 0;
  const dClose = parseFloat(document.getElementById('admEditDieselClose').value) || 0;
  const dTest = parseFloat(document.getElementById('admEditDieselTesting').value) || 0;

  if (pClose > 0 && pClose < pOpen) {
    showToast('Petrol closing reading cannot be less than opening reading', 'error');
    return;
  }
  if (dClose > 0 && dClose < dOpen) {
    showToast('Diesel closing reading cannot be less than opening reading', 'error');
    return;
  }

  const payload = {
    date: STATE.selectedDate,
    stationId,
    employeeName,
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
      showToast(`Station ${stationId} readings saved! Daily slip auto-recalculated.`);
      closeAdminEditStationModal();
      await loadAllData();
    } else {
      showToast(result.error || 'Failed to save readings', 'error');
    }
  } catch (err) {
    showToast('Server error while saving station readings', 'error');
  }
}

async function refreshAdminNozzles() {
  await loadAllData();
  showToast('🔄 Nozzles auto-synced! Daily sales slip refreshed.');
}

// --- ADMIN / MGMT EMPLOYEE DUES LEDGER & SHORTAGES ---
// User requirement: "also for mgmt or admin - > allow a tab called due
// for example a employee will total sale 20000 thn he given 19000 means 1000 rupees will be the due will be marked on that employee name
// note :: what ever the amount related will be stored forever and can be viewd any time in admin page"
async function loadEmployeeDues() {
  try {
    const res = await fetch(`/api/employee-dues?pump=${STATE.activeTenant}`);
    if (!res.ok) return;
    const data = await res.json();
    STATE.employeeDues = data.dues || [];
    STATE.employeeDuesSummaries = data.employeeSummaries || [];
    STATE.duesMetrics = data.metrics || {};
    renderEmployeeDues();
  } catch (err) {
    console.error('Error loading employee dues:', err);
  }
}

function renderEmployeeDues() {
  const m = STATE.duesMetrics || {};
  const elPending = document.getElementById('dueMetricTotalPending');
  const elPendingCount = document.getElementById('dueMetricPendingCount');
  const elSettled = document.getElementById('dueMetricTotalSettled');
  const elSettledCount = document.getElementById('dueMetricSettledCount');
  const elTotalInc = document.getElementById('dueMetricTotalIncidents');

  if (elPending) elPending.innerText = `₹${(m.totalOutstanding || 0).toLocaleString('en-IN')}`;
  if (elPendingCount) elPendingCount.innerText = `${m.pendingCount || 0} Incidents Outstanding`;
  if (elSettled) elSettled.innerText = `₹${(m.totalSettled || 0).toLocaleString('en-IN')}`;
  if (elSettledCount) elSettledCount.innerText = `${m.settledCount || 0} Dues Cleared`;
  if (elTotalInc) elTotalInc.innerText = `${STATE.employeeDues?.length || 0}`;

  // Render Employee-Wise Dues Summary Table
  renderEmployeeDuesSummaryTable(STATE.employeeDuesSummaries);

  // Render Detailed Shift Shortage History Table
  filterEmployeeDuesTable();
}

function renderEmployeeDuesSummaryTable(summaries) {
  const tbody = document.getElementById('adminEmployeeDuesSummaryTableBody');
  if (!tbody) return;

  const list = summaries || STATE.employeeDuesSummaries || [];
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 text-xs">సిబ్బంది వద్ద ఎలాంటి పెండింగ్ బాకీలు లేవు (No pending dues on any staff)</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => {
    const datesStr = item.dates && item.dates.length > 0
      ? (item.dates.length > 3 ? `${item.dates.slice(0, 3).join(', ')} (+${item.dates.length - 3} more)` : item.dates.join(', '))
      : '-';

    const hasPending = item.totalDue > 0;

    return `
      <tr class="hover:bg-rose-50/50 transition-colors">
        <td class="p-3 font-bold text-slate-900 flex items-center gap-2">
          <span class="text-base">👤</span>
          <div>
            <div class="font-black text-slate-900">${item.employeeName}</div>
            <div class="text-[10px] text-slate-500">${item.records?.length || 0} Total Incidents recorded</div>
          </div>
        </td>
        <td class="p-3 font-mono font-black text-sm ${hasPending ? 'text-rose-600' : 'text-emerald-600'}">
          ₹${Number(item.totalDue || 0).toLocaleString('en-IN')}
        </td>
        <td class="p-3 text-slate-700 font-bold font-mono">
          <span class="px-2 py-0.5 rounded text-xs ${hasPending ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}">
            ${item.pendingCount || 0} Shifts
          </span>
        </td>
        <td class="p-3 font-mono text-[11px] text-slate-700 font-semibold" title="${(item.dates || []).join(', ')}">
          ${datesStr}
        </td>
        <td class="p-3 font-mono text-slate-600 text-xs">
          ${item.latestDate || '-'}
        </td>
        <td class="p-3 text-right">
          ${hasPending ? `
            <button onclick="settleAllEmployeeDues('${item.employeeName.replace(/'/g, "\\'")}')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-xl shadow active:scale-95 transition-all">
              Settle All (మొత్తం క్లియర్)
            </button>
          ` : `
            <span class="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1">
              <span>✓</span><span>All Clear (బాకీ లేదు)</span>
            </span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

async function settleAllEmployeeDues(empName) {
  if (!confirm(`Settle all pending dues for employee "${empName}"?`)) return;

  try {
    const res = await fetch(`/api/employee-dues/settle-all?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeName: empName, settledMode: 'Management Cash Recovery' })
    });
    const result = await res.json();
    if (result.success) {
      showToast(STATE.lang === 'te' 
        ? `${empName} యొక్క మొత్తం ${result.settledCount} బాకీలు సెటిల్ చేయబడ్డాయి!` 
        : `Settled ${result.settledCount} dues (₹${result.settledAmount}) for ${empName}!`);
      await loadEmployeeDues();
    } else {
      showToast(result.error || 'Failed to settle employee dues', 'error');
    }
  } catch (err) {
    showToast('Failed to settle employee dues', 'error');
  }
}

// --- MONTH-END DUTY ATTENDANCE & SALARY DAYS CONTROLLER ---
// User requirement: "and when month end comes to give salary how many days that emp has done work in station"
async function loadDutyAttendanceData() {
  const monthInput = document.getElementById('attMonthSelector');
  const month = monthInput ? monthInput.value : (STATE.selectedDate || '2026-10').slice(0, 7);

  try {
    const res = await fetch(`/api/duty-attendance?month=${month}&pump=${STATE.activeTenant}`);
    if (!res.ok) return;
    const data = await res.json();
    STATE.dutyAttendance = data;

    const elStaff = document.getElementById('attMetricStaffCount');
    const elDays = document.getElementById('attMetricTotalDays');
    const elActive = document.getElementById('attMetricActiveDates');

    if (elStaff) elStaff.innerText = data.summary?.totalEmployees || 0;
    if (elDays) elDays.innerText = `${data.summary?.totalDutyDays || 0} Days`;
    if (elActive) elActive.innerText = `${data.summary?.activeDatesCount || 0} Days`;

    renderDutyAttendanceTable();
  } catch (err) {
    console.error('Error loading duty attendance:', err);
  }
}

function renderDutyAttendanceTable() {
  const tbody = document.getElementById('adminAttendanceSalaryTableBody');
  if (!tbody) return;

  const list = STATE.dutyAttendance?.attendanceList || [];
  const search = (document.getElementById('attSearchInput')?.value || '').toLowerCase().trim();

  const filtered = list.filter(a => {
    return !search || a.name.toLowerCase().includes(search) || (a.phone && a.phone.includes(search));
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400 text-xs font-semibold">హాజరు రికార్డులు ఏవీ లేవు (No attendance records found)</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const stationsStr = Object.entries(a.stationCounts || {})
      .filter(([k, v]) => v > 0)
      .map(([k, v]) => `<span class="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">${k}: ${v}d</span>`)
      .join(' ') || '<span class="text-slate-400">-</span>';

    const datesTooltip = (a.datesWorked || []).join(', ') || 'None';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-3 font-bold text-slate-900">
          <div class="flex items-center gap-2">
            <span class="text-base">👤</span>
            <div>
              <div class="font-black text-blue-900">${a.name}</div>
              <div class="text-[10px] text-slate-500 font-normal">${a.role} • ${a.villageName || ''}</div>
            </div>
          </div>
        </td>
        <td class="p-3 font-mono text-slate-600 font-bold">${a.phone || '-'}</td>
        <td class="p-3 text-center">
          <span class="bg-emerald-100 text-emerald-950 text-xs font-black font-mono px-3 py-1 rounded-full border border-emerald-300 shadow-xs">
            ${a.daysWorked} Days (${a.daysWorked} రోజులు)
          </span>
        </td>
        <td class="p-3">
          <span class="text-[11px] text-slate-700 font-mono font-semibold" title="${datesTooltip}">
            ${a.datesWorked && a.datesWorked.length > 0 ? (a.datesWorked.length > 3 ? `${a.datesWorked.slice(0, 3).join(', ')} +${a.datesWorked.length - 3} more` : a.datesWorked.join(', ')) : '-'}
          </span>
        </td>
        <td class="p-3">${stationsStr}</td>
        <td class="p-3 font-mono font-black ${a.pendingDue > 0 ? 'text-rose-600' : 'text-slate-400'}">
          ${a.pendingDue > 0 ? `₹${a.pendingDue.toLocaleString('en-IN')}` : '₹0'}
        </td>
        <td class="p-3 text-right">
          <div class="font-mono font-black text-slate-900 text-sm">₹${a.netPayable.toLocaleString('en-IN')}</div>
          <div class="text-[10px] text-slate-500">Gross: ₹${a.totalEarnings.toLocaleString('en-IN')}</div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterDutyAttendanceTable() {
  renderDutyAttendanceTable();
}

function filterEmployeeDuesTable() {
  const tbody = document.getElementById('adminDuesTableBody');
  if (!tbody) return;

  const dues = STATE.employeeDues || [];
  const search = (document.getElementById('duesFilterEmployeeInput')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('duesFilterStatusSelect')?.value || 'all';

  let filtered = dues.filter(d => {
    const matchesEmp = !search || (d.employeeName && d.employeeName.toLowerCase().includes(search));
    const isPending = d.status === 'pending' || d.status === 'unsettled';
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'pending' && isPending) ||
      (statusFilter === 'settled' && d.status === 'settled');
    return matchesEmp && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400 text-xs font-semibold">రికార్డులు ఏవీ కనుగొనబడలేదు (No employee shortage records found)</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const isPending = d.status === 'pending' || d.status === 'unsettled';
    const statusBadge = isPending
      ? `<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-300">⚠️ Pending Shortage</span>`
      : `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">✓ Settled (${d.settledMode || 'Recovered'})</span>`;

    const actionBtn = isPending
      ? `<button onclick="openSettleDueModal('${d.id}', '${(d.employeeName || 'Attendant').replace(/'/g, "\\'")}', ${d.shortageAmount}, '${d.date}', '${d.stationId || 'S1'}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg shadow active:scale-95 flex items-center gap-1">
          <span>✓</span><span>సెటిల్ (Settle)</span>
        </button>`
      : `<span class="text-[11px] text-slate-400 font-mono font-medium">${d.settledAt ? d.settledAt.split('T')[0] : 'Cleared'}</span>`;

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-2.5 font-mono text-slate-600">
          <div class="font-bold text-slate-900">${d.date}</div>
          <div class="text-[10px] text-slate-400">${d.createdAt ? new Date(d.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
        </td>
        <td class="p-2.5 font-bold text-slate-900">
          <div>${d.employeeName}</div>
          <div class="text-[10px] text-slate-500 font-normal">${d.notes || ''}</div>
        </td>
        <td class="p-2.5">
          <span class="bg-slate-100 text-slate-800 text-xs font-mono font-black px-2 py-0.5 rounded">${d.stationId || 'S1'}</span>
        </td>
        <td class="p-2.5 font-mono text-slate-700 font-bold">₹${Number(d.expectedCash || 0).toLocaleString('en-IN')}</td>
        <td class="p-2.5 font-mono text-slate-700 font-bold">₹${Number(d.actualCash || 0).toLocaleString('en-IN')}</td>
        <td class="p-2.5 font-mono font-black text-rose-700 text-sm">₹${Number(d.shortageAmount || 0).toLocaleString('en-IN')}</td>
        <td class="p-2.5">${statusBadge}</td>
        <td class="p-2.5 text-right">${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

function openSettleDueModal(dueId, empName, amount, date, stationId) {
  document.getElementById('settleDueRecordId').value = dueId;
  document.getElementById('settleDueEmpName').innerText = empName;
  document.getElementById('settleDueDateStation').innerText = `${stationId} • ${date}`;
  document.getElementById('settleDueAmount').innerText = `₹${Number(amount).toLocaleString('en-IN')}`;
  document.getElementById('settleDueNotes').value = '';
  document.getElementById('modalSettleDue').classList.remove('hidden');
}

function closeSettleDueModal() {
  document.getElementById('modalSettleDue').classList.add('hidden');
}

async function confirmSettleDue() {
  const dueId = document.getElementById('settleDueRecordId').value;
  const settledMode = document.getElementById('settleDueMode').value;
  const settledNotes = document.getElementById('settleDueNotes').value.trim();

  if (!dueId) return;

  try {
    const res = await fetch(`/api/employee-dues/${dueId}/settle?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settledMode, settledNotes })
    });
    const result = await res.json();
    if (result.success) {
      showToast(STATE.lang === 'te' ? 'బాకీ విజయవంతంగా సెటిల్ చేయబడింది!' : 'Due settled successfully!');
      closeSettleDueModal();
      await loadEmployeeDues();
    } else {
      showToast(result.error || 'Failed to settle due', 'error');
    }
  } catch (err) {
    showToast('Server error settling due', 'error');
  }
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
        <td class="p-2.5 font-mono font-bold text-blue-800">${v.mobileNumber || v.driverPhone || '-'}</td>
        <td class="p-2.5 font-bold">${v.stationId}</td>
        <td class="p-2.5 font-bold">${v.fuelType}</td>
        <td class="p-2.5 font-mono font-bold text-blue-700">${(v.litres || 0).toFixed(2)} L</td>
        <td class="p-2.5 font-mono text-slate-600">₹${v.rate || '-'}</td>
        <td class="p-2.5 font-mono font-black text-slate-900">₹${(v.amount || 0).toLocaleString('en-IN')}</td>
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
      <td class="p-3 font-mono text-slate-600">${emp.phone || '-'}</td>
      <td class="p-3 font-semibold text-slate-800">${emp.fatherName || '-'}</td>
      <td class="p-3 text-slate-700 font-semibold">${emp.villageName || '-'}</td>
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
  document.getElementById('modalEmpPassword').value = '123';
  document.getElementById('modalEmpAadhaar').value = '';
  document.getElementById('modalEmpEmergency').value = '';
  const errEl = document.getElementById('empFatherError');
  if (errEl) errEl.classList.add('hidden');
  document.getElementById('modalAddEmployee').classList.remove('hidden');
}

function closeAddEmployeeModal() {
  const errEl = document.getElementById('empFatherError');
  if (errEl) errEl.classList.add('hidden');
  document.getElementById('modalAddEmployee').classList.add('hidden');
}

function checkFatherNameDifferent() {
  const name = (document.getElementById('modalEmpName')?.value || '').trim().toLowerCase();
  const father = (document.getElementById('modalEmpFatherName')?.value || '').trim().toLowerCase();
  const errEl = document.getElementById('empFatherError');
  if (errEl) {
    if (name && father && name === father) {
      errEl.classList.remove('hidden');
    } else {
      errEl.classList.add('hidden');
    }
  }
}

async function saveNewEmployee() {
  const name = document.getElementById('modalEmpName').value.trim();
  const fatherName = document.getElementById('modalEmpFatherName').value.trim();
  const villageName = document.getElementById('modalEmpVillage').value.trim();
  const phone = document.getElementById('modalEmpPhone').value.trim();
  const password = document.getElementById('modalEmpPassword').value.trim() || '123';
  const aadhaarNumber = document.getElementById('modalEmpAadhaar').value.trim();
  const emergencyContact = document.getElementById('modalEmpEmergency').value.trim();
  const address = document.getElementById('modalEmpAddress').value.trim();
  const role = document.getElementById('modalEmpRole')?.value || 'Attendant';

  if (!name || !phone) {
    showToast('Name and Phone are required', 'error');
    return;
  }

  // User requirement: "Employee name and father name should not be same during emp kyc"
  if (fatherName && name.toLowerCase() === fatherName.toLowerCase()) {
    showToast(STATE.lang === 'te' 
      ? 'ఉద్యోగి పేరు మరియు తండ్రి పేరు ఒకేలా ఉండకూడదు!' 
      : "Employee Name and Father's Name cannot be the same!", 'error');
    const errEl = document.getElementById('empFatherError');
    if (errEl) errEl.classList.remove('hidden');
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
      if (result.employee) {
        const exists = STATE.employees.find(e => e.id === result.employee.id);
        if (!exists) STATE.employees.push(result.employee);
      }
      closeAddEmployeeModal();
      renderAdminEmployeesTable();
      renderAdminDutyRoster();
      await loadAllData();
      renderAdminEmployeesTable();
      renderAdminDutyRoster();
      showToast(STATE.lang === 'te' ? `సిబ్బంది "${name}" విజయవంతంగా చేర్చబడింది!` : `Employee "${name}" added successfully!`);
    } else {
      showToast(result.error || 'Failed to add employee', 'error');
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
      STATE.employees = STATE.employees.filter(e => e.id !== id);
      renderAdminEmployeesTable();
      renderAdminDutyRoster();
      await loadAllData();
      renderAdminEmployeesTable();
      renderAdminDutyRoster();
      showToast(STATE.lang === 'te' ? `సిబ్బంది "${name}" తొలగించబడింది` : `Employee "${name}" removed`);
    }
  } catch (err) {
    showToast('Failed to remove employee', 'error');
  }
}

// --- ADMIN / MGMT / OWNER DUTY ROSTER & PUMP ALLOCATION ---
// User requirement: "as said, mgmt and owner need to assign the pumps to emp"
function renderAdminDutyRoster() {
  const container = document.getElementById('dutyRosterCardsContainer');
  if (!container) return;

  const assignments = STATE.dutyAssignments || {};
  const stations = ['S1', 'S2', 'S3', 'S4'];
  const defaultPins = { S1: "1122", S2: "3344", S3: "5566", S4: "7788" };

  container.innerHTML = stations.map(stKey => {
    const cfg = STATION_CONFIG[stKey];
    const assignedName = assignments[stKey]?.employeeName || STATE.shift?.stations?.[stKey]?.employeeName || "";
    const dutyPin = assignments[stKey]?.dutyPin || defaultPins[stKey] || "1122";

    return `
      <div class="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-4 space-y-3.5 hover:border-orange-300 transition-all">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full ${assignedName ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-300'}"></span>
            <span class="font-black text-slate-900 text-sm">Station ${stKey}</span>
          </div>
          <span class="bg-orange-100 text-orange-900 text-[10px] font-bold px-2 py-0.5 rounded-full">${cfg.pump}</span>
        </div>
        <div class="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200">
          Nozzles: <strong>Petrol (${cfg.petrolCode})</strong> • <strong>Diesel (${cfg.dieselCode})</strong>
        </div>
        <div>
          <label class="text-[11px] font-bold text-slate-700 block mb-1">Assign Attendant (సిబ్బంది ఎంపిక):</label>
          <select id="rosterAssign-${stKey}" class="w-full bg-slate-50 border-2 border-slate-200 focus:border-orange-500 rounded-lg p-2 text-xs font-bold text-slate-900 focus:outline-none">
            <option value="">-- Choose Staff (ఎంపిక చేయండి) --</option>
            ${STATE.employees.map(e => `
              <option value="${e.name}" ${e.name === assignedName ? 'selected' : ''}>
                ${e.name} (${e.phone || 'Staff'})
              </option>
            `).join('')}
          </select>
        </div>

        <!-- Highlighted Station Duty Login PIN (Given to attendant by Management / Owner) -->
        <div class="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-xl border-2 border-amber-300 space-y-1.5 shadow-sm">
          <div class="flex items-center justify-between text-xs font-black text-amber-950">
            <span class="flex items-center gap-1">🔑 డ్యూటీ లాగిన్ పిన్ (Duty PIN):</span>
            <button onclick="generateRandomDutyPin('${stKey}')" type="button" class="text-[10px] text-amber-900 hover:text-black font-mono font-bold bg-amber-200 hover:bg-amber-300 px-2 py-0.5 rounded shadow-xs active:scale-95 transition-all">
              🔄 New PIN
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" maxlength="6" id="rosterPin-${stKey}" value="${dutyPin}" class="w-full bg-white border-2 border-amber-400 rounded-lg px-2.5 py-1.5 font-mono text-base font-black text-amber-950 tracking-widest text-center shadow-inner focus:outline-none focus:border-amber-600">
          </div>
          <p class="text-[10px] text-amber-900 font-semibold leading-tight">
            * సిబ్బంది లాగిన్: యూజర్‌నేమ్ + <strong>ఈ డ్యూటీ PIN (${dutyPin})</strong> మాత్రమే (పాస్‌వర్డ్ అవసరం లేదు)<br>
            (Staff logs in with Username + this Duty PIN only; no password needed)
          </p>
        </div>
      </div>
    `;
  }).join('');
}

function generateRandomDutyPin(stKey) {
  const pinInput = document.getElementById(`rosterPin-${stKey}`);
  if (pinInput) {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    pinInput.value = newPin;
  }
}

async function saveDutyRosterAssignments() {
  const assignments = {};
  const defaultPins = { S1: "1122", S2: "3344", S3: "5566", S4: "7788" };
  ['S1', 'S2', 'S3', 'S4'].forEach(stKey => {
    const empName = document.getElementById(`rosterAssign-${stKey}`)?.value || "";
    const dutyPin = document.getElementById(`rosterPin-${stKey}`)?.value || defaultPins[stKey] || "1122";
    assignments[stKey] = { employeeName: empName, dutyPin };
  });

  try {
    const res = await fetch(`/api/duty-assignments?pump=${STATE.activeTenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: STATE.selectedDate, assignments })
    });
    const result = await res.json();
    if (result.success) {
      showToast(STATE.lang === 'te' 
        ? 'పంపుల కేటాయింపు & డ్యూటీ పిన్‌లు సేవ్ చేయబడ్డాయి! సిబ్బందికి ఈ పిన్ ఇవ్వండి.' 
        : 'Pump assignments & Duty PINs saved! Share PIN with staff.');
      loadAllData();
    } else {
      showToast('Failed to save pump assignments', 'error');
    }
  } catch (err) {
    showToast('Failed to save pump assignments', 'error');
  }
}

// Live Pump Allocations Summary for Overview / Daily Sales Slip screen
function renderSummaryPumpAssignments() {
  const container = document.getElementById('summaryPumpAssignmentsContainer');
  if (!container) return;

  const assignments = STATE.dutyAssignments || {};
  const stations = ['S1', 'S2', 'S3', 'S4'];
  const defaultPins = { S1: "1122", S2: "3344", S3: "5566", S4: "7788" };

  container.innerHTML = stations.map(stKey => {
    const cfg = STATION_CONFIG[stKey];
    const assignedName = assignments[stKey]?.employeeName || STATE.shift?.stations?.[stKey]?.employeeName || "Unassigned";
    const dutyPin = assignments[stKey]?.dutyPin || defaultPins[stKey] || "1122";
    const isAssigned = assignedName && assignedName !== "Unassigned";

    return `
      <div class="bg-slate-50 border-2 ${isAssigned ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'} rounded-2xl p-3 space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full ${isAssigned ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-300'}"></span>
            <span class="font-black text-slate-900 text-xs sm:text-sm">Station ${stKey}</span>
          </div>
          <span class="text-[10px] font-bold bg-orange-100 text-orange-900 px-2 py-0.5 rounded-full">${cfg.pump}</span>
        </div>
        <div class="text-[11px] text-slate-600">
          Attendant: <strong class="text-slate-900 text-xs">${assignedName}</strong>
        </div>
        <div class="bg-amber-100/70 border border-amber-300 rounded-lg px-2 py-1 flex items-center justify-between text-[11px]">
          <span class="font-bold text-amber-900">Duty PIN:</span>
          <span class="font-mono font-black text-amber-950 text-xs tracking-wider">${dutyPin}</span>
        </div>
      </div>
    `;
  }).join('');
}

// --- ORACLE PDB / CLOUD ISOLATED DATABASE PROVISIONING ---
async function renderAdminPdbs() {
  const container = document.getElementById('pdbTenantsContainer');
  const banner = document.getElementById('cloudDbStatusBanner');
  if (!container) return;

  // Fetch current database provider info
  try {
    const res = await fetch('/api/database/status');
    const info = await res.json();
    if (banner) {
      const isCloud = info.isCloud;
      banner.innerHTML = `
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="inline-block w-2.5 h-2.5 rounded-full ${isCloud ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}"></span>
              <h4 class="font-black text-sm text-white">${isCloud ? '☁️ Cloud Database Active' : '📂 Local Storage Mode'}</h4>
              <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded ${isCloud ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' : 'bg-amber-950 text-amber-300 border border-amber-500/30'}">
                ${info.mode.toUpperCase()}
              </span>
            </div>
            <p class="text-xs text-slate-300 font-medium">${info.description}</p>
          </div>
          <div class="bg-slate-800/80 border border-slate-700 px-3 py-2 rounded-xl text-right">
            <div class="text-[10px] font-black text-slate-400 uppercase tracking-wide">Multi-Tenant Isolation</div>
            <div class="text-xs font-bold text-emerald-400">✓ 100% Separate Station DBs (Zero Relation)</div>
          </div>
        </div>
      `;
    }
  } catch (e) {
    console.warn('Failed to fetch DB status', e);
  }

  container.innerHTML = STATE.tenants.map(t => {
    const isActive = t.id === STATE.activeTenant;
    const dbIdentifier = t.schemaName
      ? `PostgreSQL Schema: ${t.schemaName}`
      : (t.dbName ? `MongoDB Database: ${t.dbName}` : `station_${t.id.replace(/-/g, '_')}`);

    return `
      <div class="bg-white rounded-2xl shadow-md border ${isActive ? 'border-2 border-orange-500 ring-2 ring-orange-200' : 'border-slate-200'} p-5 space-y-3 flex flex-col justify-between">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black uppercase text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">${t.brand}</span>
            ${isActive ? '<span class="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">ACTIVE DB</span>' : '<span class="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">INDEPENDENT</span>'}
          </div>
          <div>
            <h4 class="font-black text-slate-900 text-base">${t.name}</h4>
            <div class="mt-1 text-xs text-indigo-700 bg-indigo-50 font-mono px-2 py-1 rounded border border-indigo-100">
              🗄️ ${dbIdentifier}
            </div>
          </div>
          <div class="text-xs text-slate-600 flex items-center gap-1">
            <span>📍</span>
            <span>${t.location || 'Highway Station'}</span>
          </div>
          <div class="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-1 rounded">
            🔒 Isolated Data • No relation to other stations
          </div>
        </div>
        <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
          <span class="text-[10px] text-slate-400 font-mono">${t.id}</span>
          <button onclick="switchOilPumpTenant('${t.id}')" class="text-xs font-bold ${isActive ? 'bg-slate-200 text-slate-700 cursor-default' : 'bg-slate-900 text-white hover:bg-black'} px-3 py-1.5 rounded-lg shadow">
            ${isActive ? 'Currently Active' : 'Switch To This DB'}
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
