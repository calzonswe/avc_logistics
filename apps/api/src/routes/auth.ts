// Auth Routes - Login, refresh, logout, password change
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { loginRequestSchema, loginResponseSchema, refreshTokenRequestSchema } from '@avc/shared-types/api.js';
import { UnauthorizedError, AppError, NotFoundError } from '../middleware/errorHandler.js';

export async function authRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // Login
  app.post<{ Body: z.infer<typeof loginRequestSchema> }>(
    '/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', email.toLowerCase())
        .executeTakeFirst();

      if (!user || !user.is_active) {
        throw new UnauthorizedError('Fel e-post eller lösenord');
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        throw new UnauthorizedError('Fel e-post eller lösenord');
      }

      // Update last login
      await db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute();

      // Generate tokens
      const accessToken = app.jwt.sign(
        { id: user.id, email: user.email, role: user.role, type: 'access' },
        { expiresIn: config.JWT_EXPIRES_IN }
      );

      const refreshToken = app.jwt.sign(
        { id: user.id, type: 'refresh' },
        { expiresIn: config.REFRESH_TOKEN_EXPIRES_IN }
      );

      // Return user without password hash
      const { password_hash: _, ...userSafe } = user;

      return reply.send({
        user: userSafe,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 15 * 60, // 15 minutes in seconds
      });
    }
  );

  // Refresh token
  app.post<{ Body: z.infer<typeof import('@avc/shared-types/api').refreshTokenRequestSchema> }>(
    '/refresh',
    async (request, reply) => {
      const { refresh_token } = request.body;

      try {
        const decoded = app.jwt.verify<{ id: string; type: 'refresh' }>(refresh_token);
        if (decoded.type !== 'refresh') {
          throw new UnauthorizedError('Ogiltig token-typ');
        }

        const user = await db
          .selectFrom('users')
          .selectAll()
          .where('id', '=', decoded.id)
          .executeTakeFirst();

        if (!user || !user.is_active) {
          throw new UnauthorizedError('Användare inte hittad eller inaktiv');
        }

        // Generate new tokens
        const accessToken = app.jwt.sign(
          { id: user.id, email: user.email, role: user.role, type: 'access' },
          { expiresIn: config.JWT_EXPIRES_IN }
        );

        const newRefreshToken = app.jwt.sign(
          { id: user.id, type: 'refresh' },
          { expiresIn: config.REFRESH_TOKEN_EXPIRES_IN }
        );

        const { password_hash: _, ...userSafe } = user;

        return reply.send({
          user: userSafe,
          access_token: accessToken,
          refresh_token: newRefreshToken,
          expires_in: 15 * 60,
        });
      } catch {
        throw new UnauthorizedError('Ogiltig eller utgånken refresh-token');
      }
    }
  );

  // Logout
  app.post('/logout', async (request, reply) => {
    return reply.send({ success: true });
  });

  // Change password
  app.post<{ Body: { current_password: string; new_password: string } }>(
    '/change-password',
    async (request, reply) => {
      const { current_password, new_password } = request.body;
      const userId = request.currentUserId!;

      const user = await db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst();
      if (!user) throw new UnauthorizedError('Användare inte hittad');

      const validPassword = await bcrypt.compare(current_password, user.password_hash);
      if (!validPassword) {
        throw new UnauthorizedError('Nuvarande lösenord är felaktigt');
      }

      const newHash = await bcrypt.hash(new_password, config.BCRYPT_ROUNDS);
      await db.updateTable('users').set({ password_hash: newHash }).where('id', '=', userId).execute();

      return reply.send({ success: true });
    }
  );

  // Get current user profile
  app.get('/me', async (request) => {
    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'full_name', 'role', 'site_id', 'avatar_url', 'last_login_at', 'created_at'])
      .where('id', '=', request.currentUserId!)
      .executeTakeFirstOrThrow();

    return user;
  });

  // Update own profile — safe self-service fields only. Role, site_id, email
  // (identity/authorization fields) can only be changed by an admin.
  app.patch<{ Body: { full_name?: string; avatar_url?: string | null } }>(
    '/me',
    async (request) => {
      const body = request.body ?? {};
      const updates: { full_name?: string; avatar_url?: string | null } = {};
      if (body.full_name !== undefined) {
        const name = String(body.full_name).trim();
        if (name.length === 0 || name.length > 100) {
          throw new AppError('Namn måste vara 1–100 tecken', 'VALIDATION_ERROR', 400);
        }
        updates.full_name = name;
      }
      if (body.avatar_url !== undefined) {
        const avatar = body.avatar_url;
        if (avatar !== null && avatar !== '') {
          new URL(avatar); // throws on invalid URL
        }
        updates.avatar_url = avatar === '' ? null : avatar;
      }
      if (Object.keys(updates).length === 0) {
        throw new AppError('Inga giltiga fält att uppdatera', 'VALIDATION_ERROR', 400);
      }

      const user = await db
        .updateTable('users')
        .set(updates)
        .where('id', '=', request.currentUserId!)
        .returning(['id', 'email', 'full_name', 'role', 'site_id', 'avatar_url', 'last_login_at', 'created_at'])
        .executeTakeFirst();

      if (!user) throw new UnauthorizedError('Användare inte hittad');
      return user;
    }
  );
}