# SMR Projects - SRR Filling Station (Indian Oil)

## Project Overview
Automated Fuel Station Management & Daily Meter Reconciliation System for SRR Filling Station (Indian Oil).

## Core Configuration & Architecture
- **Pumps & Dispensing Units**:
  - Total 2 Dispensing Pumps:
    - **Pump 1**: Side S1 & Side S2
    - **Pump 2**: Side S3 & Side S4
  - Each Station / Side (S1, S2, S3, S4) is manned by 1 employee on a 24-hour shift (9:00 AM to 9:00 AM).
  - Each Station has 2 Nozzles (1 Petrol / MS, 1 Diesel / HSD).
  - Meter Reading Displays:
    - S1 & S3 display meter codes: **A1** (Petrol) and **A2** (Diesel)
    - S2 & S4 display meter codes: **B1** (Petrol) and **B2** (Diesel)
- **Shift Cycle**:
  - Shift duration: 24 Hours (9:00 AM today to 9:00 AM tomorrow).
  - Opening meter reading logged at shift commencement (9:00 AM).
  - Closing meter reading logged at shift handover (9:00 AM next day).
  - Sale Litres = Closing Reading - Opening Reading - Testing Litres.
- **Roles & Permissions**:
  - **Employee**: Focused, distraction-free view. Log opening/closing meter readings, record pending/credit sales ("will give amount in sometime"), record cash/UPI collections. Historical and bunk aggregate financials are hidden.
  - **Admin**: Full access. Daily rate configuration, automated daily summary slip (with Telugu/English formatting matching the IOCL bunk format), WhatsApp sharing, attendance & shift roster, credit/khata tracker, attendant cash settlement & shortage tracking, tank dip stock inventory, and export/reports.
