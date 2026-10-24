const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PDB_DIR = path.join(DATA_DIR, 'pdb');
const CATALOG_FILE = path.join(DATA_DIR, 'pdb_catalog.json');

// Helper to generate slug
function slugify(text) {
  return text.toString().toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

// Initial template for a brand new Oil Pump Pluggable Database (PDB)
function createPdbTemplate(stationName, brand = "Indian Oil", adminPin = "123", location = "Highway Bunk") {
  return {
    config: {
      stationId: slugify(stationName),
      stationName: stationName.toUpperCase(),
      brand: brand,
      oilCompany: brand === "Indian Oil" ? "Indian Oil Corporation Ltd. (IOCL)" : (brand === "Bharat Petroleum" ? "Bharat Petroleum Corporation Ltd. (BPCL)" : brand),
      location: location,
      adminPin: adminPin,
      adminUsername: "admin",
      adminPassword: "123",
      mgmtUsername: "mgmt",
      mgmtPassword: "123",
      ownerUsername: "owner",
      ownerPassword: "123",
      developerPassword: "123",
      pumps: [
        {
          id: "Pump1",
          name: "Pump 1",
          stations: [
            {
              id: "S1",
              name: "Side 1 (S1)",
              pump: "Pump 1",
              nozzles: [
                { fuel: "Petrol", code: "A1", label: "Petrol (A1)" },
                { fuel: "Diesel", code: "A2", label: "Diesel (A2)" }
              ]
            },
            {
              id: "S2",
              name: "Side 2 (S2)",
              pump: "Pump 1",
              nozzles: [
                { fuel: "Petrol", code: "B1", label: "Petrol (B1)" },
                { fuel: "Diesel", code: "B2", label: "Diesel (B2)" }
              ]
            }
          ]
        },
        {
          id: "Pump2",
          name: "Pump 2",
          stations: [
            {
              id: "S3",
              name: "Side 3 (S3)",
              pump: "Pump 2",
              nozzles: [
                { fuel: "Petrol", code: "A1", label: "Petrol (A1)" },
                { fuel: "Diesel", code: "A2", label: "Diesel (A2)" }
              ]
            },
            {
              id: "S4",
              name: "Side 4 (S4)",
              pump: "Pump 2",
              nozzles: [
                { fuel: "Petrol", code: "B1", label: "Petrol (B1)" },
                { fuel: "Diesel", code: "B2", label: "Diesel (B2)" }
              ]
            }
          ]
        }
      ]
    },
    rates: [
      {
        date: "2026-10-23",
        petrol: 117.07,
        diesel: 105.23,
        updatedAt: "2026-10-23T08:30:00.000Z"
      },
      {
        date: "2026-10-24",
        petrol: 117.07,
        diesel: 105.23,
        updatedAt: "2026-10-24T08:30:00.000Z"
      }
    ],
    // Extended Employee model with Village, Father Name, Aadhaar, Emergency contact
    employees: [
      {
        id: "emp1",
        name: "Ramesh Kumar",
        phone: "9848011223",
        fatherName: "K. Narayana Swamy",
        villageName: "Kalyandurg, Anantapur Dist",
        aadhaarNumber: "4589 1234 5678",
        emergencyContact: "9440123999 (Brother - Siva)",
        address: "Plot 14, Near IOCL Bunk, Main Road",
        role: "Attendant",
        joiningDate: "2024-01-10",
        active: true
      },
      {
        id: "emp2",
        name: "Suresh Reddy",
        phone: "9848022334",
        fatherName: "M. Ramachandra Reddy",
        villageName: "Beluguppa Village",
        aadhaarNumber: "6712 3456 7890",
        emergencyContact: "9848088771 (Wife - Lakshmi)",
        address: "Door 2-45, Brahmin Street, Beluguppa",
        role: "Attendant",
        joiningDate: "2024-03-15",
        active: true
      },
      {
        id: "emp3",
        name: "Venkatesh Rao",
        phone: "9848033445",
        fatherName: "G. Venkateswarlu",
        villageName: "Rayadurg Mandal",
        aadhaarNumber: "8899 4321 0987",
        emergencyContact: "9441122334 (Father)",
        address: "H.No 4-89, Near Old Bus Stand, Rayadurg",
        role: "Attendant",
        joiningDate: "2024-05-20",
        active: true
      },
      {
        id: "emp4",
        name: "Naresh Babu",
        phone: "9848044556",
        fatherName: "B. Venkataramana",
        villageName: "Atmakur Village",
        aadhaarNumber: "3344 5566 7788",
        emergencyContact: "9988112233 (Uncle - Prasad)",
        address: "3-12, Atmakur",
        role: "Attendant",
        joiningDate: "2024-08-01",
        active: true
      },
      {
        id: "emp5",
        name: "Rajesh Varma",
        phone: "9848055667",
        fatherName: "D. Satyanarayana",
        villageName: "Dharmavaram",
        aadhaarNumber: "9988 7766 5544",
        emergencyContact: "9701122334 (Brother)",
        address: "5-67, Weaver Colony, Dharmavaram",
        role: "Attendant",
        joiningDate: "2025-01-05",
        active: true
      },
      {
        id: "emp6",
        name: "Prasad Rao",
        phone: "9848066778",
        fatherName: "P. Subba Rao",
        villageName: "Guntakal",
        aadhaarNumber: "2233 4455 6677",
        emergencyContact: "9866112244 (Father)",
        address: "Railway Station Road, Guntakal",
        role: "Attendant",
        joiningDate: "2025-03-12",
        active: true
      }
    ],
    // Shift duty assignments (Admin assigns pump, employee has read-only access)
    shiftAssignments: {
      "2026-10-23": {
        S1: { employeeId: "emp1", employeeName: "Ramesh Kumar" },
        S2: { employeeId: "emp2", employeeName: "Suresh Reddy" },
        S3: { employeeId: "emp3", employeeName: "Venkatesh Rao" },
        S4: { employeeId: "emp4", employeeName: "Naresh Babu" }
      },
      "2026-10-24": {
        S1: { employeeId: "emp5", employeeName: "Rajesh Varma" },
        S2: { employeeId: "emp6", employeeName: "Prasad Rao" },
        S3: { employeeId: "emp1", employeeName: "Ramesh Kumar" },
        S4: { employeeId: "emp2", employeeName: "Suresh Reddy" }
      }
    },
    shifts: [
      {
        id: "shift-2026-10-23",
        date: "2026-10-23", // 9 AM 23-10-2026 to 9 AM 24-10-2026
        status: "completed",
        petrolRate: 117.07,
        dieselRate: 105.23,
        stations: {
          S1: {
            stationId: "S1",
            employeeName: "Ramesh Kumar",
            pump: "Pump 1",
            meters: {
              petrol: { code: "A1", open: 120500.20, close: 121300.10, testing: 5.0, saleLitres: 794.90 },
              diesel: { code: "A2", open: 245000.50, close: 245710.20, testing: 5.0, saleLitres: 704.70 }
            },
            collections: { cash: 121000, upi: 38000, card: 5000, expenses: 300, expenseReason: "Tea and maintenance", notes: "" },
            status: "submitted",
            submittedAt: "2026-10-24T09:05:00.000Z"
          },
          S2: {
            stationId: "S2",
            employeeName: "Suresh Reddy",
            pump: "Pump 1",
            meters: {
              petrol: { code: "B1", open: 98400.10, close: 99150.30, testing: 5.0, saleLitres: 745.20 },
              diesel: { code: "B2", open: 187200.00, close: 187880.50, testing: 5.0, saleLitres: 675.50 }
            },
            collections: { cash: 112000, upi: 39000, card: 6000, expenses: 250, expenseReason: "Receipt paper", notes: "" },
            status: "submitted",
            submittedAt: "2026-10-24T09:08:00.000Z"
          },
          S3: {
            stationId: "S3",
            employeeName: "Venkatesh Rao",
            pump: "Pump 2",
            meters: {
              petrol: { code: "A1", open: 310200.00, close: 310955.41, testing: 5.0, saleLitres: 750.41 },
              diesel: { code: "A2", open: 412500.10, close: 413165.69, testing: 5.0, saleLitres: 660.59 }
            },
            collections: { cash: 118000, upi: 32000, card: 4500, expenses: 200, expenseReason: "Water cans", notes: "" },
            status: "submitted",
            submittedAt: "2026-10-24T09:12:00.000Z"
          },
          S4: {
            stationId: "S4",
            employeeName: "Naresh Babu",
            pump: "Pump 2",
            meters: {
              petrol: { code: "B1", open: 154100.00, close: 154854.00, testing: 5.0, saleLitres: 749.00 },
              diesel: { code: "B2", open: 221300.00, close: 221978.00, testing: 5.0, saleLitres: 673.00 }
            },
            collections: { cash: 115000, upi: 37500, card: 5500, expenses: 150, expenseReason: "Nozzle tip", notes: "" },
            status: "submitted",
            submittedAt: "2026-10-24T09:15:00.000Z"
          }
        }
      },
      {
        id: "shift-2026-10-24",
        date: "2026-10-24",
        status: "active",
        petrolRate: 117.07,
        dieselRate: 105.23,
        stations: {
          S1: {
            stationId: "S1",
            employeeName: "Rajesh Varma",
            pump: "Pump 1",
            meters: {
              petrol: { code: "A1", open: 121300.10, close: 0, testing: 0, saleLitres: 0 },
              diesel: { code: "A2", open: 245710.20, close: 0, testing: 0, saleLitres: 0 }
            },
            collections: { cash: 0, upi: 0, card: 0, expenses: 0, expenseReason: "", notes: "" },
            status: "in-progress"
          },
          S2: {
            stationId: "S2",
            employeeName: "Prasad Rao",
            pump: "Pump 1",
            meters: {
              petrol: { code: "B1", open: 99150.30, close: 0, testing: 0, saleLitres: 0 },
              diesel: { code: "B2", open: 187880.50, close: 0, testing: 0, saleLitres: 0 }
            },
            collections: { cash: 0, upi: 0, card: 0, expenses: 0, expenseReason: "", notes: "" },
            status: "in-progress"
          },
          S3: {
            stationId: "S3",
            employeeName: "Ramesh Kumar",
            pump: "Pump 2",
            meters: {
              petrol: { code: "A1", open: 310955.41, close: 0, testing: 0, saleLitres: 0 },
              diesel: { code: "A2", open: 413165.69, close: 0, testing: 0, saleLitres: 0 }
            },
            collections: { cash: 0, upi: 0, card: 0, expenses: 0, expenseReason: "", notes: "" },
            status: "in-progress"
          },
          S4: {
            stationId: "S4",
            employeeName: "Suresh Reddy",
            pump: "Pump 2",
            meters: {
              petrol: { code: "B1", open: 154854.00, close: 0, testing: 0, saleLitres: 0 },
              diesel: { code: "B2", open: 221978.00, close: 0, testing: 0, saleLitres: 0 }
            },
            collections: { cash: 0, upi: 0, card: 0, expenses: 0, expenseReason: "", notes: "" },
            status: "in-progress"
          }
        }
      }
    ],
    // Amount Reminders (Formerly "Pending Amount / Credit" - user specified they don't give credits, just a temporary reminder)
    reminders: [
      {
        id: "rem-101",
        date: "2026-10-23",
        time: "11:20 AM",
        stationId: "S1",
        employeeName: "Ramesh Kumar",
        customerName: "K. Mohan Reddy",
        phone: "9988776655",
        vehicleNumber: "AP 21 TC 4488",
        fuelType: "Diesel",
        amount: 2500,
        notes: "Went to ATM, will pay in 30 minutes",
        status: "pending",
        clearedAt: null,
        clearedMode: null
      },
      {
        id: "rem-102",
        date: "2026-10-24",
        time: "10:15 AM",
        stationId: "S1",
        employeeName: "Rajesh Varma",
        customerName: "Venkata Raman",
        phone: "9440123456",
        vehicleNumber: "AP 09 CD 1234",
        fuelType: "Petrol",
        amount: 1500,
        notes: "Card machine link failed, will send UPI in 1 hour",
        status: "pending",
        clearedAt: null,
        clearedMode: null
      }
    ],
    // Vehicle Account / Fleet Ledger ("give oil and later some days we calculate the sum")
    vehicleLedger: [
      {
        id: "vlog-1",
        date: "2026-10-20",
        time: "08:15 AM",
        stationId: "S1",
        employeeName: "Ramesh Kumar",
        vehicleNumber: "AP 21 TC 4488",
        driverName: "Chandra Shekar",
        driverPhone: "9988776655",
        fuelType: "Diesel",
        litres: 47.51,
        rate: 105.23,
        amount: 5000,
        slipNo: "SL-881",
        notes: "Tractor - Regular fleet account",
        status: "unsettled"
      },
      {
        id: "vlog-2",
        date: "2026-10-22",
        time: "02:30 PM",
        stationId: "S3",
        employeeName: "Venkatesh Rao",
        vehicleNumber: "AP 21 TC 4488",
        driverName: "Chandra Shekar",
        driverPhone: "9988776655",
        fuelType: "Diesel",
        litres: 50.00,
        rate: 105.23,
        amount: 5262,
        slipNo: "SL-914",
        notes: "Tractor - Second load trip",
        status: "unsettled"
      },
      {
        id: "vlog-3",
        date: "2026-10-23",
        time: "09:40 AM",
        stationId: "S1",
        employeeName: "Ramesh Kumar",
        vehicleNumber: "AP 21 TC 4488",
        driverName: "Chandra Shekar",
        driverPhone: "9988776655",
        fuelType: "Diesel",
        litres: 47.51,
        rate: 105.23,
        amount: 5000,
        slipNo: "SL-965",
        notes: "Tractor - Field work",
        status: "unsettled"
      },
      {
        id: "vlog-4",
        date: "2026-10-23",
        time: "03:45 PM",
        stationId: "S3",
        employeeName: "Venkatesh Rao",
        vehicleNumber: "TS 08 UB 7712",
        driverName: "Balaji Transport Lorry",
        driverPhone: "9849098765",
        fuelType: "Diesel",
        litres: 95.03,
        rate: 105.23,
        amount: 10000,
        slipNo: "SL-982",
        notes: "Lorry fleet account",
        status: "unsettled"
      }
    ],
    attendance: [
      { id: "att-1", date: "2026-10-23", employeeId: "emp1", employeeName: "Ramesh Kumar", station: "S1", shift: "9AM-9AM", status: "present" },
      { id: "att-2", date: "2026-10-23", employeeId: "emp2", employeeName: "Suresh Reddy", station: "S2", shift: "9AM-9AM", status: "present" },
      { id: "att-3", date: "2026-10-23", employeeId: "emp3", employeeName: "Venkatesh Rao", station: "S3", shift: "9AM-9AM", status: "present" },
      { id: "att-4", date: "2026-10-23", employeeId: "emp4", employeeName: "Naresh Babu", station: "S4", shift: "9AM-9AM", status: "present" },
      { id: "att-5", date: "2026-10-24", employeeId: "emp5", employeeName: "Rajesh Varma", station: "S1", shift: "9AM-9AM", status: "present" },
      { id: "att-6", date: "2026-10-24", employeeId: "emp6", employeeName: "Prasad Rao", station: "S2", shift: "9AM-9AM", status: "present" },
      { id: "att-7", date: "2026-10-24", employeeId: "emp1", employeeName: "Ramesh Kumar", station: "S3", shift: "9AM-9AM", status: "present" },
      { id: "att-8", date: "2026-10-24", employeeId: "emp2", employeeName: "Suresh Reddy", station: "S4", shift: "9AM-9AM", status: "present" }
    ],
    tanks: [
      { id: "tank-ms", name: "Petrol Tank (MS)", fuel: "Petrol", capacity: 20000, currentStock: 14250, dipCm: 165, deliveries: [] },
      { id: "tank-hsd", name: "Diesel Tank (HSD)", fuel: "Diesel", capacity: 25000, currentStock: 18900, dipCm: 198, deliveries: [] }
    ]
  };
}

class PdbStorageManager {
  constructor() {
    this.pdbDir = PDB_DIR;
    this.catalogFile = CATALOG_FILE;
    this.defaultTenantId = "srr-filling-station";
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.pdbDir)) {
        fs.mkdirSync(this.pdbDir, { recursive: true });
      }

      // Initialize Catalog if missing
      if (!fs.existsSync(this.catalogFile)) {
        const initialCatalog = [
          {
            id: "srr-filling-station",
            name: "SRR FILLING STATION",
            brand: "Indian Oil",
            oilCompany: "Indian Oil Corporation Ltd. (IOCL)",
            location: "Highway Point",
            dbFile: "srr-filling-station.json",
            createdAt: "2026-10-24T00:00:00.000Z"
          }
        ];
        fs.writeFileSync(this.catalogFile, JSON.stringify(initialCatalog, null, 2), 'utf-8');
      }

      // Initialize default tenant PDB file
      const defaultPdbFile = path.join(this.pdbDir, 'srr-filling-station.json');
      if (!fs.existsSync(defaultPdbFile)) {
        const initialData = createPdbTemplate("SRR FILLING STATION", "Indian Oil", "1234", "Highway Point");
        fs.writeFileSync(defaultPdbFile, JSON.stringify(initialData, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error("Failed to initialize PDB Storage:", err);
    }
  }

  // List all Pluggable Databases (Tenants)
  listTenants() {
    try {
      if (!fs.existsSync(this.catalogFile)) return [];
      const raw = fs.readFileSync(this.catalogFile, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error("Error reading catalog:", e);
      return [];
    }
  }

  // Create a brand new Pluggable Database for another oil pump owner
  createTenant(name, brand = "Indian Oil", adminPin = "1234", location = "Highway Station") {
    const tenants = this.listTenants();
    const id = slugify(name);

    if (tenants.some(t => t.id === id)) {
      throw new Error(`An oil pump database with ID "${id}" already exists.`);
    }

    const fileName = `${id}.json`;
    const targetPath = path.join(this.pdbDir, fileName);

    // Create fresh isolated DB for this pump
    const newDbData = createPdbTemplate(name, brand, adminPin, location);
    fs.writeFileSync(targetPath, JSON.stringify(newDbData, null, 2), 'utf-8');

    // Register in Catalog
    const tenantEntry = {
      id,
      name: name.toUpperCase(),
      brand,
      oilCompany: brand === "Indian Oil" ? "Indian Oil Corporation Ltd. (IOCL)" : (brand === "Bharat Petroleum" ? "Bharat Petroleum Corporation Ltd. (BPCL)" : brand),
      location,
      dbFile: fileName,
      createdAt: new Date().toISOString()
    };
    tenants.push(tenantEntry);
    fs.writeFileSync(this.catalogFile, JSON.stringify(tenants, null, 2), 'utf-8');

    return tenantEntry;
  }

  // Resolve tenant file path
  getTenantFilePath(tenantId) {
    const id = tenantId ? slugify(tenantId) : this.defaultTenantId;
    const fileName = `${id}.json`;
    return path.join(this.pdbDir, fileName);
  }

  // Load isolated PDB for a specific pump
  load(tenantId) {
    const filePath = this.getTenantFilePath(tenantId);
    try {
      if (!fs.existsSync(filePath)) {
        // If not found, fallback to default or create on demand
        if (tenantId === this.defaultTenantId) {
          const initData = createPdbTemplate("SRR FILLING STATION", "Indian Oil", "1234");
          fs.writeFileSync(filePath, JSON.stringify(initData, null, 2), 'utf-8');
          return initData;
        }
        return this.load(this.defaultTenantId);
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      // Auto-patch admin credentials
      if (!data.config.adminUsername) data.config.adminUsername = "admin";
      if (!data.config.adminPassword) data.config.adminPassword = data.config.adminPin || "1234";

      // Auto-patch employee credentials
      if (Array.isArray(data.employees)) {
        data.employees.forEach(emp => {
          if (!emp.username) emp.username = emp.phone || emp.name.toLowerCase().replace(/\s+/g, '');
          if (!emp.password) emp.password = "1234";
        });
      }

      // Ensure testingRecords on shift stations
      if (Array.isArray(data.shifts)) {
        data.shifts.forEach(sh => {
          if (sh.stations) {
            ['S1', 'S2', 'S3', 'S4'].forEach(stKey => {
              if (sh.stations[stKey] && !sh.stations[stKey].testingRecords) {
                const pTest = Number(sh.stations[stKey].meters?.petrol?.testing || 0);
                const dTest = Number(sh.stations[stKey].meters?.diesel?.testing || 0);
                sh.stations[stKey].testingRecords = [];
                if (pTest > 0) {
                  sh.stations[stKey].testingRecords.push({
                    id: 'tst-init-p-' + stKey,
                    time: '09:00 AM',
                    fuelType: 'Petrol',
                    litres: pTest,
                    reason: 'Daily calibration check'
                  });
                }
                if (dTest > 0) {
                  sh.stations[stKey].testingRecords.push({
                    id: 'tst-init-d-' + stKey,
                    time: '09:00 AM',
                    fuelType: 'Diesel',
                    litres: dTest,
                    reason: 'Daily calibration check'
                  });
                }
              }
              if (sh.stations[stKey]) {
                if (!sh.stations[stKey].cardSwipes) sh.stations[stKey].cardSwipes = [];
                if (!sh.stations[stKey].expensesList) sh.stations[stKey].expensesList = [];
                if (!sh.stations[stKey].upiPayments) sh.stations[stKey].upiPayments = [];
              }
            });
          }
        });
      }

      if (!data.employeeDues) data.employeeDues = [];

      return data;
    } catch (err) {
      console.error(`Error loading PDB for ${tenantId}:`, err);
      return createPdbTemplate("SRR FILLING STATION");
    }
  }

  // Save isolated PDB for a specific pump atomically
  save(tenantId, data) {
    const filePath = this.getTenantFilePath(tenantId);
    try {
      const tempPath = filePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, filePath);
      return true;
    } catch (err) {
      console.error(`Error saving PDB for ${tenantId}:`, err);
      return false;
    }
  }
}

module.exports = new PdbStorageManager();
