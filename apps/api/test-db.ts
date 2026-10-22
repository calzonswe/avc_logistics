// Test DB connection
import { db } from './src/db/index.js';
import { sql } from 'kysely';

async function test() {
  try {
    const result = await sql`SELECT 1`.execute(db);
    console.log('Connected!', result.rows);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await db.destroy();
  }
}

test();