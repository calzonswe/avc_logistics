// Database - Kysely connection with PostgreSQL
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '@avc/shared-types/db.js';
import { config } from '../config/index.js';

console.log('Creating DB connection with:', config.DATABASE_URL);

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }),
});

export const db = new Kysely<Database>({
  dialect,
  log: config.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`.execute(db);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  await db.destroy();
}

// Transaction helper
export async function withTransaction<T>(
  callback: (trx: Kysely<Database>) => Promise<T>
): Promise<T> {
  return db.transaction().execute(callback);
}