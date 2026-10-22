// Sync Routes - Offline-first synchronization (ADR 0002).
//
//   POST /api/v1/sync   — batch: the client sends its queue, the server applies
//                         the mutations in timestamp order and answers with the
//                         result per mutation (server-wins on conflicts).
//   GET  /api/v1/sync/time     — the server time
//   GET  /api/v1/sync/changes  — the entities that changed since a timestamp
//
// The contract (packages/shared-types/src/domain.ts) is snake_case:
//   { client_id, last_synced_at, mutations: [{ id, entity_type, entity_id,
//     operation, payload, timestamp }] }
//   → { results: [{ mutation_id, status, server_entity, resolution }],
//       server_time }
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { syncRequestSchema } from '@avc/shared-types/api.js';
import { executeOrderAction, type OrderAction } from '../services/transportOrderExecution.js';
import { createDamageReport } from '../services/damageReportService.js';

type MutationStatus = 'applied' | 'conflict' | 'failed';

interface SyncResult {
  mutation_id: string;
  entity_type: string;
  entity_id: string | null;
  operation: string;
  status: MutationStatus;
  server_entity: Record<string, unknown> | null;
  resolution: 'server-wins' | 'client-wins' | 'merged' | null;
  error?: string;
}

/** True when the server entity is newer than the client's mutation. */
function serverIsNewer(serverUpdatedAt: unknown, mutationTimestamp: string): boolean {
  if (!serverUpdatedAt) return false;
  return new Date(serverUpdatedAt as string).getTime() > new Date(mutationTimestamp).getTime();
}

export async function syncRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // Batch sync endpoint
  app.post<{ Body: z.infer<typeof syncRequestSchema> }>(
    '/',
    async (request, reply) => {
      const parsed = syncRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Ogiltig synk-förfrågan' },
        });
      }
      const { mutations } = parsed.data;
      const userId = request.currentUserId!;

      const results: SyncResult[] = [];

      // FIFO: the mutations are applied in timestamp order (ADR 0002).
      const ordered = [...mutations].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const mutation of ordered) {
        const base: SyncResult = {
          mutation_id: mutation.id,
          entity_type: mutation.entity_type,
          entity_id: mutation.entity_id,
          operation: mutation.operation,
          status: 'applied',
          server_entity: null,
          resolution: null,
        };

        try {
          switch (mutation.entity_type) {
            // ---------------------------------------------------------- container
            case 'container': {
              const existing = await db
                .selectFrom('containers')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirst();

              if (!existing) {
                results.push({ ...base, status: 'conflict', resolution: 'server-wins' });
                break;
              }
              if (serverIsNewer(existing.updated_at, mutation.timestamp)) {
                // Server wins: the client overwrites its local copy.
                results.push({
                  ...base,
                  status: 'conflict',
                  resolution: 'server-wins',
                  server_entity: existing as unknown as Record<string, unknown>,
                });
                break;
              }
              if (mutation.operation === 'delete') {
                await db
                  .updateTable('containers')
                  .set({ status: 'retired', updated_at: new Date() })
                  .where('id', '=', mutation.entity_id!)
                  .execute();
              } else {
                await db
                  .updateTable('containers')
                  .set({ ...(mutation.payload as any), updated_at: new Date() })
                  .where('id', '=', mutation.entity_id!)
                  .execute();
              }
              const updated = await db
                .selectFrom('containers')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirstOrThrow();
              results.push({ ...base, server_entity: updated as unknown as Record<string, unknown> });
              break;
            }

            // ---------------------------------------------------------------- pit
            case 'pit': {
              const existing = await db
                .selectFrom('pits')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirst();

              if (!existing) {
                results.push({ ...base, status: 'conflict', resolution: 'server-wins' });
                break;
              }
              if (serverIsNewer(existing.updated_at, mutation.timestamp)) {
                results.push({
                  ...base,
                  status: 'conflict',
                  resolution: 'server-wins',
                  server_entity: existing as unknown as Record<string, unknown>,
                });
                break;
              }

              const payload = { ...(mutation.payload as any) };
              if (mutation.operation === 'delete') {
                payload.is_active = false;
              }
              if (payload.empty === true) {
                // "Empty the pit" — the same as the REST route.
                payload.fill_level = '0';
                payload.last_emptied_at = new Date().toISOString();
                payload.last_updated_by = userId;
                delete payload.empty;
              } else {
                payload.last_updated_at = new Date();
                payload.last_updated_by = userId;
              }

              await db
                .updateTable('pits')
                .set(payload as any)
                .where('id', '=', mutation.entity_id!)
                .execute();

              const updated = await db
                .selectFrom('pits')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirstOrThrow();
              results.push({ ...base, server_entity: updated as unknown as Record<string, unknown> });
              break;
            }

            // ------------------------------------------------------- damage report
            case 'damage_report': {
              if (mutation.operation !== 'create') {
                results.push({ ...base, status: 'failed', error: 'Endast create stöds för skaderapporter' });
                break;
              }
              const payload = mutation.payload as any;
              // Idempotent: a create that was already applied (the client did
              // not receive the response) must not fail on the primary key.
              const existing = await db
                .selectFrom('damage_reports')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirst();
              if (existing) {
                results.push({ ...base, server_entity: existing as unknown as Record<string, unknown> });
                break;
              }
              const { report, maintenanceTaskId } = await createDamageReport({
                containerId: payload.container_id,
                severity: payload.severity,
                description: payload.description,
                photos: payload.photos,
                reportedBy: userId,
                // The client generated the id (ADR 0002: temp ids) — keep it so
                // the local row and the server row are the same entity.
                id: mutation.entity_id ?? undefined,
              });
              results.push({
                ...base,
                server_entity: { ...report, maintenance_task_id: maintenanceTaskId },
              });
              break;
            }

            // ------------------------------------------------------- swap request
            case 'swap_request': {
              if (mutation.operation !== 'create') {
                results.push({ ...base, status: 'failed', error: 'Endast create stöds för bytbegäranden' });
                break;
              }
              const payload = mutation.payload as any;
              // Idempotent (see the damage report above).
              const existingSwap = await db
                .selectFrom('swap_requests')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirst();
              if (existingSwap) {
                results.push({ ...base, server_entity: existingSwap as unknown as Record<string, unknown> });
                break;
              }
              const created = await db
                .insertInto('swap_requests')
                .values({
                  ...(mutation.entity_id ? { id: mutation.entity_id } : {}),
                  site_id: payload.site_id,
                  requested_by: userId,
                  current_container_id: payload.current_container_id ?? null,
                  current_spot_id: payload.current_spot_id ?? null,
                  waste_category_id: payload.waste_category_id ?? null,
                  preferred_container_type: payload.preferred_container_type ?? null,
                  reason: payload.reason ?? null,
                  status: 'pending',
                } as any)
                .returningAll()
                .executeTakeFirstOrThrow();
              results.push({ ...base, server_entity: created as unknown as Record<string, unknown> });
              break;
            }

            // ------------------------------------------------------ maintenance task
            case 'maintenance_task': {
              const existing = await db
                .selectFrom('maintenance_tasks')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirst();

              if (!existing) {
                results.push({ ...base, status: 'conflict', resolution: 'server-wins' });
                break;
              }
              if (serverIsNewer(existing.updated_at, mutation.timestamp)) {
                results.push({
                  ...base,
                  status: 'conflict',
                  resolution: 'server-wins',
                  server_entity: existing as unknown as Record<string, unknown>,
                });
                break;
              }
              await db
                .updateTable('maintenance_tasks')
                .set({ ...(mutation.payload as any), updated_at: new Date() })
                .where('id', '=', mutation.entity_id!)
                .execute();
              const updated = await db
                .selectFrom('maintenance_tasks')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirstOrThrow();
              results.push({ ...base, server_entity: updated as unknown as Record<string, unknown> });
              break;
            }

            // ------------------------------------------------- transport order step
            case 'transport_order': {
              const payload = mutation.payload as any;
              if (payload.action) {
                // An order step (start/pickup/dropoff/complete) — the same
                // service the REST route uses.
                const result = await executeOrderAction({
                  orderId: mutation.entity_id!,
                  userId,
                  action: payload.action as OrderAction,
                  stopId: payload.stop_id,
                  containerIds: payload.container_ids ?? [],
                  spotId: payload.spot_id,
                  containerSpots: payload.container_spots,
                  notes: payload.notes,
                });
                results.push({ ...base, server_entity: result as unknown as Record<string, unknown> });
                break;
              }

              const existing = await db
                .selectFrom('transport_orders')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirst();
              if (!existing) {
                results.push({ ...base, status: 'conflict', resolution: 'server-wins' });
                break;
              }
              if (serverIsNewer(existing.updated_at, mutation.timestamp)) {
                results.push({
                  ...base,
                  status: 'conflict',
                  resolution: 'server-wins',
                  server_entity: existing as unknown as Record<string, unknown>,
                });
                break;
              }
              await db
                .updateTable('transport_orders')
                .set({ ...(mutation.payload as any), updated_at: new Date() })
                .where('id', '=', mutation.entity_id!)
                .execute();
              const updated = await db
                .selectFrom('transport_orders')
                .selectAll()
                .where('id', '=', mutation.entity_id!)
                .executeTakeFirstOrThrow();
              results.push({ ...base, server_entity: updated as unknown as Record<string, unknown> });
              break;
            }

            default:
              results.push({ ...base, status: 'failed', error: `Okänd entitetstyp: ${mutation.entity_type}` });
          }
        } catch (err) {
          results.push({
            ...base,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Okänt fel',
          });
        }
      }

      return reply.send({ results, server_time: new Date().toISOString() });
    }
  );

  // Get server time for sync
  app.get('/time', async () => {
    return { server_time: new Date().toISOString() };
  });

  // Get incremental changes since last sync
  app.get<{ Querystring: { since: string; entity_types?: string } }>(
    '/changes',
    async (request) => {
      const { since, entity_types } = request.query;
      const sinceDate = new Date(since);

      const types = entity_types ? entity_types.split(',') : ['container', 'pit', 'transport_order', 'maintenance_task'];

      const changes: any = {};

      if (types.includes('container')) {
        changes.containers = await db
          .selectFrom('containers')
          .selectAll()
          .where('updated_at', '>', sinceDate)
          .execute();
      }

      if (types.includes('pit')) {
        changes.pits = await db
          .selectFrom('pits')
          .selectAll()
          .where('updated_at', '>', sinceDate)
          .execute();
      }

      if (types.includes('transport_order')) {
        changes.transportOrders = await db
          .selectFrom('transport_orders')
          .selectAll()
          .where('updated_at', '>', sinceDate)
          .execute();
      }

      if (types.includes('maintenance_task')) {
        changes.maintenanceTasks = await db
          .selectFrom('maintenance_tasks')
          .selectAll()
          .where('updated_at', '>', sinceDate)
          .execute();
      }

      return { changes, server_time: new Date().toISOString() };
    }
  );
}
