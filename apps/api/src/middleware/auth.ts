// Middleware - Authentication
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';
import { db } from '../db/index.js';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  site_id: string | null;
  is_active: boolean;
}

// Extend the JWTPayload to include our custom fields
// Using union types for access and refresh tokens
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: 
      | { id: string; email: string; role: string; type: 'access' }
      | { id: string; type: 'refresh' };
    user: AuthUser;
  }
}

// Extend FastifyRequest with our custom properties
declare module 'fastify' {
  interface FastifyRequest {
    currentUserId?: string;
  }
}

export async function authMiddleware(app: FastifyInstance) {
  // Add hook to verify JWT on protected routes
  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for public routes
    const publicPaths = ['/health', '/ready', '/api/v1/auth/login', '/api/v1/auth/refresh', '/uploads'];
    if (publicPaths.some((path) => request.url.startsWith(path))) {
      return;
    }

    // Skip auth for WebSocket upgrade requests (handled separately)
    if (request.headers.upgrade === 'websocket') {
      return;
    }

    try {
      // Verify access token (has email, role, type: 'access')
      const payload = await request.jwtVerify<{ id: string; email: string; role: string; type: 'access' }>();
      if (payload.type !== 'access') {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Ogiltig token-typ' } });
      }
      const user = await getUserById(payload.id);
      if (!user || !user.is_active) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Användare inte aktiv' } });
      }
      request.user = user;
      request.currentUserId = user.id;
    } catch (error) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Ogiltig eller utgånken token' } });
    }
  });
}

async function getUserById(id: string): Promise<AuthUser | null> {
  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'full_name', 'role', 'site_id', 'is_active'])
    .where('id', '=', id)
    .executeTakeFirst();

  return user || null;
}

// Role-based access control
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Ej inloggad' } });
    }
    if (!roles.includes(request.user.role)) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Otillräckliga behörigheter' } });
    }
  };
}

// Site-scoped access (for workers)
export function requireSiteAccess() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Ej inloggad' } });
    }
    // Admin and Manager have access to all sites
    if (['admin', 'manager'].includes(request.user.role)) {
      return;
    }
    // Driver and Worker only have access to their assigned site
    const siteId = getSiteIdFromRequest(request);
    if (siteId && request.user.site_id !== siteId) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Ingen åtkomst till denna plats' } });
    }
  };
}

function getSiteIdFromRequest(request: FastifyRequest): string | null {
  // Check params, query, or body for site_id
  const params = request.params as Record<string, string>;
  const query = request.query as Record<string, string>;
  const body = request.body as Record<string, string>;

  return params.site_id || query.site_id || body.site_id || null;
}

// Optional auth (doesn't fail if no token)
export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = await request.jwtVerify<{ id: string; email: string; role: string; type: 'access' }>();
    if (payload.type !== 'access') return;
    const user = await getUserById(payload.id);
    if (user && user.is_active) {
      request.user = user;
      request.currentUserId = user.id;
    }
  } catch {
    // Ignore - optional auth
  }
}