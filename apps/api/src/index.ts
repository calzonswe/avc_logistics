// API Entry Point - Fastify server with all plugins and routes
import Fastify, { FastifyInstance } from 'fastify';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { config } from './config/index.js';
import { startMaintenanceWatcher } from './services/maintenanceWatcher.js';
import { startWebSocketBroadcast } from './routes/websocket.js';
import { db, testConnection, closeConnection } from './db/index.js';
import { registerPlugins } from './plugins/index.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.LOG_PRETTY ? { target: 'pino-pretty' } : undefined,
    },
    ajv: {
      customOptions: { coerceTypes: 'array' },
    },
  });

  // Register plugins
  await registerPlugins(app);

  // Register middleware
  await authMiddleware(app);

  // Register routes
  await registerRoutes(app);

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // Ready check (includes DB)
  app.get('/ready', async () => {
    const dbOk = await testConnection();
    if (!dbOk) {
      throw new Error('Database not ready');
    }
    return { status: 'ready', database: 'connected' };
  });

  return app;
}

async function start() {
  try {
    const app = await buildApp();

    // Test DB connection
    const dbOk = await testConnection();
    if (!dbOk) {
      throw new Error('Failed to connect to database');
    }

    // Ensure upload directories exist (first map/user-photo upload would 500 otherwise)
    mkdirSync(join(process.cwd(), config.UPLOAD_DIR), { recursive: true });
    mkdirSync(join(process.cwd(), config.UPLOAD_DIR, 'maps'), { recursive: true });

    await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`Server running at http://${config.HOST}:${config.PORT}`);

    // Event 4: maintenance tasks that pass their due date become 'overdue' and
    // notify the managers.
    startMaintenanceWatcher();

    // Ticket 12: push the app events to the connected WebSocket clients.
    startWebSocketBroadcast();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  await closeConnection();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start if not in test mode
if (process.env.NODE_ENV !== 'test') {
  start();
}