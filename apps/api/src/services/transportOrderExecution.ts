// Transport order execution (shared by the REST route and the offline sync
// batch — ADR 0002: the driver's order steps must be replayable offline).
import { db } from '../db/index.js';
import { AppError, NotFoundError } from '../middleware/errorHandler.js';

export type OrderAction = 'start' | 'pickup' | 'dropoff' | 'complete';

export interface ExecuteActionParams {
  orderId: string;
  /** The acting driver (the order must be assigned to them). */
  userId: string;
  action: OrderAction;
  stopId: string;
  containerIds: string[];
  spotId?: string;
  /** One spot per container (a dropoff places each container on its own spot). */
  containerSpots?: Array<{ container_id: string; spot_id: string }>;
  notes?: string;
}

export interface ExecuteActionResult {
  order_id: string;
  status: string;
  action: OrderAction;
}

/**
 * Applies one step of a transport order. Everything happens in a single
 * transaction: the order, its stops and the container locations move together.
 */
export async function executeOrderAction(params: ExecuteActionParams): Promise<ExecuteActionResult> {
  const { orderId, userId, action, stopId, containerIds, spotId, containerSpots } = params;

  const order = await db
    .selectFrom('transport_orders')
    .selectAll()
    .where('id', '=', orderId)
    .executeTakeFirst();

  if (!order) throw new NotFoundError('Transportorder', orderId);
  if (order.assigned_driver_id !== userId) {
    throw new AppError('Du är inte tilldelad denna order', 'FORBIDDEN', 403);
  }

  const stop = await db
    .selectFrom('transport_order_stops')
    .selectAll()
    .where('id', '=', stopId)
    .where('order_id', '=', orderId)
    .executeTakeFirst();

  if (!stop) throw new NotFoundError('Stop', stopId);

  const now = new Date();

  const result = await db.transaction().execute(async (trx) => {
    switch (action) {
      case 'start': {
        if (order.status !== 'planned' && order.status !== 'assigned') {
          throw new AppError('Order kan inte startas i nuvarande status', 'CONFLICT', 409);
        }
        await trx
          .updateTable('transport_orders')
          .set({ status: 'in_progress', actual_start_at: now } as any)
          .where('id', '=', orderId)
          .execute();
        return 'in_progress';
      }

      case 'pickup': {
        if (order.status !== 'in_progress') {
          throw new AppError('Order måste vara i gång för att plocka upp', 'CONFLICT', 409);
        }
        if (stop.stop_type !== 'pickup') {
          throw new AppError('Denna stop är inte en upphämtning', 'CONFLICT', 409);
        }

        // Verify all containers are at this site
        for (const containerId of containerIds) {
          const container = await trx
            .selectFrom('containers')
            .select(['id', 'current_site_id'])
            .where('id', '=', containerId)
            .executeTakeFirst();
          if (!container) throw new NotFoundError('Container', containerId);
          if (container.current_site_id !== stop.site_id) {
            throw new AppError(`Container ${containerId} finns inte på denna plats`, 'CONFLICT', 409);
          }
        }

        // The containers leave the site (in transit)
        await trx
          .updateTable('containers')
          .set({ current_site_id: null, current_spot_id: null, updated_at: now } as any)
          .where('id', 'in', containerIds)
          .execute();

        await trx
          .updateTable('transport_order_containers')
          .set({ loaded_at: now } as any)
          .where('stop_id', '=', stopId)
          .where('container_id', 'in', containerIds)
          .execute();

        await trx
          .updateTable('transport_order_stops')
          .set({ actual_at: now } as any)
          .where('id', '=', stopId)
          .execute();
        return 'in_progress';
      }

      case 'dropoff': {
        if (order.status !== 'in_progress') {
          throw new AppError('Order måste vara i gång för att lämna av', 'CONFLICT', 409);
        }
        if (stop.stop_type !== 'dropoff') {
          throw new AppError('Denna stop är inte en avlämning', 'CONFLICT', 409);
        }

        // Every container needs its own parking spot (the DB enforces one
        // container per spot).
        const spotAssignments = new Map<string, string>();
        if (containerSpots && containerSpots.length > 0) {
          for (const entry of containerSpots) {
            if (!containerIds.includes(entry.container_id)) {
              throw new AppError(
                `Containern ${entry.container_id} ingår inte i detta stopp`,
                'VALIDATION_ERROR',
                400
              );
            }
            spotAssignments.set(entry.container_id, entry.spot_id);
          }
          const missing = containerIds.filter((id: string) => !spotAssignments.has(id));
          if (missing.length > 0) {
            throw new AppError(
              `Varje container behöver en egen parkeringsplats (saknas för ${missing.length})`,
              'VALIDATION_ERROR',
              400
            );
          }
        } else {
          if (!spotId) {
            throw new AppError('Parkeringsplats krävs för avlämning', 'VALIDATION_ERROR', 400);
          }
          if (containerIds.length > 1) {
            throw new AppError(
              'Varje container behöver en egen parkeringsplats — Ange plats per container',
              'VALIDATION_ERROR',
              400
            );
          }
          for (const id of containerIds) spotAssignments.set(id, spotId);
        }

        // Every spot must exist, be at the stop's site and be free.
        const usedSpots = new Set<string>();
        for (const [containerId, targetSpotId] of spotAssignments) {
          if (usedSpots.has(targetSpotId)) {
            throw new AppError(
              'Två containrar kan inte stå på samma parkeringsplats',
              'CONFLICT',
              409
            );
          }
          usedSpots.add(targetSpotId);

          const spot = await trx
            .selectFrom('parking_spots')
            .innerJoin('zones', 'parking_spots.zone_id', 'zones.id')
            .select(['parking_spots.id', 'zones.site_id'])
            .where('parking_spots.id', '=', targetSpotId)
            .executeTakeFirst();
          if (!spot) throw new NotFoundError('Parkeringsplats', targetSpotId);
          if (spot.site_id !== stop.site_id) {
            throw new AppError('Parkeringsplatsen finns inte på denna plats', 'CONFLICT', 409);
          }

          const occupied = await trx
            .selectFrom('containers')
            .select('id')
            .where('current_spot_id', '=', targetSpotId)
            .executeTakeFirst();
          if (occupied) throw new AppError('Parkeringsplats är redan upptagen', 'CONFLICT', 409);
        }

        // Every container is placed on its own spot
        for (const [containerId, targetSpotId] of spotAssignments) {
          await trx
            .updateTable('containers')
            .set({ current_site_id: stop.site_id, current_spot_id: targetSpotId, updated_at: now } as any)
            .where('id', '=', containerId)
            .execute();

          await trx
            .updateTable('transport_order_containers')
            .set({ unloaded_at: now, target_spot_id: targetSpotId } as any)
            .where('stop_id', '=', stopId)
            .where('container_id', '=', containerId)
            .execute();
        }

        await trx
          .updateTable('transport_order_stops')
          .set({ actual_at: now } as any)
          .where('id', '=', stopId)
          .execute();
        return 'in_progress';
      }

      case 'complete': {
        if (order.status !== 'in_progress') {
          throw new AppError('Order måste vara i gång för att slutföras', 'CONFLICT', 409);
        }

        // Every stop must be done
        const allStops = await trx
          .selectFrom('transport_order_stops')
          .select('id')
          .where('order_id', '=', orderId)
          .execute();
        const allDone = await trx
          .selectFrom('transport_order_stops')
          .select('id')
          .where('order_id', '=', orderId)
          .where('actual_at', 'is not', null)
          .execute();
        if (allStops.length !== allDone.length) {
          throw new AppError('Alla stopp måste vara klara innan order kan slutföras', 'CONFLICT', 409);
        }

        await trx
          .updateTable('transport_orders')
          .set({ status: 'completed', completed_at: now } as any)
          .where('id', '=', orderId)
          .execute();
        return 'completed';
      }
    }
  });

  return { order_id: orderId, status: result, action };
}
