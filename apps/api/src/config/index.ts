// Configuration - Centralized config with validation
import { config as dotenvConfig } from 'dotenv';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

// Find .env file by traversing up from this file's directory
function findEnvPath(startDir: string): string {
  let current = startDir;
  while (current !== '/') {
    const envPath = resolve(current, '.env');
    if (existsSync(envPath)) return envPath;
    current = resolve(current, '..');
  }
  // Fallback to project root .env (3 levels up from apps/api/src/config)
  return resolve(__dirname, '../../../.env');
}

// Load .env from the found path
dotenvConfig({ path: findEnvPath(__dirname) });

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().default(12),

  // API
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().min(1),
  /** The public URL of the app (used by web push and the notifications). */
  WEB_URL: z.string().default('http://localhost:5173'),

  // File uploads
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.coerce.number().default(10485760), // 10MB

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: z.coerce.boolean().default(false),

  // Feature flags
  ENABLE_OFFLINE_SYNC: z.coerce.boolean().default(true),
  ENABLE_MAP_EDITOR: z.coerce.boolean().default(true),
  ENABLE_MAINTENANCE_SCHEDULER: z.coerce.boolean().default(true),

  // Push Notifications (Web Push). The keys are optional: without them the
  // app runs with web push disabled (the in-app notifications still work).
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().min(1).default('mailto:admin@avc.local'),

  // Email (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
});

export type Config = z.infer<typeof configSchema>;

function parseConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid configuration:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = parseConfig();