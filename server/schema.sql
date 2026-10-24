-- ====================================================================
-- SRR FILLING STATION (INDIAN OIL) - POSTGRESQL PRODUCTION DATABASE SCHEMA
-- Multi-Tenant Database Architecture (Oracle PDB Concept in PostgreSQL)
-- ====================================================================

-- 1. Create Dedicated Database for the Bunk (Optional: one DB per oil pump)
-- CREATE DATABASE srr_filling_station_db;
-- \c srr_filling_station_db;

-- Or create a dedicated isolated schema per oil pump:
-- CREATE SCHEMA srr_filling_station;
-- SET search_path TO srr_filling_station, public;

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 1. PDB TENANTS REGISTRY (Oil Pump Pluggable Database Catalog)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pdb_tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(64) NOT NULL DEFAULT 'Indian Oil',
    oil_company VARCHAR(255) NOT NULL DEFAULT 'Indian Oil Corporation Ltd. (IOCL)',
    location VARCHAR(255),
    db_file VARCHAR(255),
    admin_pin VARCHAR(64) NOT NULL DEFAULT '1234',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 2. DAILY IOCL FUEL RATES TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuel_rates (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES pdb_tenants(id) ON DELETE CASCADE,
    rate_date DATE NOT NULL,
    petrol NUMERIC(10, 2) NOT NULL,
    diesel NUMERIC(10, 2) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, rate_date)
);

-- --------------------------------------------------------------------
-- 3. EMPLOYEES & KYC PROFILES TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES pdb_tenants(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL DEFAULT '1234',
    father_name VARCHAR(128),
    village_name VARCHAR(128),
    aadhaar_number VARCHAR(20),
    emergency_contact VARCHAR(128),
    address TEXT,
    role VARCHAR(32) NOT NULL DEFAULT 'Attendant',
    joining_date DATE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 4. 24-HOUR SHIFTS (9:00 AM to 9:00 AM)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shifts (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES pdb_tenants(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'verified'
    petrol_rate NUMERIC(10, 2) NOT NULL,
    diesel_rate NUMERIC(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, shift_date)
);

-- --------------------------------------------------------------------
-- 5. STATION / NOZZLE READINGS (PUMP 1: S1 & S2, PUMP 2: S3 & S4)
-- Auto-calculated slip aggregates S1 + S2 + S3 + S4
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_stations (
    id SERIAL PRIMARY KEY,
    shift_id VARCHAR(64) NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    station_id VARCHAR(8) NOT NULL, -- 'S1', 'S2', 'S3', 'S4'
    pump_name VARCHAR(32) NOT NULL, -- 'Pump 1', 'Pump 2'
    employee_name VARCHAR(128),
    
    -- Petrol Nozzle Meter Readings (A1 / B1)
    petrol_code VARCHAR(8) NOT NULL DEFAULT 'A1',
    petrol_open NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    petrol_close NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    petrol_testing NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    petrol_sale_litres NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    petrol_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    
    -- Diesel Nozzle Meter Readings (A2 / B2)
    diesel_code VARCHAR(8) NOT NULL DEFAULT 'A2',
    diesel_open NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    diesel_close NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    diesel_testing NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    diesel_sale_litres NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    diesel_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    
    -- Handover Collections
    collection_cash NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    collection_upi NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    collection_card NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    collection_expenses NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    expense_reason TEXT,
    handover_notes TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shift_id, station_id)
);

-- --------------------------------------------------------------------
-- 6. PUMP TESTING RECORDS (Litres deducted from sale)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS station_testing (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES pdb_tenants(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    station_id VARCHAR(8) NOT NULL,
    time_str VARCHAR(32),
    fuel_type VARCHAR(16) NOT NULL, -- 'Petrol', 'Diesel'
    litres NUMERIC(10, 2) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 7. CARD SWIPE (POS) TRANSACTIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_swipes (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES pdb_tenants(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    station_id VARCHAR(8) NOT NULL,
    time_str VARCHAR(32),
    swiped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    amount NUMERIC(12, 2) NOT NULL,
    machine_name VARCHAR(64) NOT NULL DEFAULT 'IOCL POS',
    slip_number VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 8. STATION EXPENSES (Auto-calculated and deducted from cash)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS station_expenses (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES pdb_tenants(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    station_id VARCHAR(8) NOT NULL,
    time_str VARCHAR(32),
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 9. FLEET VEHICLE ACCOUNT LEDGER (Mandatory 10-Digit Mobile Rule)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_ledger (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES pdb_tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time_str VARCHAR(32),
    station_id VARCHAR(8) NOT NULL,
    employee_name VARCHAR(128),
    vehicle_number VARCHAR(32) NOT NULL,
    driver_name VARCHAR(128),
    mobile_number VARCHAR(10) NOT NULL, -- 10 Numbers Mandatory Rule
    fuel_type VARCHAR(16) NOT NULL,
    litres NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(14, 2) NOT NULL,
    slip_no VARCHAR(64),
    notes TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'unsettled', -- 'unsettled', 'settled'
    settled_at TIMESTAMP WITH TIME ZONE,
    settlement_mode VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vehicle_ledger_vno ON vehicle_ledger(tenant_id, vehicle_number);

-- --------------------------------------------------------------------
-- 10. AMOUNT REMINDERS (Temporary reminders - NOT credit)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS amount_reminders (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES pdb_tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time_str VARCHAR(32),
    station_id VARCHAR(8) NOT NULL,
    employee_name VARCHAR(128),
    customer_name VARCHAR(128) NOT NULL,
    vehicle_number VARCHAR(32),
    phone VARCHAR(15),
    fuel_type VARCHAR(16) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    notes TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'cleared'
    cleared_at TIMESTAMP WITH TIME ZONE,
    cleared_mode VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 11. UNDERGROUND STORAGE TANKS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS underground_tanks (
    id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES pdb_tenants(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    fuel_type VARCHAR(16) NOT NULL,
    capacity NUMERIC(12, 2) NOT NULL,
    current_stock NUMERIC(12, 2) NOT NULL,
    dip_cm NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- SEED DATA FOR SRR FILLING STATION
-- --------------------------------------------------------------------
INSERT INTO pdb_tenants (id, name, brand, oil_company, location, admin_pin)
VALUES ('srr-filling-station', 'SRR FILLING STATION', 'Indian Oil', 'Indian Oil Corporation Ltd. (IOCL)', 'Highway Point', '1234')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fuel_rates (tenant_id, rate_date, petrol, diesel)
VALUES ('srr-filling-station', '2026-10-23', 117.07, 105.23)
ON CONFLICT (tenant_id, rate_date) DO NOTHING;

INSERT INTO employees (id, tenant_id, name, phone, username, password_hash, father_name, village_name, aadhaar_number, emergency_contact, address, role)
VALUES 
('emp1', 'srr-filling-station', 'Ramesh Kumar', '9848011223', '9848011223', '1234', 'K. Narayana Swamy', 'Kalyandurg, Anantapur Dist', '4589 1234 5678', '9440123999 (Brother - Siva)', 'Plot 14, Near IOCL Bunk, Main Road', 'Attendant'),
('emp2', 'srr-filling-station', 'Suresh Reddy', '9848022334', '9848022334', '1234', 'M. Ramachandra Reddy', 'Gooty Town', '7890 2345 6789', '9848099887 (Wife - Lakshmi)', 'H.No 2-45, Gandhi Nagar, Gooty', 'Attendant'),
('emp3', 'srr-filling-station', 'Venkatesh Rao', '9848033445', '9848033445', '1234', 'G. Venkateswarlu', 'Rayadurg Mandal', '8899 4321 0987', '9441122334 (Father)', 'H.No 4-89, Near Old Bus Stand, Rayadurg', 'Attendant'),
('emp4', 'srr-filling-station', 'Naresh Babu', '9848044556', '9848044556', '1234', 'B. Venkataramana', 'Atmakur Village', '3344 5566 7788', '9988112233 (Uncle - Prasad)', '3-12, Atmakur', 'Attendant')
ON CONFLICT (id) DO NOTHING;
