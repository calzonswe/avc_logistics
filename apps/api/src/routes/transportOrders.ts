// Transport Order Routes - Core logistics functionality
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { db } from '../db/index.js';
import {
  transportOrderSchema,
  createTransportOrderSchema,
  updateTransportOrderSchema,
  executeTransportOrderActionSchema,
  assignTransportOrderSchema,
  createOrderFromSuggestionSchema,
} from '@avc/shared-types/api.js';
import { TransportOrderDetail, paginatedResponseSchema } from '@avc/shared-types/api.js';
import { requireRole, requireSiteAccess, AppError, NotFoundError } from '../middleware/errorHandler.js';
import { emitAppEvent } from '../services/events.js';
import { executeOrderAction } from '../services/transportOrderExecution.js';

/** Throws AppError(VALIDATION_ERROR) when the payload violates the shared contract. */
function parseBody(body: unknown, schema: z.ZodTypeAny) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
    throw new AppError(`Ogiltigt anrop${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
  }
  return parsed.data;
}

export async function transportOrderRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // List transport orders
  app.get<{ Querystring: z.infer<typeof import('@avc/shared-types/api').transportOrderQuerySchema> }>(
    '/',
    async (request) => {
      const { page = 1, limit = 20, status, driver_id, vehicle_id, site_id, date_from, date_to } = request.query;
      const pageNum = Number(page);
      const limitNum = Number(limit);

      let query = db
        .selectFrom('transport_orders')
        .leftJoin('users as planner', 'transport_orders.planned_by', 'planner.id')
        .leftJoin('users as driver', 'transport_orders.assigned_driver_id', 'driver.id')
        .leftJoin('vehicles', 'transport_orders.assigned_vehicle_id', 'vehicles.id')
        .select([
          'transport_orders.id',
          'transport_orders.order_number',
          'transport_orders.status',
          'transport_orders.planned_by',
          'planner.full_name as planner_name',
          'transport_orders.assigned_driver_id',
          'driver.full_name as driver_name',
          'transport_orders.assigned_vehicle_id',
          'vehicles.registration_number',
          'vehicles.name as vehicle_name',
          'transport_orders.planned_start_at',
          'transport_orders.actual_start_at',
          'transport_orders.completed_at',
          'transport_orders.notes',
          'transport_orders.created_at',
        ]);

      if (status) query = query.where('transport_orders.status', '=', status);
      if (driver_id) query = query.where('transport_orders.assigned_driver_id', '=', driver_id);
      if (vehicle_id) query = query.where('transport_orders.assigned_vehicle_id', '=', vehicle_id);
      if (date_from) query = query.where('transport_orders.planned_start_at', '>=', new Date(date_from));
      if (date_to) query = query.where('transport_orders.planned_start_at', '<=', new Date(date_to));

      // Site filter via stops
      if (site_id) {
        query = query.where('transport_orders.id', 'in',
          db.selectFrom('transport_order_stops')
            .select('order_id')
            .where('site_id', '=', site_id)
        );
      }

      // Drivers see only their assigned orders
      if (request.user?.role === 'driver') {
        query = query.where('transport_orders.assigned_driver_id', '=', request.user.id);
      }

      // Build count query (without joins to avoid GROUP BY issues)
      let countQuery = db.selectFrom('transport_orders');
      if (status) countQuery = countQuery.where('status', '=', status);
      if (driver_id) countQuery = countQuery.where('assigned_driver_id', '=', driver_id);
      if (vehicle_id) countQuery = countQuery.where('assigned_vehicle_id', '=', vehicle_id);
      if (date_from) countQuery = countQuery.where('planned_start_at', '>=', new Date(date_from));
      if (date_to) countQuery = countQuery.where('planned_start_at', '<=', new Date(date_to));
      if (site_id) {
        countQuery = countQuery.where('id', 'in',
          db.selectFrom('transport_order_stops')
            .select('order_id')
            .where('site_id', '=', site_id)
        );
      }
      if (request.user?.role === 'driver') {
        countQuery = countQuery.where('assigned_driver_id', '=', request.user.id);
      }

      const total = await countQuery.select((eb) => eb.fn.count('id').as('count')).executeTakeFirst();
      const orders = await query
        .orderBy('transport_orders.created_at', 'desc')
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum)
        .execute();

      // Fetch stops and containers for each order
      const orderIds = orders.map((o) => o.id);
      const stops = orderIds.length > 0 ? await db
        .selectFrom('transport_order_stops')
        .leftJoin('sites', 'transport_order_stops.site_id', 'sites.id')
        .select([
          'transport_order_stops.id as stop_id',
          'transport_order_stops.order_id',
          'transport_order_stops.sequence',
          'transport_order_stops.site_id',
          'sites.name as site_name',
          'transport_order_stops.stop_type',
          'transport_order_stops.planned_at',
          'transport_order_stops.actual_at',
          'transport_order_stops.notes',
        ])
        .where('transport_order_stops.order_id', 'in', orderIds)
        .orderBy('transport_order_stops.sequence')
        .execute() : [];

      const stopIds = stops.map((s) => s.stop_id);
      const containers = stopIds.length > 0 ? await db
        .selectFrom('transport_order_containers')
        .innerJoin('containers', 'transport_order_containers.container_id', 'containers.id')
        .leftJoin('parking_spots', 'transport_order_containers.target_spot_id', 'parking_spots.id')
        .select([
          'transport_order_containers.id',
          'transport_order_containers.order_id',
          'transport_order_containers.stop_id',
          'transport_order_containers.container_id',
          'containers.container_number',
          'containers.type as container_type',
          'containers.fill_level',
          'transport_order_containers.target_spot_id',
          'parking_spots.spot_code as target_spot_code',
          'transport_order_containers.loaded_at',
          'transport_order_containers.unloaded_at',
        ])
        .where('transport_order_containers.stop_id', 'in', stopIds)
        .execute() : [];

      // Group by order
      const stopsByOrder = stops.reduce((acc, stop) => {
        if (!acc[stop.order_id]) acc[stop.order_id] = [];
        acc[stop.order_id].push(stop);
        return acc;
      }, {} as Record<string, typeof stops>);

      const containersByStop = containers.reduce((acc, c) => {
        if (!acc[c.stop_id]) acc[c.stop_id] = [];
        acc[c.stop_id].push(c);
        return acc;
      }, {} as Record<string, typeof containers>);

      const data = orders.map((order) => ({
        ...order,
        stops: (stopsByOrder[order.id] || []).map((stop) => ({
          ...stop,
          containers: (containersByStop[stop.stop_id] || []).map((c) => ({
            container_id: c.container_id,
            container_number: c.container_number,
            container_type: c.container_type,
            fill_level: c.fill_level,
            target_spot_id: c.target_spot_id,
            target_spot_code: c.target_spot_code,
            loaded_at: c.loaded_at,
            unloaded_at: c.unloaded_at,
          })),
        })),
      }));

      return {
        data,
        meta: { page: pageNum, limit: limitNum, total: Number(total?.count || 0), totalPages: Math.ceil(Number(total?.count || 0) / limitNum) },
      };
    }
  );

  // Get single transport order with full details
  app.get<{ Params: { id: string } }>(
    '/:id',
    async (request) => {
      const order = await db
        .selectFrom('transport_orders')
        .leftJoin('users as planner', 'transport_orders.planned_by', 'planner.id')
        .leftJoin('users as driver', 'transport_orders.assigned_driver_id', 'driver.id')
        .leftJoin('vehicles', 'transport_orders.assigned_vehicle_id', 'vehicles.id')
        .select([
          'transport_orders.id',
          'transport_orders.order_number',
          'transport_orders.status',
          'transport_orders.planned_by',
          'planner.full_name as planner_name',
          'transport_orders.assigned_driver_id',
          'driver.full_name as driver_name',
          'transport_orders.assigned_vehicle_id',
          'vehicles.registration_number',
          'vehicles.name as vehicle_name',
          'transport_orders.planned_start_at',
          'transport_orders.actual_start_at',
          'transport_orders.completed_at',
          'transport_orders.notes',
        ])
        .where('transport_orders.id', '=', request.params.id)
        .executeTakeFirst();

      if (!order) throw new NotFoundError('Transportorder', request.params.id);

      const stops = await db
        .selectFrom('transport_order_stops')
        .leftJoin('sites', 'transport_order_stops.site_id', 'sites.id')
        .select([
          'transport_order_stops.id',
          'transport_order_stops.order_id',
          'transport_order_stops.sequence',
          'transport_order_stops.site_id',
          'sites.name as site_name',
          'transport_order_stops.stop_type',
          'transport_order_stops.planned_at',
          'transport_order_stops.actual_at',
          'transport_order_stops.notes',
        ])
        .where('transport_order_stops.order_id', '=', request.params.id)
        .orderBy('transport_order_stops.sequence')
        .execute();

      const stopIds = stops.map((s) => s.id);
      const containers = stopIds.length > 0 ? await db
        .selectFrom('transport_order_containers')
        .innerJoin('containers', 'transport_order_containers.container_id', 'containers.id')
        .leftJoin('parking_spots', 'transport_order_containers.target_spot_id', 'parking_spots.id')
        .select([
          'transport_order_containers.stop_id',
          'transport_order_containers.container_id',
          'containers.container_number',
          'containers.type as container_type',
          'containers.fill_level',
          'transport_order_containers.target_spot_id',
          'parking_spots.spot_code as target_spot_code',
          'transport_order_containers.loaded_at',
          'transport_order_containers.unloaded_at',
        ])
        .where('transport_order_containers.stop_id', 'in', stopIds)
        .execute() : [];

      const containersByStop = containers.reduce((acc, c) => {
        if (!acc[c.stop_id]) acc[c.stop_id] = [];
        acc[c.stop_id].push(c);
        return acc;
      }, {} as Record<string, typeof containers>);

      const stopsByOrder = stops.reduce((acc, stop) => {
        if (!acc[stop.order_id]) acc[stop.order_id] = [];
        acc[stop.order_id].push(stop);
        return acc;
      }, {} as Record<string, typeof stops>);

      const data = [order].map((o) => ({
        ...o,
        stops: (stopsByOrder[o.id] || []).map((stop) => ({
          ...stop,
          containers: (containersByStop[stop.id] || []).map((c) => ({
            container_id: c.container_id,
            container_number: c.container_number,
            container_type: c.container_type,
            fill_level: c.fill_level,
            target_spot_id: c.target_spot_id,
            target_spot_code: c.target_spot_code,
            loaded_at: c.loaded_at,
            unloaded_at: c.unloaded_at,
          })),
        })),
      }));

      return {
        data,
        meta: { page: 1, limit: 1, total: 1, totalPages: 1 },
      };
    }
  );

  // Create transport order (planner/manager)
  app.post<{ Body: z.infer<typeof import('@avc/shared-types/api').createTransportOrderSchema> }>(
    '/',
    { preHandler: requireRole('admin', 'manager') },
    async (request, reply) => {
      // The contract requires >= 1 stop and >= 1 container per stop; the raw
      // body used to be accepted, so a stop without containers was silently
      // stored (the manager UI could never build a valid order).
      const { stops, ...orderData } = parseBody(request.body, createTransportOrderSchema);

      // Validate all containers exist and are at correct sites for pickup
      for (const stop of stops) {
        if (stop.stop_type === 'pickup') {
          for (const container of stop.containers) {
            const c = await db
              .selectFrom('containers')
              .select(['id', 'current_site_id', 'status'])
              .where('id', '=', container.container_id)
              .executeTakeFirst();
            if (!c) throw new AppError(`Container ${container.container_id} hittades inte`, 'NOT_FOUND', 404);
            if (c.status !== 'active') throw new AppError(`Container ${container.container_id} är inte aktiv`, 'CONFLICT', 409);
            if (c.current_site_id !== stop.site_id) {
              throw new AppError(`Container ${container.container_id} finns inte på plats ${stop.site_id}`, 'CONFLICT', 409);
            }
          }
        }
        // Validate dropoff spots
        if (stop.stop_type === 'dropoff') {
          for (const container of stop.containers) {
            if (container.target_spot_id) {
              const spot = await db
                .selectFrom('parking_spots')
                .innerJoin('zones', 'parking_spots.zone_id', 'zones.id')
                .select(['parking_spots.id', 'zones.site_id'])
                .where('parking_spots.id', '=', container.target_spot_id)
                .executeTakeFirst();
              if (!spot) throw new AppError(`Parkeringsplats ${container.target_spot_id} hittades inte`, 'NOT_FOUND', 404);
              if (spot.site_id !== stop.site_id) {
                throw new AppError(`Parkeringsplats ${container.target_spot_id} finns inte på plats ${stop.site_id}`, 'CONFLICT', 409);
              }
            }
          }
        }
      }

      // Create in transaction
      const result = await db.transaction().execute(async (trx) => {
        // Serialise the order-number generation: two concurrent creates would
        // otherwise read the same "last" number and one of them would fail
        // with a unique violation (409 "Resursen finns redan").
        await sql`select pg_advisory_xact_lock(hashtext('transport_order_number'))`.execute(trx);

        // Generate the order number (inside the lock)
        const year = new Date().getFullYear();
        const lastOrder = await trx
          .selectFrom('transport_orders')
          .select('order_number')
          .where('order_number', 'like', `TO-${year}-%`)
          .orderBy('order_number', 'desc')
          .executeTakeFirst();

        let seq = 1;
        if (lastOrder) {
          const match = lastOrder.order_number.match(/TO-\d+-(\d+)/);
          if (match) seq = parseInt(match[1]) + 1;
        }
        const orderNumber = `TO-${year}-${String(seq).padStart(5, '0')}`;

        // Create order
        const order = await trx
          .insertInto('transport_orders')
          .values({
            ...orderData,
            order_number: orderNumber,
            planned_by: request.currentUserId!,
            status: 'planned',
          } as any)
          .returningAll()
          .executeTakeFirstOrThrow();

        // Create stops (sequence is derived from the order in which they arrive)
        for (const [stopIndex, stop] of stops.entries()) {
          const createdStop = await trx
            .insertInto('transport_order_stops')
            .values({
              order_id: order.id,
              sequence: stopIndex + 1,
              site_id: stop.site_id,
              stop_type: stop.stop_type,
              planned_at: stop.planned_at ? new Date(stop.planned_at) : null,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

          // Create container associations
          for (const container of stop.containers) {
            await trx.insertInto('transport_order_containers').values({
              order_id: order.id,
              stop_id: createdStop.id,
              container_id: container.container_id,
              target_spot_id: container.target_spot_id,
            } as any).execute();
          }
        }

        return order;
      });

      return reply.code(201).send(result);
    }
  );

  // Assign driver + vehicle: Planned -> Assigned (ticket 07 assignment flow).
  app.post<{ Params: { id: string }; Body: z.infer<typeof assignTransportOrderSchema> }>(
    '/:id/assign',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const data = parseBody(request.body, assignTransportOrderSchema);

      const order = await db
        .selectFrom('transport_orders')
        .selectAll()
        .where('id', '=', request.params.id)
        .executeTakeFirst();
      if (!order) throw new NotFoundError('Transportorder', request.params.id);
      if (order.status !== 'planned') {
        throw new AppError(
          `Endast planerade order kan tilldelas (order är '${order.status}')`,
          'CONFLICT',
          409
        );
      }

      // The assignee must actually be a driver.
      const driver = await db
        .selectFrom('users')
        .select(['id', 'role', 'is_active'])
        .where('id', '=', data.assigned_driver_id)
        .executeTakeFirst();
      if (!driver) throw new AppError('Föraren hittades inte', 'NOT_FOUND', 404);
      if (driver.role !== 'driver') throw new AppError('Vald användare är inte en förare', 'VALIDATION_ERROR', 400);
      if (!driver.is_active) throw new AppError('Föraren är inte aktiv', 'CONFLICT', 409);

      const vehicle = await db
        .selectFrom('vehicles')
        .select(['id', 'classification', 'is_active'])
        .where('id', '=', data.assigned_vehicle_id)
        .executeTakeFirst();
      if (!vehicle) throw new AppError('Fordonet hittades inte', 'NOT_FOUND', 404);
      if (!vehicle.is_active) throw new AppError('Fordonet är inte aktivt', 'CONFLICT', 409);

      const updated = await db
        .updateTable('transport_orders')
        .set({
          assigned_driver_id: data.assigned_driver_id,
          assigned_vehicle_id: data.assigned_vehicle_id,
          planned_start_at: data.planned_start_at ? new Date(data.planned_start_at) : order.planned_start_at,
          status: 'assigned',
          updated_at: new Date(),
        } as any)
        .where('id', '=', request.params.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Event 1: the order was assigned to a driver.
      const site = await db
        .selectFrom('transport_order_stops')
        .select('site_id')
        .where('order_id', '=', request.params.id)
        .orderBy('sequence')
        .executeTakeFirst();

      await emitAppEvent({
        type: 'order_assigned',
        userIds: [data.assigned_driver_id],
        title: `Order ${updated.order_number} tilldelad dig`,
        message: `Ordern är planerad att starta ${updated.planned_start_at ? new Date(updated.planned_start_at).toLocaleString('sv-SE') : 'snart'}.`,
        related_entity_type: 'transport_order',
        related_entity_id: updated.id,
        site_id: site?.site_id ?? null,
        data: { order_number: updated.order_number, status: updated.status },
      });

      return updated;
    }
  );

  // Create an order from a transport suggestion (pickup at the full site,
  // dropoff at the destination site).
  app.post<{ Body: z.infer<typeof createOrderFromSuggestionSchema> }>(
    '/from-suggestion',
    { preHandler: requireRole('admin', 'manager') },
    async (request, reply) => {
      const data = parseBody(request.body, createOrderFromSuggestionSchema);
      if (data.site_id === data.to_site_id) {
        throw new AppError('Upphämtning och avlämning måste vara på olika platser', 'VALIDATION_ERROR', 400);
      }

      // Every container must be active and standing at the pickup site.
      for (const containerId of data.container_ids) {
        const container = await db
          .selectFrom('containers')
          .select(['id', 'current_site_id', 'status'])
          .where('id', '=', containerId)
          .executeTakeFirst();
        if (!container) throw new AppError(`Container ${containerId} hittades inte`, 'NOT_FOUND', 404);
        if (container.status !== 'active') {
          throw new AppError(`Container ${containerId} är inte aktiv`, 'CONFLICT', 409);
        }
        if (container.current_site_id !== data.site_id) {
          throw new AppError(`Container ${containerId} finns inte på platsen`, 'CONFLICT', 409);
        }
      }

      const result = await db.transaction().execute(async (trx) => {
        // Same lock as the normal create: the order number must be unique.
        await sql`select pg_advisory_xact_lock(hashtext('transport_order_number'))`.execute(trx);

        const year = new Date().getFullYear();
        const lastOrder = await trx
          .selectFrom('transport_orders')
          .select('order_number')
          .where('order_number', 'like', `TO-${year}-%`)
          .orderBy('order_number', 'desc')
          .executeTakeFirst();
        let seq = 1;
        if (lastOrder) {
          const match = lastOrder.order_number.match(/TO-\d+-(\d+)/);
          if (match) seq = parseInt(match[1]) + 1;
        }

        const order = await trx
          .insertInto('transport_orders')
          .values({
            order_number: `TO-${year}-${String(seq).padStart(5, '0')}`,
            planned_by: request.currentUserId!,
            status: 'planned',
            notes: data.notes ?? null,
          } as any)
          .returningAll()
          .executeTakeFirstOrThrow();

        for (const [index, stop] of [
          { site_id: data.site_id, stop_type: 'pickup' as const },
          { site_id: data.to_site_id, stop_type: 'dropoff' as const },
        ].entries()) {
          const createdStop = await trx
            .insertInto('transport_order_stops')
            .values({
              order_id: order.id,
              sequence: index + 1,
              site_id: stop.site_id,
              stop_type: stop.stop_type,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();

          for (const containerId of data.container_ids) {
            await trx
              .insertInto('transport_order_containers')
              .values({ order_id: order.id, stop_id: createdStop.id, container_id: containerId } as any)
              .execute();
          }
        }

        return order;
      });

      return reply.code(201).send(result);
    }
  );

  // Update transport order (planner/manager)
  app.patch<{ Params: { id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateTransportOrderSchema> }>(
    '/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const body = request.body as any;
      if (body.planned_start_at) body.planned_start_at = new Date(body.planned_start_at);
      if (body.actual_start_at) body.actual_start_at = new Date(body.actual_start_at);
      if (body.completed_at) body.completed_at = new Date(body.completed_at);
      const order = await db
        .updateTable('transport_orders')
        .set(body)
        .where('id', '=', request.params.id)
        .returningAll()
        .executeTakeFirst();
      if (!order) throw new NotFoundError('Transportorder', request.params.id);
      return order;
    }
  );

  // Execute transport action (driver) - start, pickup, dropoff, complete
  // The logic lives in a service so the offline sync batch can replay the same
  // steps (ADR 0002).
  app.post<{ Params: { id: string }; Body: z.infer<typeof import('@avc/shared-types/api').executeTransportOrderActionSchema> }>(
    '/:id/execute',
    { preHandler: requireRole('driver') },
    async (request) => {
      // Validated: an unknown action must be a clean 400 (the switch in the
      // service would otherwise do nothing and report success).
      const parsed = executeTransportOrderActionSchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
        throw new AppError(`Ogiltigt anrop${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
      }
      const { action, stop_id, container_ids, spot_id, container_spots, notes } = parsed.data as any;

      const result = await executeOrderAction({
        orderId: request.params.id,
        userId: request.currentUserId!,
        action,
        stopId: stop_id,
        containerIds: container_ids,
        spotId: spot_id,
        containerSpots: container_spots,
        notes,
      });

      return { success: true, ...result };
    }
  );

  // Suggest transport orders based on fill levels (planner)
  app.post('/suggest', { preHandler: requireRole('admin', 'manager') }, async (request) => {
    // Get containers at 75% or 100% fill level that are active
    const containers = await db
      .selectFrom('containers')
      .leftJoin('sites', 'containers.current_site_id', 'sites.id')
      .select([
        'containers.id',
        'containers.container_number',
        'containers.type',
        'containers.fill_level',
        'containers.current_site_id',
        'sites.name as current_site_name',
      ])
      .where('containers.fill_level', 'in', ['75', '100'])
      .where('containers.status', '=', 'active')
      .execute();

    // Group by current site
    const bySite = containers.reduce((acc, c) => {
      if (!c.current_site_id) return acc;
      if (!acc[c.current_site_id]) {
        acc[c.current_site_id] = { siteId: c.current_site_id, siteName: c.current_site_name, containers: [] };
      }
      acc[c.current_site_id].containers.push(c);
      return acc;
    }, {} as Record<string, { siteId: string; siteName: string | null; containers: typeof containers }>);

    // For each site with containers needing transport, suggest a destination:
    // the site with the most containers that is not the source site (the main
    // hub). Ranking by container count keeps the suggestion meaningful even
    // when the main site itself is the one that is full.
    const siteStats = await db
      .selectFrom('sites')
      .leftJoin('containers', 'containers.current_site_id', 'sites.id')
      .select(['sites.id', 'sites.name', (eb) => eb.fn.count('containers.id').as('container_count')])
      .where('sites.is_active', '=', true)
      .groupBy(['sites.id', 'sites.name'])
      .orderBy((eb) => eb.fn.count('containers.id'), 'desc')
      .execute();

    const suggestions = Object.values(bySite).map((site) => {
      const destination = siteStats.find((s) => s.id !== site.siteId);
      return {
        fromSiteId: site.siteId,
        fromSiteName: site.siteName,
        toSiteId: destination?.id ?? null,
        toSiteName: destination?.name ?? null,
        containerCount: site.containers.length,
        containers: site.containers,
        suggestedAction: `Skapa transportorder till ${destination?.name ?? 'annan plats'}`,
      };
    });

    return { suggestions };
  });

  // Archive completed order
  app.post<{ Params: { id: string } }>(
    '/:id/archive',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const order = await db
        .updateTable('transport_orders')
        .set({ status: 'archived' } as any)
        .where('id', '=', request.params.id)
        .where('status', '=', 'completed')
        .returningAll()
        .executeTakeFirst();
      if (!order) throw new AppError('Endast avslutade order kan arkiveras', 'CONFLICT', 409);
      return { success: true };
    }
  );
}