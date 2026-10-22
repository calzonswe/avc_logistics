// WebSocket dispatch (ticket 12).
//
//   GET /ws?token=<jwt>   (upgrade)
//
// The socket is authorized with the same JWT as the REST API, the connection is
// registered with the user's id/role/site, and every app event is pushed to the
// connections that may see it:
//
//   - driver  → only the events addressed to them
//   - worker  → the events for their site
//   - manager → every event
//
// The client falls back to polling when the socket is down (the 30 s
// refetch intervals in the app keep it working).
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { onAppEvent, type AppEventPayload } from '../services/events.js';

interface Connection {
  socket: {
    send?: (data: string) => void;
    write?: (data: string) => void;
    close: (code?: number, reason?: string) => void;
    readyState?: number;
    on?: (event: string, handler: () => void) => void;
  };
  userId: string;
  role: string;
  siteId: string | null;
}

/** Sends a frame on a websocket (ws' SocketStream uses write(), the browser uses send()). */
function sendFrame(socket: Connection['socket'], payload: string): void {
  try {
    if (typeof socket.send === 'function') socket.send(payload);
    else if (typeof socket.write === 'function') socket.write(payload);
  } catch {
    // The socket died between the check and the send.
  }
}

const connections = new Set<Connection>();

/** Sends an event to every connection that may see it. */
function broadcast(event: AppEventPayload, userIds: string[]): void {
  const recipients = new Set(userIds);
  const payload = JSON.stringify({ type: 'event', event });

  for (const connection of connections) {
    if (connection.socket.readyState !== undefined && connection.socket.readyState !== 1) continue; // OPEN

    const addressed = recipients.has(connection.userId);
    const siteMatch = event.site_id && connection.siteId === event.site_id;
    const manager = connection.role === 'manager' || connection.role === 'admin';

    if (addressed || siteMatch || manager) {
      sendFrame(connection.socket, payload);
    }
  }
}

/** Connects the event bus to the open sockets. */
export function startWebSocketBroadcast(): void {
  onAppEvent((event, userIds) => {
    broadcast(event, userIds);
  });
}

export async function websocketRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // Authorize the upgrade: the token comes as a query parameter (browsers
  // cannot set headers on a WebSocket handshake).
  app.get<{ Querystring: { token?: string } }>(
    '/ws',
    {
      websocket: true,
      // Reject the upgrade itself (401) when the token is missing or invalid —
      // a browser cannot send an Authorization header on a handshake.
      preValidation: async (request, reply) => {
        const token = request.query.token;
        if (!token) {
          return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Token saknas' } });
        }
        try {
          const payload = await app.jwt.verify<{ id: string; type: string }>(token);
          if (payload.type !== 'access') throw new Error('wrong token type');
          const user = await db
            .selectFrom('users')
            .select(['id'])
            .where('id', '=', payload.id)
            .where('is_active', '=', true)
            .executeTakeFirst();
          if (!user) throw new Error('unknown user');
          (request as any).wsUserId = payload.id;
        } catch {
          return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Ogiltig eller utgånken token' } });
        }
      },
    },
    async (stream, request) => {
      // @fastify/websocket v8 hands over a SocketStream; the real WebSocket
      // (with send/close) lives on `.socket`.
      const socket = (stream as unknown as { socket: { send: (d: string) => void; close: (code?: number, reason?: string) => void } }).socket;
      const userId = (request as any).wsUserId as string | undefined;

      const user = userId
        ? await db
            .selectFrom('users')
            .select(['id', 'role', 'site_id'])
            .where('id', '=', userId)
            .executeTakeFirst()
        : undefined;

      if (!user) {
        socket.close(1008, 'Unauthorized');
        return;
      }

      const connection: Connection = {
        socket: socket as unknown as Connection['socket'],
        userId: user.id,
        role: user.role,
        siteId: user.site_id ?? null,
      };
      connections.add(connection);

      sendFrame(connection.socket, JSON.stringify({ type: 'connected', user: { id: user.id, role: user.role } }));

      const cleanup = () => {
        connections.delete(connection);
      };
      connection.socket.on?.('close', cleanup);
      connection.socket.on?.('error', cleanup);
    }
  );
}

/** Number of open sockets (health/debug). */
export function websocketConnectionCount(): number {
  return connections.size;
}
