// Routes - Main router
import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { siteRoutes } from './sites.js';
import { companyRoutes } from './companies.js';
import { containerRoutes } from './containers.js';
import { vehicleRoutes } from './vehicles.js';
import { driverRoutes } from './drivers.js';
import { transportOrderRoutes } from './transportOrders.js';
import { maintenanceRoutes } from './maintenance.js';
import { pitRoutes } from './pits.js';
import { swapRequestRoutes } from './swapRequests.js';
import { driverShiftRoutes } from './driverShift.js';
import { damageReportRoutes } from './damageReports.js';
import { websocketRoutes } from './websocket.js';
import { notificationRoutes } from './notifications.js';
import { pushNotificationRoutes } from './pushNotifications.js';
import { dashboardRoutes } from './dashboard.js';
import { mapRoutes } from './map.js';
import { syncRoutes } from './sync.js';
import { reportRoutes } from './reports.js';
import { uploadRoutes } from './uploads.js';
import { config } from '../config/index.js';

export async function registerRoutes(app: FastifyInstance) {
  // API version prefix
  const prefix = config.API_PREFIX;

  // Public routes
  app.register(authRoutes, { prefix: `${prefix}/auth` });

  // The WebSocket lives outside the /api/v1 prefix (the web dev server proxies
  // /ws straight to the API, and so does nginx in production) and outside the
  // protected scope: a browser cannot send an Authorization header on a
  // WebSocket handshake, so the route authorizes the upgrade itself with the
  // token from the query string.
  app.register(websocketRoutes);

  // Protected routes (all require auth)
  app.register(async function (fastify) {
    fastify.addHook('preHandler', fastify.authenticate);

    fastify.register(siteRoutes, { prefix: `${prefix}/sites` });
    fastify.register(companyRoutes, { prefix: `${prefix}/companies` });
    fastify.register(containerRoutes, { prefix: `${prefix}/containers` });
    fastify.register(vehicleRoutes, { prefix: `${prefix}/vehicles` });
    fastify.register(driverRoutes, { prefix: `${prefix}/drivers` });
    fastify.register(transportOrderRoutes, { prefix: `${prefix}/transport-orders` });
    fastify.register(maintenanceRoutes, { prefix: `${prefix}/maintenance` });
    fastify.register(pitRoutes, { prefix: `${prefix}/pits` });
    fastify.register(swapRequestRoutes, { prefix: `${prefix}/swap-requests` });
    fastify.register(driverShiftRoutes, { prefix: `${prefix}/driver-shift` });
    fastify.register(damageReportRoutes, { prefix: `${prefix}/damage-reports` });
    fastify.register(notificationRoutes, { prefix: `${prefix}/notifications` });
    fastify.register(pushNotificationRoutes, { prefix: `${prefix}/push` });
    fastify.register(dashboardRoutes, { prefix: `${prefix}/dashboard` });
    fastify.register(mapRoutes, { prefix: `${prefix}/map` });
    fastify.register(syncRoutes, { prefix: `${prefix}/sync` });
    fastify.register(reportRoutes, { prefix: `${prefix}/reports` });
    fastify.register(uploadRoutes, { prefix: `${prefix}/uploads` });
  });
}

// Authenticate hook decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}