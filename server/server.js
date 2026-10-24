const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const storage = require('./storage');
const { calculateShiftSummary, formatIndianNumber } = require('./calculations');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Helper to extract tenant ID (PDB ID) from query, header, or default
function getTenantId(req) {
  return req.query.pump || req.headers['x-pdb-tenant'] || 'srr-filling-station';
}

// Helper to get today's date formatted YYYY-MM-DD
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get local network IPv4 address for Mobile App
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ----------------------------------------------------
// MULTI-TENANT PDB (PLUGGABLE DATABASE) API
// ----------------------------------------------------

// 1. List all Oil Pump Pluggable Databases
app.get('/api/tenants', (req, res) => {
  const tenants = storage.listTenants();
  res.json(tenants);
});

// 2. Provision a New Oil Pump Database (Instantly creates dedicated isolated DB)
app.post('/api/tenants', (req, res) => {
  const { name, brand, adminPin, location } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Oil Pump Name is required" });
  }

  try {
    const tenant = storage.createTenant(
      name.trim(),
      brand || "Indian Oil",
      adminPin || "1234",
      location || "Highway Station"
    );
    res.json({ success: true, tenant });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. System Info (Mobile App IP & Links)
app.get('/api/system-info', (req, res) => {
  const localIp = getLocalIpAddress();
  res.json({
    localIp,
    port: PORT,
    mobileAppUrl: `http://${localIp}:${PORT}`,
    activeTenant: getTenantId(req)
  });
});

// ----------------------------------------------------
// CORE PDB DATA API ROUTES (Isolated per Oil Pump)
// ----------------------------------------------------

// Station Config
app.get('/api/config', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  res.json({
    config: data.config,
    employees: data.employees,
    tanks: data.tanks,
    tenantId
  });
});

// Admin PIN verification (legacy helper)
app.post('/api/auth/verify-pin', (req, res) => {
  const tenantId = getTenantId(req);
  const { pin } = req.body;
  const data = storage.load(tenantId);
  const valid = pin === (data.config.adminPassword || data.config.adminPin || "1234");
  res.json({ success: valid, message: valid ? "Authenticated" : "Invalid Admin PIN" });
});

// Employee & Admin Authentication
app.post('/api/auth/login', (req, res) => {
  const tenantId = getTenantId(req);
  const { username, password, date } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username/Mobile and password are required" });
  }

  const data = storage.load(tenantId);
  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  // 1. Check Developer / Superadmin Login (Has PDB management)
  const devPass = data.config.developerPassword || data.config.devPassword || "1234";
  if ((cleanUser === "developer" || cleanUser === "dev") && cleanPass === devPass) {
    return res.json({
      success: true,
      role: 'developer',
      user: {
        id: 'developer',
        name: 'System Developer',
        username: 'developer',
        role: 'Developer'
      },
      canManagePdbs: true,
      canViewFinancials: true,
      isHistoricalAllowed: true
    });
  }

  // 2. Check Bunk Owner Login (Has Full Financial Reports & Historical Archives; NO PDBs)
  const ownerUser = (data.config.ownerUsername || "owner").toLowerCase();
  const ownerPass = data.config.ownerPassword || "1234";
  if (cleanUser === ownerUser && cleanPass === ownerPass) {
    return res.json({
      success: true,
      role: 'owner',
      user: {
        id: 'owner',
        name: 'Bunk Owner (యజమాని)',
        username: 'owner',
        role: 'Owner'
      },
      canManagePdbs: false,
      canViewFinancials: true,
      isHistoricalAllowed: true
    });
  }

  // 3. Check Bunk Management / Manager Login (Today's Operations Only; NO Historical Finance; NO PDBs)
  const mgmtUser = (data.config.mgmtUsername || "mgmt").toLowerCase();
  const mgmtPass = data.config.mgmtPassword || "1234";
  if ((cleanUser === mgmtUser || cleanUser === "manager") && cleanPass === mgmtPass) {
    return res.json({
      success: true,
      role: 'mgmt',
      user: {
        id: 'mgmt',
        name: 'Bunk Management (మేనేజ్‌మెంట్)',
        username: 'mgmt',
        role: 'Management'
      },
      canManagePdbs: false,
      canViewFinancials: false,
      isHistoricalAllowed: false
    });
  }

  // 4. Check Backward-Compatible Admin Login (Defaults to Developer with full access)
  const adminUser = (data.config.adminUsername || "admin").toLowerCase();
  const adminPass = data.config.adminPassword || data.config.adminPin || "1234";
  if (cleanUser === adminUser && cleanPass === adminPass) {
    return res.json({
      success: true,
      role: 'developer',
      user: {
        id: 'admin',
        name: 'Administrator (Developer)',
        username: 'admin',
        role: 'Developer'
      },
      canManagePdbs: true,
      canViewFinancials: true,
      isHistoricalAllowed: true
    });
  }

  // 5. Check Employee / Station Attendant Login (Duty Assignment Read-Only, Station Operations Only)
  // User can login with:
  // - First name (e.g., "Ramesh" for "Ramesh Kumar")
  // - Full name (case-insensitive)
  // - Username or Phone number
  // Password can be:
  // - Shift duty PIN generated by Mgmt/Admin for their assigned station
  // - Personal employee password
  // - Default fallback "1234"
  const targetDate = date || getTodayString();
  const assignments = data.shiftAssignments?.[targetDate] || data.shiftAssignments?.["2026-10-23"] || {};

  // Check matching in employees list
  const emp = (data.employees || []).find(e => {
    const fn = (e.name || '').trim().toLowerCase().split(/\s+/)[0];
    return fn === cleanUser ||
      (e.username && e.username.toLowerCase() === cleanUser) ||
      (e.phone && e.phone === cleanUser) ||
      (e.name && e.name.toLowerCase() === cleanUser);
  });

  // Determine assigned station & duty PIN
  let assignedStation = null;
  let stationDutyPin = null;

  for (const stKey of ['S1', 'S2', 'S3', 'S4']) {
    const asgn = assignments[stKey];
    if (asgn && asgn.employeeName) {
      const asgnFn = asgn.employeeName.trim().toLowerCase().split(/\s+/)[0];
      const asgnFull = asgn.employeeName.trim().toLowerCase();
      if ((emp && (asgn.employeeName === emp.name || asgn.employeeId === emp.id)) ||
          asgnFn === cleanUser ||
          asgnFull === cleanUser) {
        assignedStation = stKey;
        stationDutyPin = asgn.dutyPin;
        break;
      }
    }
  }

  // Fallback: check active shifts if assignments didn't match
  if (!assignedStation && data.shifts) {
    const shift = data.shifts.find(s => s.date === targetDate) || data.shifts[0];
    if (shift && shift.stations) {
      for (const stKey of ['S1', 'S2', 'S3', 'S4']) {
        const sEmp = shift.stations[stKey]?.employeeName;
        if (sEmp) {
          const sEmpFn = sEmp.trim().toLowerCase().split(/\s+/)[0];
          if ((emp && sEmp === emp.name) || sEmpFn === cleanUser || sEmp.toLowerCase() === cleanUser) {
            assignedStation = stKey;
            stationDutyPin = assignments[stKey]?.dutyPin;
            break;
          }
        }
      }
    }
  }

  // Validate password / PIN:
  // Matches dutyPin (generated by mgmt for the station) OR employee personal password OR default "1234"
  if (emp || assignedStation) {
    const empPass = emp ? (emp.password || "1234") : "1234";
    const isPinMatch = stationDutyPin && (cleanPass === String(stationDutyPin));
    const isPassMatch = cleanPass === empPass || cleanPass === "1234";

    if (isPinMatch || isPassMatch) {
      const empName = emp ? emp.name : (assignments[assignedStation]?.employeeName || username);
      return res.json({
        success: true,
        role: 'employee',
        user: {
          id: emp ? emp.id : `emp-${cleanUser}`,
          name: empName,
          username: emp?.username || cleanUser,
          phone: emp?.phone || "",
          role: emp?.role || 'Attendant'
        },
        assignedStation: assignedStation || 'S1',
        targetDate,
        dutyPin: stationDutyPin,
        canManagePdbs: false,
        canViewFinancials: false,
        isHistoricalAllowed: false
      });
    }
  }

  return res.status(401).json({ error: "Invalid username / First Name or Duty PIN / password" });
});

// Change Password for Employee, Mgmt, Owner, Developer or Admin
app.post('/api/auth/change-password', (req, res) => {
  const tenantId = getTenantId(req);
  const { role, userId, oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 3) {
    return res.status(400).json({ error: "Valid old and new password (min 3 chars) required" });
  }

  const data = storage.load(tenantId);

  // Owner Password Change
  if (role === 'owner' || userId === 'owner') {
    const currentPass = data.config.ownerPassword || "1234";
    if (oldPassword !== currentPass) {
      return res.status(400).json({ error: "Current Owner password is incorrect" });
    }
    data.config.ownerPassword = newPassword;
    storage.save(tenantId, data);
    return res.json({ success: true, message: "Owner password changed successfully" });
  }

  // Mgmt Password Change
  if (role === 'mgmt' || userId === 'mgmt' || userId === 'manager') {
    const currentPass = data.config.mgmtPassword || "1234";
    if (oldPassword !== currentPass) {
      return res.status(400).json({ error: "Current Management password is incorrect" });
    }
    data.config.mgmtPassword = newPassword;
    storage.save(tenantId, data);
    return res.json({ success: true, message: "Management password changed successfully" });
  }

  // Developer Password Change
  if (role === 'developer' || userId === 'developer' || userId === 'dev') {
    const currentPass = data.config.developerPassword || data.config.devPassword || "1234";
    if (oldPassword !== currentPass) {
      return res.status(400).json({ error: "Current Developer password is incorrect" });
    }
    data.config.developerPassword = newPassword;
    data.config.devPassword = newPassword;
    storage.save(tenantId, data);
    return res.json({ success: true, message: "Developer password changed successfully" });
  }

  // Admin Password Change
  if (role === 'admin' || userId === 'admin') {
    const currentPass = data.config.adminPassword || data.config.adminPin || "1234";
    if (oldPassword !== currentPass) {
      return res.status(400).json({ error: "Current Admin password is incorrect" });
    }
    data.config.adminPassword = newPassword;
    data.config.adminPin = newPassword;
    storage.save(tenantId, data);
    return res.json({ success: true, message: "Admin password changed successfully" });
  }

  // Employee Password Change
  const emp = (data.employees || []).find(e => e.id === userId || e.username === userId || e.phone === userId || e.name === userId);
  if (!emp) {
    return res.status(404).json({ error: "Employee account not found" });
  }

  const currentEmpPass = emp.password || "1234";
  if (oldPassword !== currentEmpPass) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  emp.password = newPassword;
  storage.save(tenantId, data);
  res.json({ success: true, message: `Password for ${emp.name} updated successfully` });
});

// Add Testing Litres entry for employee station (Deducts from employee sale)
app.post('/api/shifts/testing', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, stationId, fuelType, litres, reason } = req.body;
  if (!date || !stationId || !fuelType || !litres) {
    return res.status(400).json({ error: "Date, stationId, fuelType, and litres are required" });
  }

  const data = storage.load(tenantId);
  const shift = data.shifts.find(s => s.date === date);
  if (!shift || !shift.stations[stationId]) {
    return res.status(404).json({ error: "Shift or station record not found" });
  }

  const st = shift.stations[stationId];
  if (!st.testingRecords) st.testingRecords = [];

  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const entry = {
    id: `tst-${Date.now()}`,
    time: timeStr,
    fuelType,
    litres: Number(Number(litres).toFixed(2)),
    reason: (reason || "Daily calibration check poured back to tank").trim()
  };

  st.testingRecords.push(entry);

  // Recompute total testing litres per fuel type
  const pTesting = st.testingRecords
    .filter(t => t.fuelType === 'Petrol')
    .reduce((sum, t) => sum + t.litres, 0);
  const dTesting = st.testingRecords
    .filter(t => t.fuelType === 'Diesel')
    .reduce((sum, t) => sum + t.litres, 0);

  if (!st.meters.petrol) st.meters.petrol = {};
  if (!st.meters.diesel) st.meters.diesel = {};

  st.meters.petrol.testing = Number(pTesting.toFixed(2));
  st.meters.diesel.testing = Number(dTesting.toFixed(2));

  const pOpen = Number(st.meters.petrol.open || 0);
  const pClose = Number(st.meters.petrol.close || 0);
  if (pClose > pOpen) {
    st.meters.petrol.saleLitres = Number(Math.max(0, pClose - pOpen - st.meters.petrol.testing).toFixed(2));
  }

  const dOpen = Number(st.meters.diesel.open || 0);
  const dClose = Number(st.meters.diesel.close || 0);
  if (dClose > dOpen) {
    st.meters.diesel.saleLitres = Number(Math.max(0, dClose - dOpen - st.meters.diesel.testing).toFixed(2));
  }

  storage.save(tenantId, data);
  res.json({ success: true, entry, testingRecords: st.testingRecords, meters: st.meters });
});

// Delete Testing Litres entry
app.delete('/api/shifts/testing/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { date, stationId } = req.query;

  const data = storage.load(tenantId);
  const shift = data.shifts.find(s => s.date === date);
  if (!shift || !shift.stations[stationId]) {
    return res.status(404).json({ error: "Shift or station record not found" });
  }

  const st = shift.stations[stationId];
  if (!st.testingRecords) st.testingRecords = [];

  const idx = st.testingRecords.findIndex(t => t.id === id);
  if (idx !== -1) {
    st.testingRecords.splice(idx, 1);
  }

  const pTesting = st.testingRecords.filter(t => t.fuelType === 'Petrol').reduce((sum, t) => sum + t.litres, 0);
  const dTesting = st.testingRecords.filter(t => t.fuelType === 'Diesel').reduce((sum, t) => sum + t.litres, 0);

  st.meters.petrol.testing = Number(pTesting.toFixed(2));
  st.meters.diesel.testing = Number(dTesting.toFixed(2));

  const pOpen = Number(st.meters.petrol.open || 0);
  const pClose = Number(st.meters.petrol.close || 0);
  if (pClose > pOpen) {
    st.meters.petrol.saleLitres = Number(Math.max(0, pClose - pOpen - st.meters.petrol.testing).toFixed(2));
  }

  const dOpen = Number(st.meters.diesel.open || 0);
  const dClose = Number(st.meters.diesel.close || 0);
  if (dClose > dOpen) {
    st.meters.diesel.saleLitres = Number(Math.max(0, dClose - dOpen - st.meters.diesel.testing).toFixed(2));
  }

  storage.save(tenantId, data);
  res.json({ success: true, testingRecords: st.testingRecords, meters: st.meters });
});

// ----------------------------------------------------
// CARD SWIPE (POS) TRANSACTIONS WITH AUTO/EDITABLE DATE-TIME
// ----------------------------------------------------
app.post('/api/shifts/card-swipes', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, stationId, amount, machine, slipNo, dateTime } = req.body;
  if (!date || !stationId || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "Date, stationId, and valid amount are required" });
  }

  const data = storage.load(tenantId);
  const shift = data.shifts.find(s => s.date === date);
  if (!shift || !shift.stations[stationId]) {
    return res.status(404).json({ error: "Shift or station record not found" });
  }

  const st = shift.stations[stationId];
  if (!st.cardSwipes) st.cardSwipes = [];

  const timeStr = dateTime ? new Date(dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const entryDate = dateTime ? dateTime.split('T')[0] : (date || getTodayString());

  const entry = {
    id: `csw-${Date.now()}`,
    date: entryDate,
    dateTime: dateTime || new Date().toISOString(),
    time: timeStr,
    amount: Number(amount),
    machine: (machine || "IOCL POS").trim(),
    slipNo: (slipNo || "").trim()
  };

  st.cardSwipes.push(entry);

  if (!st.collections) st.collections = {};
  const totalCard = st.cardSwipes.reduce((sum, c) => sum + (c.amount || 0), 0);
  st.collections.card = totalCard;

  storage.save(tenantId, data);
  res.json({ success: true, entry, cardSwipes: st.cardSwipes, totalCard });
});

app.delete('/api/shifts/card-swipes/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { date, stationId } = req.query;

  const data = storage.load(tenantId);
  const shift = data.shifts.find(s => s.date === date);
  if (!shift || !shift.stations[stationId]) {
    return res.status(404).json({ error: "Shift or station record not found" });
  }

  const st = shift.stations[stationId];
  if (!st.cardSwipes) st.cardSwipes = [];

  const idx = st.cardSwipes.findIndex(c => c.id === id);
  if (idx !== -1) {
    st.cardSwipes.splice(idx, 1);
  }

  if (!st.collections) st.collections = {};
  const totalCard = st.cardSwipes.reduce((sum, c) => sum + (c.amount || 0), 0);
  st.collections.card = totalCard;

  storage.save(tenantId, data);
  res.json({ success: true, cardSwipes: st.cardSwipes, totalCard });
});

// ----------------------------------------------------
// SHIFT EXPENSES WITH AUTO-CALCULATION
// ----------------------------------------------------
app.post('/api/shifts/expenses', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, stationId, amount, reason, time } = req.body;
  if (!date || !stationId || !amount || Number(amount) <= 0 || !reason) {
    return res.status(400).json({ error: "Date, stationId, amount and expense reason are required" });
  }

  const data = storage.load(tenantId);
  const shift = data.shifts.find(s => s.date === date);
  if (!shift || !shift.stations[stationId]) {
    return res.status(404).json({ error: "Shift or station record not found" });
  }

  const st = shift.stations[stationId];
  if (!st.expensesList) st.expensesList = [];

  const timeStr = time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const entry = {
    id: `exp-${Date.now()}`,
    time: timeStr,
    amount: Number(amount),
    reason: reason.trim()
  };

  st.expensesList.push(entry);

  if (!st.collections) st.collections = {};
  const totalExpenses = st.expensesList.reduce((sum, e) => sum + (e.amount || 0), 0);
  st.collections.expenses = totalExpenses;
  st.collections.expenseReason = st.expensesList.map(e => `${e.reason} (₹${e.amount})`).join(', ');

  storage.save(tenantId, data);
  res.json({ success: true, entry, expensesList: st.expensesList, totalExpenses, expenseReason: st.collections.expenseReason });
});

app.delete('/api/shifts/expenses/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { date, stationId } = req.query;

  const data = storage.load(tenantId);
  const shift = data.shifts.find(s => s.date === date);
  if (!shift || !shift.stations[stationId]) {
    return res.status(404).json({ error: "Shift or station record not found" });
  }

  const st = shift.stations[stationId];
  if (!st.expensesList) st.expensesList = [];

  const idx = st.expensesList.findIndex(e => e.id === id);
  if (idx !== -1) {
    st.expensesList.splice(idx, 1);
  }

  if (!st.collections) st.collections = {};
  const totalExpenses = st.expensesList.reduce((sum, e) => sum + (e.amount || 0), 0);
  st.collections.expenses = totalExpenses;
  st.collections.expenseReason = st.expensesList.map(e => `${e.reason} (₹${e.amount})`).join(', ');

  storage.save(tenantId, data);
  res.json({ success: true, expensesList: st.expensesList, totalExpenses, expenseReason: st.collections.expenseReason });
});

// ----------------------------------------------------
// UPI / QR PAYMENTS API (PhonePe, GPay, Paytm Soundbox)
// User requirement: "also give a tab UPI on employee page"
// ----------------------------------------------------
app.post('/api/shifts/upi-payments', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, stationId, amount, app: upiApp, ref, time } = req.body;
  if (!date || !stationId || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "Date, stationId, and valid amount are required" });
  }

  const data = storage.load(tenantId);
  const shift = data.shifts.find(s => s.date === date);
  if (!shift || !shift.stations[stationId]) {
    return res.status(404).json({ error: "Shift or station record not found" });
  }

  const st = shift.stations[stationId];
  if (!st.upiPayments) st.upiPayments = [];

  const timeStr = time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const entry = {
    id: `upi-${Date.now()}`,
    time: timeStr,
    amount: Number(amount),
    app: (upiApp || "PhonePe").trim(),
    ref: (ref || "").trim()
  };

  st.upiPayments.push(entry);

  if (!st.collections) st.collections = {};
  const totalUpi = st.upiPayments.reduce((sum, u) => sum + (u.amount || 0), 0);
  st.collections.upi = totalUpi;

  storage.save(tenantId, data);
  res.json({ success: true, entry, upiPayments: st.upiPayments, totalUpi });
});

app.delete('/api/shifts/upi-payments/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { date, stationId } = req.query;

  const data = storage.load(tenantId);
  const shift = data.shifts.find(s => s.date === date);
  if (!shift || !shift.stations[stationId]) {
    return res.status(404).json({ error: "Shift or station record not found" });
  }

  const st = shift.stations[stationId];
  if (!st.upiPayments) st.upiPayments = [];

  const idx = st.upiPayments.findIndex(u => u.id === id);
  if (idx !== -1) {
    st.upiPayments.splice(idx, 1);
  }

  if (!st.collections) st.collections = {};
  const totalUpi = st.upiPayments.reduce((sum, u) => sum + (u.amount || 0), 0);
  st.collections.upi = totalUpi;

  storage.save(tenantId, data);
  res.json({ success: true, upiPayments: st.upiPayments, totalUpi });
});

// Fuel Rates
app.get('/api/rates', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  const today = req.query.date || getTodayString();
  const currentRate = data.rates.find(r => r.date === today) || data.rates[data.rates.length - 1] || {
    date: today,
    petrol: 117.07,
    diesel: 105.23
  };
  res.json({ rates: data.rates, currentRate });
});

app.post('/api/rates', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, petrol, diesel } = req.body;
  if (!date || !petrol || !diesel) {
    return res.status(400).json({ error: "Date, petrol and diesel rates are required" });
  }

  const data = storage.load(tenantId);
  const pRate = Number(Number(petrol).toFixed(2));
  const dRate = Number(Number(diesel).toFixed(2));

  const existingIdx = data.rates.findIndex(r => r.date === date);
  const record = { date, petrol: pRate, diesel: dRate, updatedAt: new Date().toISOString() };

  if (existingIdx >= 0) {
    data.rates[existingIdx] = record;
  } else {
    data.rates.push(record);
  }

  const shift = data.shifts.find(s => s.date === date);
  if (shift) {
    shift.petrolRate = pRate;
    shift.dieselRate = dRate;
  }

  storage.save(tenantId, data);
  res.json({ success: true, record });
});

// Duty Assignments (Admin Assigns Pump & Station with Duty Login PIN; Employee only has Read-Only view)
app.get('/api/duty-assignments', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  const date = req.query.date || getTodayString();
  const defaultPins = { S1: "1122", S2: "3344", S3: "5566", S4: "7788" };

  if (!data.shiftAssignments) data.shiftAssignments = {};
  if (!data.shiftAssignments[date]) {
    data.shiftAssignments[date] = {
      S1: { employeeName: "Ramesh Kumar", dutyPin: "1122" },
      S2: { employeeName: "Suresh Reddy", dutyPin: "3344" },
      S3: { employeeName: "Venkatesh Rao", dutyPin: "5566" },
      S4: { employeeName: "Naresh Babu", dutyPin: "7788" }
    };
    storage.save(tenantId, data);
  } else {
    let changed = false;
    ['S1', 'S2', 'S3', 'S4'].forEach(stKey => {
      if (!data.shiftAssignments[date][stKey]) {
        data.shiftAssignments[date][stKey] = { employeeName: "", dutyPin: defaultPins[stKey] };
        changed = true;
      } else if (!data.shiftAssignments[date][stKey].dutyPin) {
        data.shiftAssignments[date][stKey].dutyPin = defaultPins[stKey] || String(Math.floor(1000 + Math.random() * 9000));
        changed = true;
      }
    });
    if (changed) storage.save(tenantId, data);
  }

  res.json(data.shiftAssignments[date]);
});

app.post('/api/duty-assignments', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, assignments } = req.body;
  if (!date || !assignments) {
    return res.status(400).json({ error: "Date and assignments required" });
  }

  const data = storage.load(tenantId);
  if (!data.shiftAssignments) data.shiftAssignments = {};
  const defaultPins = { S1: "1122", S2: "3344", S3: "5566", S4: "7788" };

  ['S1', 'S2', 'S3', 'S4'].forEach(stKey => {
    if (assignments[stKey]) {
      if (!assignments[stKey].dutyPin) {
        assignments[stKey].dutyPin = data.shiftAssignments[date]?.[stKey]?.dutyPin || defaultPins[stKey] || String(Math.floor(1000 + Math.random() * 9000));
      }
    }
  });

  data.shiftAssignments[date] = assignments;

  // Also update shift stations employee names
  let shift = data.shifts.find(s => s.date === date);
  if (shift) {
    ['S1', 'S2', 'S3', 'S4'].forEach(stKey => {
      if (assignments[stKey]?.employeeName && shift.stations[stKey]) {
        shift.stations[stKey].employeeName = assignments[stKey].employeeName;
      }
    });
  }

  storage.save(tenantId, data);
  res.json({ success: true, assignments: data.shiftAssignments[date] });
});

// Shifts API
app.get('/api/shifts', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  res.json(data.shifts);
});

app.get('/api/shifts/active', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  const date = req.query.date || getTodayString();
  let shift = data.shifts.find(s => s.date === date);

  if (!shift) {
    const latestRate = data.rates.find(r => r.date === date) || data.rates[data.rates.length - 1] || { petrol: 117.07, diesel: 105.23 };
    const prevShift = data.shifts[data.shifts.length - 1];
    const assignments = data.shiftAssignments?.[date] || {};

    shift = {
      id: `shift-${date}`,
      date: date,
      status: "active",
      petrolRate: latestRate.petrol,
      dieselRate: latestRate.diesel,
      stations: {
        S1: {
          stationId: "S1",
          employeeName: assignments.S1?.employeeName || "",
          pump: "Pump 1",
          meters: {
            petrol: { code: "A1", open: prevShift?.stations?.S1?.meters?.petrol?.close || 0, close: 0, testing: 0, saleLitres: 0 },
            diesel: { code: "A2", open: prevShift?.stations?.S1?.meters?.diesel?.close || 0, close: 0, testing: 0, saleLitres: 0 }
          },
          collections: { cash: 0, upi: 0, card: 0, expenses: 0, expenseReason: "", notes: "" },
          status: "pending"
        },
        S2: {
          stationId: "S2",
          employeeName: assignments.S2?.employeeName || "",
          pump: "Pump 1",
          meters: {
            petrol: { code: "B1", open: prevShift?.stations?.S2?.meters?.petrol?.close || 0, close: 0, testing: 0, saleLitres: 0 },
            diesel: { code: "B2", open: prevShift?.stations?.S2?.meters?.diesel?.close || 0, close: 0, testing: 0, saleLitres: 0 }
          },
          collections: { cash: 0, upi: 0, card: 0, expenses: 0, expenseReason: "", notes: "" },
          status: "pending"
        },
        S3: {
          stationId: "S3",
          employeeName: assignments.S3?.employeeName || "",
          pump: "Pump 2",
          meters: {
            petrol: { code: "A1", open: prevShift?.stations?.S3?.meters?.petrol?.close || 0, close: 0, testing: 0, saleLitres: 0 },
            diesel: { code: "A2", open: prevShift?.stations?.S3?.meters?.diesel?.close || 0, close: 0, testing: 0, saleLitres: 0 }
          },
          collections: { cash: 0, upi: 0, card: 0, expenses: 0, expenseReason: "", notes: "" },
          status: "pending"
        },
        S4: {
          stationId: "S4",
          employeeName: assignments.S4?.employeeName || "",
          pump: "Pump 2",
          meters: {
            petrol: { code: "B1", open: prevShift?.stations?.S4?.meters?.petrol?.close || 0, close: 0, testing: 0, saleLitres: 0 },
            diesel: { code: "B2", open: prevShift?.stations?.S4?.meters?.diesel?.close || 0, close: 0, testing: 0, saleLitres: 0 }
          },
          collections: { cash: 0, upi: 0, card: 0, expenses: 0, expenseReason: "", notes: "" },
          status: "pending"
        }
      }
    };
    data.shifts.push(shift);
    storage.save(tenantId, data);
  }

  res.json(shift);
});

// Update Station Readings
app.post('/api/shifts/station-readings', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, stationId, employeeName, meters } = req.body;
  if (!date || !stationId || !meters) {
    return res.status(400).json({ error: "Missing required shift fields" });
  }

  const data = storage.load(tenantId);
  let shift = data.shifts.find(s => s.date === date);
  if (!shift) {
    return res.status(404).json({ error: "Shift not found for date " + date });
  }

  if (!shift.stations[stationId]) {
    shift.stations[stationId] = { stationId, meters: {}, collections: {} };
  }

  const st = shift.stations[stationId];
  if (employeeName) st.employeeName = employeeName;

  const pCode = stationId === 'S1' || stationId === 'S3' ? 'A1' : 'B1';
  const pOpen = Number(meters.petrol?.open || st.meters?.petrol?.open || 0);
  const pClose = Number(meters.petrol?.close || st.meters?.petrol?.close || 0);
  const pTesting = Number(meters.petrol?.testing || st.meters?.petrol?.testing || 0);
  const pSale = pClose > pOpen ? Number((pClose - pOpen - pTesting).toFixed(2)) : (meters.petrol?.saleLitres || 0);

  const dCode = stationId === 'S1' || stationId === 'S3' ? 'A2' : 'B2';
  const dOpen = Number(meters.diesel?.open || st.meters?.diesel?.open || 0);
  const dClose = Number(meters.diesel?.close || st.meters?.diesel?.close || 0);
  const dTesting = Number(meters.diesel?.testing || st.meters?.diesel?.testing || 0);
  const dSale = dClose > dOpen ? Number((dClose - dOpen - dTesting).toFixed(2)) : (meters.diesel?.saleLitres || 0);

  st.meters = {
    petrol: { code: pCode, open: pOpen, close: pClose, testing: pTesting, saleLitres: pSale },
    diesel: { code: dCode, open: dOpen, close: dClose, testing: dTesting, saleLitres: dSale }
  };

  if (pClose > 0 || dClose > 0) st.status = "readings-entered";

  storage.save(tenantId, data);
  res.json({ success: true, station: st });
});

// Shift Handover with Automated Shortage Tracking
// User requirement: "for example a employee will total sale 20000 thn he given 19000 means 1000 rupees will be the due will be marked on that employee name"
// "note :: what ever the amount related will be stored forever and can be viewd any time in admin page"
app.post('/api/shifts/station-handover', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, stationId, collections } = req.body;
  const data = storage.load(tenantId);
  const shift = data.shifts.find(s => s.date === date);
  if (!shift || !shift.stations[stationId]) {
    return res.status(404).json({ error: "Station shift record not found" });
  }

  const st = shift.stations[stationId];
  st.collections = {
    cash: Number(collections.cash || 0),
    upi: Number(collections.upi || 0),
    card: Number(collections.card || 0),
    expenses: Number(collections.expenses || 0),
    expenseReason: collections.expenseReason || "",
    notes: collections.notes || ""
  };
  st.status = "submitted";

  // Calculate gross sale for this station
  const petrolRate = shift.petrolRate || (data.rates?.[data.rates.length - 1]?.petrol) || 117.07;
  const dieselRate = shift.dieselRate || (data.rates?.[data.rates.length - 1]?.diesel) || 105.23;

  const pOpen = Number(st.meters?.petrol?.open || 0);
  const pClose = Number(st.meters?.petrol?.close || 0);
  const pTesting = Number(st.meters?.petrol?.testing || 0);
  const pSale = pClose > pOpen ? Number((pClose - pOpen - pTesting).toFixed(2)) : (st.meters?.petrol?.saleLitres || 0);

  const dOpen = Number(st.meters?.diesel?.open || 0);
  const dClose = Number(st.meters?.diesel?.close || 0);
  const dTesting = Number(st.meters?.diesel?.testing || 0);
  const dSale = dClose > dOpen ? Number((dClose - dOpen - dTesting).toFixed(2)) : (st.meters?.diesel?.saleLitres || 0);

  const grossSale = Math.round((pSale * petrolRate) + (dSale * dieselRate));

  // Deductions: Reminders, Vehicle fleet on account, Card Swipes, UPI payments, Expenses
  const remindersSum = (data.reminders || [])
    .filter(r => r.date === date && r.stationId === stationId && r.status === 'pending')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const fleetList = data.vehicleLedger || data.fleetTransactions || [];
  const fleetSum = fleetList
    .filter(f => f.date === date && f.stationId === stationId)
    .reduce((sum, f) => sum + (Number(f.amount || f.totalAmount) || 0), 0);

  const cardSum = Number(st.collections.card || 0);
  const upiSum = Number(st.collections.upi || 0);
  const expensesSum = Number(st.collections.expenses || 0);

  const totalDeductions = Math.round(remindersSum + fleetSum + cardSum + upiSum + expensesSum);
  const expectedCash = Math.max(0, grossSale - totalDeductions);
  const actualCash = Math.round(st.collections.cash || 0);
  const shortage = Math.max(0, expectedCash - actualCash);

  st.grossSale = grossSale;
  st.totalDeductions = totalDeductions;
  st.expectedCash = expectedCash;
  st.shortage = shortage;

  if (!data.employeeDues) data.employeeDues = [];

  const existingDueIdx = data.employeeDues.findIndex(d => d.date === date && d.stationId === stationId);

  if (shortage > 0) {
    const dueRecord = {
      id: existingDueIdx >= 0 ? data.employeeDues[existingDueIdx].id : `due-${Date.now()}`,
      date,
      stationId,
      employeeName: st.employeeName || "Attendant",
      grossAmount: grossSale,
      totalDeductions,
      expectedCash,
      actualCash,
      shortageAmount: shortage,
      status: existingDueIdx >= 0 ? data.employeeDues[existingDueIdx].status : "pending",
      notes: collections.notes || `Shift handover shortage: expected ₹${expectedCash}, given ₹${actualCash}`,
      createdAt: existingDueIdx >= 0 ? data.employeeDues[existingDueIdx].createdAt : new Date().toISOString(),
      settledAt: existingDueIdx >= 0 ? data.employeeDues[existingDueIdx].settledAt : null,
      settledMode: existingDueIdx >= 0 ? data.employeeDues[existingDueIdx].settledMode : null,
      settledNotes: existingDueIdx >= 0 ? data.employeeDues[existingDueIdx].settledNotes : null
    };

    if (existingDueIdx >= 0) {
      data.employeeDues[existingDueIdx] = dueRecord;
    } else {
      data.employeeDues.unshift(dueRecord);
    }
  } else if (existingDueIdx >= 0 && data.employeeDues[existingDueIdx].status === 'pending') {
    // If shortage was rectified to 0, clear pending due
    data.employeeDues.splice(existingDueIdx, 1);
  }

  storage.save(tenantId, data);
  res.json({ success: true, station: shift.stations[stationId], shortage, expectedCash, actualCash });
});

// ----------------------------------------------------
// EMPLOYEE DUES & SHORTAGE TRACKING API (PERMANENT AUDIT)
// User requirement: "what ever the amount related will be stored forever and can be viewd any time in admin page"
// ----------------------------------------------------
app.get('/api/employee-dues', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  const dues = data.employeeDues || [];

  const totalOutstanding = dues
    .filter(d => d.status === 'pending' || d.status === 'unsettled')
    .reduce((sum, d) => sum + (d.shortageAmount || 0), 0);

  const totalSettled = dues
    .filter(d => d.status === 'settled')
    .reduce((sum, d) => sum + (d.shortageAmount || 0), 0);

  const totalShortages = dues.reduce((sum, d) => sum + (d.shortageAmount || 0), 0);
  const pendingCount = dues.filter(d => d.status === 'pending' || d.status === 'unsettled').length;
  const settledCount = dues.filter(d => d.status === 'settled').length;

  res.json({
    dues,
    metrics: {
      totalOutstanding,
      totalSettled,
      totalShortages,
      pendingCount,
      settledCount
    }
  });
});

app.post('/api/employee-dues/:id/settle', (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { settledMode, settledNotes } = req.body;
  const data = storage.load(tenantId);

  const due = (data.employeeDues || []).find(d => d.id === id);
  if (!due) {
    return res.status(404).json({ error: "Due record not found" });
  }

  due.status = 'settled';
  due.settledAt = new Date().toISOString();
  due.settledMode = settledMode || "Cash Recovery";
  due.settledNotes = settledNotes || "";

  storage.save(tenantId, data);
  res.json({ success: true, due });
});

app.post('/api/employee-dues', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, stationId, employeeName, expectedCash, actualCash, shortageAmount, notes } = req.body;
  if (!employeeName || !shortageAmount || Number(shortageAmount) <= 0) {
    return res.status(400).json({ error: "Employee name and valid shortage amount are required" });
  }

  const data = storage.load(tenantId);
  if (!data.employeeDues) data.employeeDues = [];

  const dueRecord = {
    id: `due-${Date.now()}`,
    date: date || getTodayString(),
    stationId: stationId || "S1",
    employeeName: employeeName.trim(),
    grossAmount: Number(expectedCash || shortageAmount),
    totalDeductions: 0,
    expectedCash: Number(expectedCash || shortageAmount),
    actualCash: Number(actualCash || 0),
    shortageAmount: Number(shortageAmount),
    status: "pending",
    notes: (notes || "Manual due entry").trim(),
    createdAt: new Date().toISOString(),
    settledAt: null,
    settledMode: null,
    settledNotes: null
  };

  data.employeeDues.unshift(dueRecord);
  storage.save(tenantId, data);
  res.json({ success: true, due: dueRecord });
});

// ----------------------------------------------------
// AMOUNT REMINDERS API ("తాత్కాలిక బకాయి రిమైండర్" - NOT CREDIT)
// ----------------------------------------------------
app.get('/api/reminders', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  const { date, stationId, status } = req.query;
  let list = [...(data.reminders || [])];

  if (date) list = list.filter(r => r.date === date);
  if (stationId) list = list.filter(r => r.stationId === stationId);
  if (status) list = list.filter(r => r.status === status);

  list.sort((a, b) => b.id.localeCompare(a.id));
  res.json(list);
});

app.post('/api/reminders', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, stationId, employeeName, customerName, vehicleNumber, phone, fuelType, amount, notes } = req.body;
  if (!customerName || !amount) {
    return res.status(400).json({ error: "Customer name and amount are required" });
  }

  const data = storage.load(tenantId);
  if (!data.reminders) data.reminders = [];

  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const reminder = {
    id: `rem-${Date.now()}`,
    date: date || getTodayString(),
    time: timeStr,
    stationId: stationId || "S1",
    employeeName: employeeName || "Attendant",
    customerName: customerName.trim(),
    vehicleNumber: (vehicleNumber || "").trim().toUpperCase(),
    phone: (phone || "").trim(),
    fuelType: fuelType || "Diesel",
    amount: Number(amount),
    notes: (notes || "").trim(),
    status: "pending",
    clearedAt: null,
    clearedMode: null
  };

  data.reminders.push(reminder);
  storage.save(tenantId, data);
  res.json({ success: true, reminder });
});

app.patch('/api/reminders/:id/clear', (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { clearedMode } = req.body;
  const data = storage.load(tenantId);

  const reminder = data.reminders?.find(r => r.id === id);
  if (!reminder) {
    return res.status(404).json({ error: "Reminder not found" });
  }

  reminder.status = "cleared";
  reminder.clearedAt = new Date().toISOString();
  reminder.clearedMode = clearedMode || "Cash";

  storage.save(tenantId, data);
  res.json({ success: true, reminder });
});

// ----------------------------------------------------
// VEHICLE ACCOUNT / FLEET LEDGER API ("GIVE OIL AND LATER DAYS CALCULATE SUM")
// Employee only sees active shift entries; Historical aggregated data is restricted to Admin
// ----------------------------------------------------
app.get('/api/vehicle-ledger', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  const { shiftDate, vehicleNumber } = req.query;
  let ledger = [...(data.vehicleLedger || [])];

  // If shiftDate is passed (Employee View), STRICTLY return only entries from that current shift!
  if (shiftDate) {
    ledger = ledger.filter(item => item.date === shiftDate);
  }

  if (vehicleNumber) {
    ledger = ledger.filter(item => item.vehicleNumber.toLowerCase().includes(vehicleNumber.toLowerCase()));
  }

  ledger.sort((a, b) => b.id.localeCompare(a.id));
  res.json(ledger);
});

// Log fuel dispensed to vehicle
app.post('/api/vehicle-ledger', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, stationId, employeeName, vehicleNumber, driverName, driverPhone, mobileNumber, fuelType, litres, rate, amount, slipNo, notes } = req.body;

  if (!vehicleNumber || !amount) {
    return res.status(400).json({ error: "Vehicle number and amount are required" });
  }

  const phone = (mobileNumber || driverPhone || "").trim();
  if (!phone || !/^[0-9]{10}$/.test(phone)) {
    return res.status(400).json({ error: "Valid 10-digit mobile number is required (10 numbers rule)" });
  }

  const data = storage.load(tenantId);
  if (!data.vehicleLedger) data.vehicleLedger = [];

  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const entry = {
    id: `vlog-${Date.now()}`,
    date: date || getTodayString(),
    time: timeStr,
    stationId: stationId || "S1",
    employeeName: employeeName || "Attendant",
    vehicleNumber: vehicleNumber.trim().toUpperCase(),
    driverName: (driverName || "").trim(),
    driverPhone: phone,
    mobileNumber: phone,
    fuelType: fuelType || "Diesel",
    litres: litres ? Number(Number(litres).toFixed(2)) : 0,
    rate: rate ? Number(Number(rate).toFixed(2)) : 0,
    amount: Number(amount),
    slipNo: (slipNo || "").trim(),
    notes: (notes || "").trim(),
    status: "unsettled"
  };

  data.vehicleLedger.push(entry);
  storage.save(tenantId, data);
  res.json({ success: true, entry });
});

// Admin Vehicle Aggregated Statement / Sum calculation
app.get('/api/vehicle-ledger/summary/:vehicleNumber', (req, res) => {
  const tenantId = getTenantId(req);
  const { vehicleNumber } = req.params;
  const data = storage.load(tenantId);

  const cleanVNo = vehicleNumber.trim().toUpperCase();
  const entries = (data.vehicleLedger || []).filter(e => e.vehicleNumber === cleanVNo);

  const totalLitres = entries.reduce((sum, e) => sum + (e.litres || 0), 0);
  const totalAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const unsettledLitres = entries.filter(e => e.status === 'unsettled').reduce((sum, e) => sum + (e.litres || 0), 0);
  const unsettledAmount = entries.filter(e => e.status === 'unsettled').reduce((sum, e) => sum + (e.amount || 0), 0);

  res.json({
    vehicleNumber: cleanVNo,
    totalTrips: entries.length,
    totalLitres: Number(totalLitres.toFixed(2)),
    totalAmount: Math.round(totalAmount),
    unsettledLitres: Number(unsettledLitres.toFixed(2)),
    unsettledAmount: Math.round(unsettledAmount),
    formattedTotalAmount: formatIndianNumber(totalAmount),
    formattedUnsettledAmount: formatIndianNumber(unsettledAmount),
    entries
  });
});

// Admin Settle Vehicle Ledger
app.post('/api/vehicle-ledger/settle', (req, res) => {
  const tenantId = getTenantId(req);
  const { vehicleNumber, paymentMode, settlementRef, settledAmount } = req.body;
  const data = storage.load(tenantId);

  const cleanVNo = vehicleNumber.trim().toUpperCase();
  let settledCount = 0;

  (data.vehicleLedger || []).forEach(e => {
    if (e.vehicleNumber === cleanVNo && e.status === 'unsettled') {
      e.status = 'settled';
      e.settledDate = getTodayString();
      e.paymentMode = paymentMode || 'Cash';
      e.settlementRef = settlementRef || '';
      settledCount++;
    }
  });

  storage.save(tenantId, data);
  res.json({ success: true, settledCount, message: `Settled ${settledCount} entries for vehicle ${cleanVNo}` });
});

// ----------------------------------------------------
// DAILY SUMMARY & OFFICIAL SLIP (Bilingual Support: Telugu / English)
// ----------------------------------------------------
app.get('/api/daily-summary', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  const targetDate = req.query.date || "2026-10-23";
  const lang = req.query.lang || "te";

  let shift = data.shifts.find(s => s.date === targetDate);

  if (!shift) {
    const rate = data.rates.find(r => r.date === targetDate) || { petrol: 117.07, diesel: 105.23 };
    shift = { date: targetDate, petrolRate: rate.petrol, dieselRate: rate.diesel, stations: {} };
  }

  const rate = data.rates.find(r => r.date === targetDate) || { petrol: 117.07, diesel: 105.23 };
  const summary = calculateShiftSummary(shift, rate);

  // Set slipText based on selected language
  if (lang === 'en') {
    summary.slipText = summary.slipTextEn;
  } else {
    summary.slipText = summary.slipTextTe;
  }

  // Attach pending reminders
  const dayReminders = (data.reminders || []).filter(r => r.date === targetDate);
  const totalPendingAmount = dayReminders
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  summary.dayReminders = dayReminders;
  summary.totalPendingAmount = totalPendingAmount;
  summary.pendingRemindersCount = dayReminders.filter(r => r.status === 'pending').length;

  res.json(summary);
});

// ----------------------------------------------------
// BUNK OWNER FINANCIAL REPORTS & HISTORICAL ARCHIVE
// User Requirement: "Note : mgmt user will not be allowed to see the historical finance/sale/ whatever the old cannot viewed where as only owner can see it"
// ----------------------------------------------------
app.get('/api/financial-reports', (req, res) => {
  const tenantId = getTenantId(req);
  const userRole = req.headers['x-user-role'] || req.query.role;
  if (userRole === 'mgmt') {
    return res.status(403).json({ error: "Access Denied: Historical financial reports are restricted to Bunk Owner only." });
  }

  const data = storage.load(tenantId);
  const shifts = data.shifts || [];

  const history = shifts.map(s => {
    const rate = data.rates.find(r => r.date === s.date) || data.rates[data.rates.length - 1] || { petrol: 117.07, diesel: 105.23 };
    const summ = calculateShiftSummary(s, rate);
    return {
      date: s.date,
      dateFormatted: summ.dateFormatted,
      petrolLitres: summ.petrol.litres,
      petrolAmount: summ.petrol.amount,
      dieselLitres: summ.diesel.litres,
      dieselAmount: summ.diesel.amount,
      grandTotalAmount: summ.grandTotal.amount,
      cash: summ.reconciliation.totalCash,
      upi: summ.reconciliation.totalUpi,
      card: summ.reconciliation.totalCard,
      expenses: summ.reconciliation.totalExpenses,
      slipTextTe: summ.slipTextTe,
      slipTextEn: summ.slipTextEn
    };
  });

  const totalAccumulatedSales = history.reduce((sum, h) => sum + h.grandTotalAmount, 0);
  const totalPetrolLitres = Number(history.reduce((sum, h) => sum + h.petrolLitres, 0).toFixed(2));
  const totalDieselLitres = Number(history.reduce((sum, h) => sum + h.dieselLitres, 0).toFixed(2));
  const totalPetrolAmount = history.reduce((sum, h) => sum + h.petrolAmount, 0);
  const totalDieselAmount = history.reduce((sum, h) => sum + h.dieselAmount, 0);
  const totalCash = history.reduce((sum, h) => sum + h.cash, 0);
  const totalUpi = history.reduce((sum, h) => sum + h.upi, 0);
  const totalCard = history.reduce((sum, h) => sum + h.card, 0);
  const totalExpenses = history.reduce((sum, h) => sum + h.expenses, 0);

  const vehicleLedger = data.vehicleLedger || [];
  const unsettledFleetDues = vehicleLedger.filter(v => v.status !== 'settled').reduce((sum, v) => sum + (v.amount || 0), 0);
  const unsettledFleetLitres = Number(vehicleLedger.filter(v => v.status !== 'settled').reduce((sum, v) => sum + (v.litres || 0), 0).toFixed(2));

  res.json({
    history,
    metrics: {
      totalShifts: history.length,
      totalAccumulatedSales,
      totalPetrolLitres,
      totalDieselLitres,
      totalPetrolAmount,
      totalDieselAmount,
      totalCash,
      totalUpi,
      totalCard,
      totalExpenses,
      unsettledFleetDues,
      unsettledFleetLitres
    }
  });
});

// ----------------------------------------------------
// EXTENDED EMPLOYEE MANAGEMENT (KYC: Village, Father Name, Aadhaar, Emergency Contact)
// ----------------------------------------------------
app.get('/api/employees', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  res.json(data.employees || []);
});

app.post('/api/employees', (req, res) => {
  const tenantId = getTenantId(req);
  const { name, phone, fatherName, villageName, aadhaarNumber, emergencyContact, address, role, username, password } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Employee name is required" });
  }

  const data = storage.load(tenantId);
  if (!data.employees) data.employees = [];

  const cleanPhone = (phone || "").trim();
  const cleanName = name.trim();
  const cleanUsername = (username || cleanPhone || cleanName.toLowerCase().replace(/\s+/g, '')).trim();

  const newEmp = {
    id: `emp-${Date.now()}`,
    name: cleanName,
    username: cleanUsername,
    password: (password || "1234").trim(),
    phone: cleanPhone,
    fatherName: (fatherName || "").trim(),
    villageName: (villageName || "").trim(),
    aadhaarNumber: (aadhaarNumber || "").trim(),
    emergencyContact: (emergencyContact || "").trim(),
    address: (address || "").trim(),
    role: role || "Attendant",
    joiningDate: getTodayString(),
    active: true
  };

  data.employees.push(newEmp);
  storage.save(tenantId, data);
  res.json({ success: true, employee: newEmp });
});

app.delete('/api/employees/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const data = storage.load(tenantId);

  const idx = data.employees?.findIndex(e => e.id === id);
  if (idx === -1 || idx === undefined) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const removed = data.employees.splice(idx, 1)[0];
  storage.save(tenantId, data);
  res.json({ success: true, removed });
});

// ----------------------------------------------------
// TANK STOCK & INWARD DELIVERIES
// ----------------------------------------------------
app.get('/api/tanks', (req, res) => {
  const tenantId = getTenantId(req);
  const data = storage.load(tenantId);
  res.json(data.tanks || []);
});

app.put('/api/tanks/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { currentStock, dipCm, capacity } = req.body;
  const data = storage.load(tenantId);
  const tank = data.tanks?.find(t => t.id === id);
  if (!tank) return res.status(404).json({ error: "Tank not found" });

  if (currentStock !== undefined) tank.currentStock = Number(currentStock);
  if (dipCm !== undefined) tank.dipCm = Number(dipCm);
  if (capacity !== undefined) tank.capacity = Number(capacity);

  storage.save(tenantId, data);
  res.json({ success: true, tank });
});

app.post('/api/tanks/:id/delivery', (req, res) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { deliveryLitres, invoiceNo, tankerNo } = req.body;
  const data = storage.load(tenantId);
  const tank = data.tanks?.find(t => t.id === id);
  if (!tank) return res.status(404).json({ error: "Tank not found" });

  const addedLitres = Number(deliveryLitres || 0);
  tank.currentStock = Number((tank.currentStock + addedLitres).toFixed(2));
  
  if (!tank.deliveries) tank.deliveries = [];
  tank.deliveries.unshift({
    id: `del-${Date.now()}`,
    date: getTodayString(),
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    deliveryLitres: addedLitres,
    invoiceNo: invoiceNo || "",
    tankerNo: tankerNo || "",
    newStock: tank.currentStock
  });

  storage.save(tenantId, data);
  res.json({ success: true, tank });
});

// Fallback to SPA index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`SRR Filling Station Multi-Tenant PDB Server running!`);
  console.log(`Local Browser: http://localhost:${PORT}`);
  console.log(`Mobile App LAN: http://${localIp}:${PORT}`);
});
