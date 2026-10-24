# SRR FILLING STATION (Indian Oil) ⛽
### Multi-Tenant Pluggable Database (Oracle PDB Concept) Fuel Station Management System

---

## 🌟 Key Architecture & Capabilities

### 1. 🔐 User Authentication & View Segregation (Staff View OR Admin View ONLY)
- **Dedicated Portals**:
  - Upon visiting the app, users see a clean **Sign-In Portal**.
  - **Staff Login**: Attendants log in with their **Mobile Number** (e.g. `9848011223`) and **Password** (default: `1234`). They see **Staff View ONLY** with no admin financials or bunk-wide statistics.
  - **Admin Login**: Admin logs in with username `admin` and password `1234`. They see **Admin View ONLY** with full reconciliation, financials, duty roster, employee KYC, PDB management, and rates.
- **Self-Service Password Change**:
  - Staff and Admin can change their passwords anytime from the top bar (`🔑 Password` button).

### 2. 🔒 Attendant Pump Lockdown (Fraud Prevention)
- **Admin Duty Allocation**:
  - In Admin view, under **Duty Allocation**, the Admin assigns each employee to a dispensing station (`S1`, `S2`, `S3`, `S4`).
- **Read-Only Access for Employee**:
  - When the employee logs in, their assigned pump (e.g., `Station S1 - Pump 1, Side 1` with meters `A1` and `A2`) is locked in read-only mode.
  - Attendants **cannot change or select different pumps**, preventing unauthorized meter tampering.

### 3. 🧪 Dedicated Testing Tab (Litres Deducted from Sale)
- **Zero Clutter on Meter Reading Screen**:
  - Testing fields are removed from the meter reading card. The attendant enters only the opening and closing readings.
- **Dedicated Testing Tab (`🧪 టెస్టింగ్`)**:
  - Attendant records calibration testing (e.g., 5.0 L Petrol poured back into the underground tank).
  - Automatically subtracts testing litres from the employee's sale:
    $$\text{Net Sale Litres} = \text{Closing Reading} - \text{Opening Reading} - \text{Testing Litres}$$
  - Full current-shift testing log with timestamp, fuel type, litres, reason, and delete option.

### 4. 🧹 Ultra-Clean Screen Layout
- All clutter removed:
  - Removed shift timings text (`Shift: 9:00 AM - 9:00 AM`).
  - Removed pump list banner (`2 pumps (s1..., )`).
  - Removed duplicate header title above shift timings.
  - Removed phone IP address banner and rate banners from the main view.

### 5. 🏢 Oracle PDB (Pluggable Database) Architecture
- **Ready for Multi-Pump Resale**:
  - Each individual oil pump has its **own dedicated, separate database** stored in `data/pdb/<pump-name>.json`.
  - **No shared tables**: 100% data isolation per oil pump owner.
  - **1-Click Provisioning**: Admin simply provides the new pump's name (e.g., *"Sri Lakshmi Filling Station"* or *"Balaji Petroleum"*), brand (IOCL, BPCL, HPCL, Nayara, Shell), and location, and the system **automatically provisions a dedicated database** with its own pumps, rates, employees, and sales!

### 6. ⏰ "Amount Reminder (మొత్తం రిమైండర్)" - (Not Credit)
- Bunk policy does not grant credits. Renamed to **Amount Reminder** for customers who took fuel and will pay in a short while (e.g., went to ATM or PhonePe network pending).

### 7. 🚛 Multi-Day Fleet Vehicle Account Ledger ("Sum Calculator")
- **Employee View (Current Shift Only)**: Attendant logs regular fleet vehicles taking fuel (Vehicle No, Driver Name, Litres, Rate, Amount, Slip No). Strictly zero past historical records are shown to the employee.
- **Admin View (Historical Calculation & Settlement)**:
  - Multi-day historical statement for any vehicle.
  - Auto-calculates: $\sum \text{Litres}$, $\sum \text{Amount}$, and Unsettled balance.
  - 1-Click *"Settle / Clear Vehicle Balance"* when the fleet owner pays the accumulated bill.

### 8. 👤 Employee KYC & Personal Background Profile
- Captures critical identifying details in case of any bunk discrepancies:
  - **Full Name** & **Mobile Phone**
  - **Father's Name (తండ్రి పేరు)**
  - **Village / Native Place (సొంత గ్రామం)**
  - **Aadhaar Number (12-digit UID)**
  - **Emergency Contact (Family person & phone)**
  - **Residential Address** & **Joining Date**
- Clicking on any employee row opens their complete **KYC Profile Card**.

---

## 📱 Mobile App (PWA) & Access Links

- **Local Computer**: [http://localhost:5000](http://localhost:5000)
- **Mobile Phones on Bunk Wi-Fi / Hotspot**: `http://192.168.31.186:5000`
- **Install on Android / iPhone**: Open Chrome/Safari on mobile, tap *"Add to Home Screen"* to install as an offline-capable mobile app with app icon.

---

## 🔑 Default Login Credentials

| Role | Username / Mobile | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Admin (Bunk Owner)** | `admin` | `1234` | Full access to daily sales slip, roster, employees, rates, PDBs |
| **Staff (Ramesh Kumar)** | `9848011223` | `1234` | Station S1 Attendant |
| **Staff (Suresh Varma)** | `9848022334` | `1234` | Station S2 Attendant |
| **Staff (Mahesh Babu)** | `9848033445` | `1234` | Station S3 Attendant |
| **Staff (Naresh Reddy)** | `9848044556` | `1234` | Station S4 Attendant |

---

## 🧾 Daily Sales Slip Format (Exact Indian Oil Bunk Format)

```
SRR FILLING STATION 23-10-2026
      పెట్రోల్ 
=3039.51 litres
=3039.51*117.07
=3,55,835 amount 
          డీజిల్ 
=2713.79 litres
=2713.79*105.23
=2,85,572 amount 
P+D=355835+285572
        =6,41,407 amount
```
