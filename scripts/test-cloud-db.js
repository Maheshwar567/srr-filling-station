/**
 * Test & Verification Script for Cloud Database Connection
 * Run: node scripts/test-cloud-db.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');

async function testConnection() {
  console.log('========================================================');
  console.log('  SRR Filling Station - Cloud Database Diagnostics');
  console.log('========================================================\n');

  if (process.env.DATABASE_URL) {
    console.log('Testing Cloud PostgreSQL connection...');
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
      });
      const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name, version()');
      console.log('✓ PostgreSQL Connection SUCCESSFUL!');
      console.log(`  Database Name: ${res.rows[0].db_name}`);
      console.log(`  Server Time  : ${res.rows[0].current_time}`);
      console.log(`  Postgres Ver : ${res.rows[0].version.split(' ')[1]}`);

      const schemas = await pool.query(`
        SELECT schema_name FROM information_schema.schemata 
        WHERE schema_name LIKE 'station_%'
      `);
      console.log(`\n  Isolated Station Schemas found (${schemas.rows.length}):`);
      schemas.rows.forEach(s => console.log(`   - ${s.schema_name}`));
      await pool.end();
      return;
    } catch (err) {
      console.error('✗ PostgreSQL Connection FAILED:', err.message);
    }
  }

  if (process.env.MONGODB_URI) {
    console.log('\nTesting Cloud MongoDB Atlas connection...');
    try {
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      const dbs = await client.db().admin().listDatabases();
      console.log('✓ MongoDB Atlas Connection SUCCESSFUL!');
      console.log(`  Available Databases:`);
      dbs.databases.filter(d => d.name.startsWith('station_')).forEach(d => console.log(`   - ${d.name}`));
      await client.close();
      return;
    } catch (err) {
      console.error('✗ MongoDB Atlas Connection FAILED:', err.message);
    }
  }

  if (!process.env.DATABASE_URL && !process.env.MONGODB_URI) {
    console.log('ℹ No DATABASE_URL or MONGODB_URI found in environment.');
    console.log('  The application will run in Local PDB Storage Mode (data/pdb/*.json).');
    console.log('\n  To connect a free cloud database:');
    console.log('  1. Create a free PostgreSQL DB at https://neon.tech (takes 60 seconds)');
    console.log('  2. Copy the connection string into .env:');
    console.log('     DATABASE_URL=postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require');
  }
}

testConnection();
