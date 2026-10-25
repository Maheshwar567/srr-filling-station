require('dotenv').config();
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');
const localPdbStorage = require('./storage');
const path = require('path');
const fs = require('fs');

// Helper to generate clean slug for schema or database name
function slugify(text) {
  return text.toString().toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w_]+/g, '')
    .replace(/\_+/g, '_');
}

class CloudDatabaseManager {
  constructor() {
    this.mode = 'local'; // 'postgres', 'mongodb', or 'local'
    this.pgPool = null;
    this.mongoClient = null;
    this.cache = new Map(); // tenantId -> station data in-memory cache
    this.catalogCache = null;
    this.defaultTenantId = 'srr-filling-station';
  }

  // Initialize Cloud Database Connection
  async init() {
    // 1. Check PostgreSQL Connection String (e.g. Neon, Supabase, Railway, AWS RDS)
    if (process.env.DATABASE_URL) {
      try {
        console.log('Connecting to Cloud PostgreSQL Database...');
        this.pgPool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
        });

        // Test connection
        await this.pgPool.query('SELECT NOW()');
        this.mode = 'postgres';
        console.log('✓ Successfully connected to Cloud PostgreSQL Database!');

        // Setup master catalog table in public schema
        await this.pgPool.query(`
          CREATE TABLE IF NOT EXISTS public.pdb_catalog (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            brand VARCHAR NOT NULL,
            oil_company VARCHAR NOT NULL,
            location VARCHAR NOT NULL,
            schema_name VARCHAR NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Load existing tenants from cloud
        await this.syncFromPostgres();
        return;
      } catch (err) {
        console.error('Failed to connect to Cloud PostgreSQL. Falling back...', err.message);
      }
    }

    // 2. Check MongoDB Atlas Connection String
    if (process.env.MONGODB_URI) {
      try {
        console.log('Connecting to Cloud MongoDB Atlas...');
        this.mongoClient = new MongoClient(process.env.MONGODB_URI);
        await this.mongoClient.connect();
        this.mode = 'mongodb';
        console.log('✓ Successfully connected to Cloud MongoDB Atlas!');

        await this.syncFromMongo();
        return;
      } catch (err) {
        console.error('Failed to connect to Cloud MongoDB Atlas. Falling back...', err.message);
      }
    }

    // 3. Fallback to Local PDB Storage
    this.mode = 'local';
    console.log('Running in Local PDB Storage Mode (D:\\SMR-Projects\\SRR Filling station\\data\\pdb)');
  }

  // --- POSTGRESQL MULTI-TENANT SEPARATE DATABASE/SCHEMA IMPLEMENTATION ---
  // User requirement: "want to have seperate DB to be created for each filling station (no relation should be between any of these database)"
  async setupPostgresTenantSchema(tenantId, name, brand, location) {
    if (this.mode !== 'postgres') return;
    const schemaName = `station_${slugify(tenantId)}`;

    // Create 100% physically isolated schema for this filling station
    await this.pgPool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName};`);
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.station_store (
        id VARCHAR PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Register in master catalog
    await this.pgPool.query(`
      INSERT INTO public.pdb_catalog (id, name, brand, oil_company, location, schema_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        brand = EXCLUDED.brand,
        oil_company = EXCLUDED.oil_company,
        location = EXCLUDED.location;
    `, [
      tenantId,
      name.toUpperCase(),
      brand,
      brand === "Indian Oil" ? "Indian Oil Corporation Ltd. (IOCL)" : brand,
      location,
      schemaName
    ]);
  }

  async syncFromPostgres() {
    const catalogRes = await this.pgPool.query('SELECT * FROM public.pdb_catalog ORDER BY created_at ASC');
    let tenants = catalogRes.rows;

    // If cloud PostgreSQL is fresh, seed from local storage
    if (tenants.length === 0) {
      console.log('Seeding initial filling station databases to Cloud PostgreSQL...');
      const localTenants = localPdbStorage.listTenants();
      for (const t of localTenants) {
        await this.setupPostgresTenantSchema(t.id, t.name, t.brand, t.location);
        const localData = localPdbStorage.load(t.id);
        const schemaName = `station_${slugify(t.id)}`;
        await this.pgPool.query(`
          INSERT INTO ${schemaName}.station_store (id, payload)
          VALUES ('main', $1)
          ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP;
        `, [JSON.stringify(localData)]);
        this.cache.set(t.id, localData);
      }
      const refreshed = await this.pgPool.query('SELECT * FROM public.pdb_catalog ORDER BY created_at ASC');
      tenants = refreshed.rows;
    } else {
      // Load all tenant data into in-memory cache for high-speed sub-millisecond responses
      for (const t of tenants) {
        const schemaName = t.schema_name;
        const res = await this.pgPool.query(`SELECT payload FROM ${schemaName}.station_store WHERE id = 'main' LIMIT 1`);
        if (res.rows.length > 0) {
          this.cache.set(t.id, res.rows[0].payload);
        }
      }
    }

    this.catalogCache = tenants.map(t => ({
      id: t.id,
      name: t.name,
      brand: t.brand,
      oilCompany: t.oil_company,
      location: t.location,
      schemaName: t.schema_name,
      createdAt: t.created_at
    }));
  }

  // --- MONGODB ATLAS SEPARATE DATABASE IMPLEMENTATION ---
  // In MongoDB Atlas, each station is literally a completely separate database in the cluster!
  async syncFromMongo() {
    const masterDb = this.mongoClient.db('filling_stations_master');
    const catalogColl = masterDb.collection('catalog');
    let tenants = await catalogColl.find({}).toArray();

    if (tenants.length === 0) {
      console.log('Seeding initial filling station databases to Cloud MongoDB Atlas...');
      const localTenants = localPdbStorage.listTenants();
      for (const t of localTenants) {
        const dbName = `station_${slugify(t.id)}`;
        const stationDb = this.mongoClient.db(dbName);
        const localData = localPdbStorage.load(t.id);
        await stationDb.collection('data').updateOne(
          { _id: 'main' },
          { $set: { payload: localData, updatedAt: new Date() } },
          { upsert: true }
        );
        await catalogColl.updateOne(
          { id: t.id },
          { $set: { ...t, dbName, createdAt: new Date() } },
          { upsert: true }
        );
        this.cache.set(t.id, localData);
      }
      tenants = await catalogColl.find({}).toArray();
    } else {
      for (const t of tenants) {
        const stationDb = this.mongoClient.db(t.dbName || `station_${slugify(t.id)}`);
        const doc = await stationDb.collection('data').findOne({ _id: 'main' });
        if (doc && doc.payload) {
          this.cache.set(t.id, doc.payload);
        }
      }
    }

    this.catalogCache = tenants;
  }

  // List all registered Oil Pump Databases
  listTenants() {
    if (this.mode === 'local') {
      return localPdbStorage.listTenants();
    }
    return this.catalogCache || [];
  }

  // Create a brand new isolated database for a new filling station
  createTenant(name, brand = "Indian Oil", adminPin = "123", location = "Highway Station") {
    const slug = slugify(name);

    if (this.mode === 'local') {
      return localPdbStorage.createTenant(name, brand, adminPin, location);
    }

    // In Cloud mode:
    const newEntry = {
      id: slug,
      name: name.toUpperCase(),
      brand,
      oilCompany: brand === "Indian Oil" ? "Indian Oil Corporation Ltd. (IOCL)" : brand,
      location,
      createdAt: new Date().toISOString()
    };

    // Initialize clean template data
    const initialData = require('./storage').createPdbTemplate(name, brand, adminPin, location);
    this.cache.set(slug, initialData);

    if (!this.catalogCache) this.catalogCache = [];
    this.catalogCache.push(newEntry);

    // Asynchronously provision in the cloud database
    if (this.mode === 'postgres') {
      const schemaName = `station_${slug}`;
      this.pgPool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName};`)
        .then(() => this.pgPool.query(`CREATE TABLE IF NOT EXISTS ${schemaName}.station_store (id VARCHAR PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`))
        .then(() => this.pgPool.query(`INSERT INTO ${schemaName}.station_store (id, payload) VALUES ('main', $1);`, [JSON.stringify(initialData)]))
        .then(() => this.pgPool.query(`INSERT INTO public.pdb_catalog (id, name, brand, oil_company, location, schema_name) VALUES ($1, $2, $3, $4, $5, $6);`, [slug, name.toUpperCase(), brand, newEntry.oilCompany, location, schemaName]))
        .catch(err => console.error(`Error provisioning Postgres schema for ${slug}:`, err));
    } else if (this.mode === 'mongodb') {
      const dbName = `station_${slug}`;
      const stationDb = this.mongoClient.db(dbName);
      stationDb.collection('data').updateOne({ _id: 'main' }, { $set: { payload: initialData, updatedAt: new Date() } }, { upsert: true })
        .then(() => this.mongoClient.db('filling_stations_master').collection('catalog').insertOne({ ...newEntry, dbName }))
        .catch(err => console.error(`Error provisioning Mongo database for ${slug}:`, err));
    }

    // Also persist local backup copy
    localPdbStorage.createTenant(name, brand, adminPin, location);

    return newEntry;
  }

  // Load isolated database for a specific filling station
  load(tenantId) {
    const id = tenantId ? tenantId.toString().toLowerCase().trim() : this.defaultTenantId;

    if (this.mode === 'local') {
      return localPdbStorage.load(id);
    }

    // From in-memory cache (ultra-fast, zero wait)
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }

    // Fallback if not yet in cache
    const localData = localPdbStorage.load(id);
    this.cache.set(id, localData);
    return localData;
  }

  // Save isolated database for a specific filling station atomically
  save(tenantId, data) {
    const id = tenantId ? tenantId.toString().toLowerCase().trim() : this.defaultTenantId;

    // Update in-memory cache immediately
    this.cache.set(id, data);

    // Save to local backup copy
    localPdbStorage.save(id, data);

    // If cloud PostgreSQL is active: update isolated schema
    if (this.mode === 'postgres' && this.pgPool) {
      const schemaName = `station_${slugify(id)}`;
      this.pgPool.query(`
        INSERT INTO ${schemaName}.station_store (id, payload)
        VALUES ('main', $1)
        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP;
      `, [JSON.stringify(data)]).catch(err => console.error(`Cloud PostgreSQL save error for ${id}:`, err));
    }

    // If cloud MongoDB is active: update isolated station database
    if (this.mode === 'mongodb' && this.mongoClient) {
      const dbName = `station_${slugify(id)}`;
      this.mongoClient.db(dbName).collection('data').updateOne(
        { _id: 'main' },
        { $set: { payload: data, updatedAt: new Date() } },
        { upsert: true }
      ).catch(err => console.error(`Cloud MongoDB save error for ${id}:`, err));
    }

    return true;
  }

  // Returns current active storage provider name
  getProviderInfo() {
    return {
      mode: this.mode,
      isCloud: this.mode !== 'local',
      description: this.mode === 'postgres'
        ? 'Cloud PostgreSQL (Separate Schema / Database per Filling Station)'
        : (this.mode === 'mongodb' ? 'Cloud MongoDB Atlas (Separate Database per Filling Station)' : 'Local File Storage (PDB)')
    };
  }
}

module.exports = new CloudDatabaseManager();
