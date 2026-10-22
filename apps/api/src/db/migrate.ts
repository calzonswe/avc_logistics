// Database Migration Runner
import { db } from '../db/index.js';
import { sql } from 'kysely';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Splits a .sql file into executable statements.
 * Respects $$-quoted function bodies (which contain `;`), single-quoted
 * strings and line comments — unlike a naive split(';'), which shreds
 * statements downstream of any function definition.
 */
function splitStatements(source: string): string[] {
  // Drop full-line comments first
  const stripped = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements: string[] = [];
  let buffer = '';
  let state: 'normal' | 'string' | 'dollar' | 'comment' = 'normal';
  let dollarTag = '';

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];

    // Line comment (also inline, e.g. `site_id UUID, -- worker's site`):
    // skip to end of line so apostrophes in comments never open a string.
    if (state === 'normal' && ch === '-' && stripped[i + 1] === '-') {
      state = 'comment';
      continue;
    }
    if (state === 'comment') {
      if (ch === '\n') {
        state = 'normal';
        buffer += ch;
      }
      continue;
    }

    if (state === 'dollar') {
      buffer += ch;
      if (stripped.startsWith(dollarTag, i)) {
        buffer += dollarTag.slice(1); // consume full closing tag
        i += dollarTag.length - 1;
        state = 'normal';
      }
      continue;
    }

    if (state === 'string') {
      buffer += ch;
      if (ch === "'") state = 'normal';
      continue;
    }

    // opening string literal
    if (ch === "'") {
      state = 'string';
      buffer += ch;
      continue;
    }

    // opening $-tagged block ($$ or $tag$)
    const dollarMatch = /^\$[a-zA-Z_]*\$/u.exec(stripped.slice(i));
    if (ch === '$' && dollarMatch) {
      state = 'dollar';
      dollarTag = dollarMatch[0];
      buffer += dollarTag;
      i += dollarTag.length - 1;
      continue;
    }

    if (ch === ';') {
      const statement = buffer.trim();
      if (statement.length > 0 && !statement.startsWith('--')) {
        statements.push(statement);
      }
      buffer = '';
      continue;
    }

    buffer += ch;
  }

  const tail = buffer.trim();
  if (tail.length > 0 && !tail.startsWith('--')) {
    statements.push(tail);
  }

  return statements;
}

async function migrate() {
  console.log('Running migrations...');

  try {
    const schemaPath = join(process.cwd(), '../../docs/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    const statements = splitStatements(schema);
    console.log(`  Split schema into ${statements.length} statements`);

    let failed = 0;
    for (const statement of statements) {
      try {
        await sql.raw(statement).execute(db);
      } catch (error) {
        // Ignore "already exists" errors
        if (error instanceof Error && error.message.includes('already exists')) {
          console.log(`  ⊘ Skipped (already exists): ${statement.substring(0, 50)}...`);
        } else {
          failed += 1;
          console.error(`  ✗ Failed: ${statement.substring(0, 80)}...`);
          console.error(error instanceof Error ? error.message : error);
        }
      }
    }

    if (failed > 0) {
      console.error(`Migrations completed with ${failed} FAILED statement(s)`);
      process.exitCode = 1;
    } else {
      console.log('Migrations completed!');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

migrate();