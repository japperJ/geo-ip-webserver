import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { resolveTestDatabaseConfig } from './testDatabaseConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test database configuration
 */
const testDbConfig = resolveTestDatabaseConfig();

/**
 * Connect to the default 'postgres' database to create test database
 */
function getPostgresPool(): Pool {
  return new Pool({
    host: testDbConfig.host,
    port: testDbConfig.port,
    database: 'postgres', // Connect to default DB
    user: testDbConfig.user,
    password: testDbConfig.password,
  });
}

/**
 * Connect to the test database
 */
function getTestDbPool(): Pool {
  return new Pool(testDbConfig);
}

/**
 * Ensure the test database exists, create if missing
 * Drops and recreates if it exists to ensure clean slate
 */
async function ensureDatabaseExists(): Promise<void> {
  const postgresPool = getPostgresPool();
  
  try {
    // Check if database exists
    const result = await postgresPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [testDbConfig.database]
    );
    
    if (result.rows.length > 0) {
      // Database exists - drop it to ensure clean slate
      console.log(`Dropping existing test database: ${testDbConfig.database}`);
      // Terminate existing connections first
      await postgresPool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [testDbConfig.database]);
      
      await postgresPool.query(`DROP DATABASE ${testDbConfig.database}`);
      console.log(`✓ Existing test database dropped`);
    }
    
    // Create fresh database
    console.log(`Creating test database: ${testDbConfig.database}`);
    await postgresPool.query(`CREATE DATABASE ${testDbConfig.database}`);
    console.log(`✓ Test database created: ${testDbConfig.database}`);
  } finally {
    await postgresPool.end();
  }
}

/**
 * Ensure required PostgreSQL extensions are installed
 */
async function ensureExtensions(pool: Pool): Promise<void> {
  const extensions = ['postgis', 'uuid-ossp', 'pgcrypto'];
  
  for (const ext of extensions) {
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
    } catch (error) {
      console.warn(`Warning: Could not create extension ${ext}:`, error);
      // Continue - extension might already exist or be unavailable
    }
  }
}

/**
 * Apply SQL migrations from the migrations directory
 */
async function applyMigrations(pool: Pool): Promise<void> {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  
  // Read migration files and filter for .sql only
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Apply in chronological order (filename sorting)
  
  if (files.length === 0) {
    console.warn('Warning: No SQL migration files found in', migrationsDir);
    return;
  }
  
  console.log(`Applying ${files.length} migrations to test database...`);
  
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    
    try {
      // Execute the migration SQL
      await pool.query(sql);
      console.log(`  ✓ Applied: ${file}`);
    } catch (error: any) {
      // If error is "already exists", it's safe to continue
      if (error.message?.includes('already exists')) {
        console.log(`  ⊙ Skipped (already exists): ${file}`);
      } else {
        console.error(`  ✗ Failed to apply ${file}:`, error.message);
        throw error;
      }
    }
  }
  
  console.log('✓ All migrations applied successfully');
}

/**
 * Main bootstrap function: ensures test database exists and has schema
 * 
 * This function drops and recreates the test database on every run to ensure clean slate.
 * It will:
 * 1. Drop test database if it exists (terminate connections first)
 * 2. Create fresh test database
 * 3. Install required PostgreSQL extensions
 * 4. Apply all SQL migrations
 */
export async function ensureTestDatabase(): Promise<void> {
  try {
    // Step 1: Ensure database exists (drop and recreate for clean slate)
    await ensureDatabaseExists();
    
    // Step 2: Connect to test database
    const testPool = getTestDbPool();
    
    try {
      // Step 3: Ensure extensions
      await ensureExtensions(testPool);
      
      // Step 4: Apply all migrations (database is fresh, so always apply)
      console.log('Applying migrations to fresh test database...');
      await applyMigrations(testPool);
    } finally {
      await testPool.end();
    }
  } catch (error) {
    console.error('Failed to ensure test database:', error);
    throw error;
  }
}
