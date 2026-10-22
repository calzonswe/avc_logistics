// Plugins - Register all Fastify plugins
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import staticFiles from '@fastify/static';
import websocket from '@fastify/websocket';
import { config } from '../config/index.js';
import { join } from 'path';

export async function registerPlugins(app: FastifyInstance) {
  // Security
  await app.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
  });

  // CORS — CORS_ORIGIN may be a comma separated list of allowed origins
  // (the production template documents that).
  const allowedOrigins = config.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  // Sensible (adds useful decorators)
  await app.register(sensible);

  // JWT
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
    verify: { algorithms: ['HS256'] },
  });

  // Add authenticate hook
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Multipart for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_FILE_SIZE,
      files: 10,
    },
  });

  // WebSocket support
  await app.register(websocket);

  // Static files for uploads
  await app.register(staticFiles, {
    root: join(process.cwd(), config.UPLOAD_DIR),
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Request validation with Zod
  app.addHook('onRequest', async (request) => {
    request.body = request.body || {};
  });
}