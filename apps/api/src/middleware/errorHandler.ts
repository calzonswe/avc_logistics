// Middleware - Error Handler
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { config } from '../config/index.js';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  // Log error
  request.log.error({ err: error, url: request.url, method: request.method }, 'Request error');

  // Validation errors (Zod)
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Valideringsfel',
        details: error.flatten().fieldErrors,
      },
    });
  }

  // Fastify validation errors
  if (error.validation) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Valideringsfel',
        details: error.validation,
      },
    });
  }

  // JWT errors
  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' || error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Token utgången eller ogiltig' },
    });
  }

  // Database errors
  if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
    return reply.code(409).send({
      error: { code: 'CONFLICT', message: 'Resursen finns redan' },
    });
  }

  if (error.message.includes('foreign key constraint')) {
    return reply.code(400).send({
      error: { code: 'BAD_REQUEST', message: 'Refererad resurs finns inte' },
    });
  }

  // Known operational errors
  if (error.statusCode) {
    return reply.code(error.statusCode).send({
      error: { code: error.code || 'ERROR', message: error.message },
    });
  }

  // Unknown errors
  const statusCode = 500;
  const message = config.NODE_ENV === 'production' ? 'Internt serverfel' : error.message;

  return reply.code(statusCode).send({
    error: { code: 'INTERNAL_ERROR', message },
  });
}

// Custom error classes
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource}${id ? ` (${id})` : ''} hittades inte`,
      'NOT_FOUND',
      404,
      { resource, id }
    );
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Otillräckliga behörigheter') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Åtkomst nekad') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

// Re-export middleware functions from auth
export { requireRole, requireSiteAccess, optionalAuth } from './auth.js';