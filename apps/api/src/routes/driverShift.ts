// Driver Shift Routes
//
// GLOSSARY: "Shift Start: Selects vehicle → sees pre-assigned orders".
// The shift is server state so it survives a reload and a device change, and
// so ticket 12 (real-time dispatch) can address the active driver.
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';

export const startShiftSchema = z.object({
  vehicle_id: z.string().uuid(),
  notes: z.string().optional(),
});

export const endShiftSchema = z.object({
  notes: z.string().optional(),
});

function parseBody<T>(body: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
    throw new AppError(`Ogiltigt anrop${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
  }
  return parsed.data;
}

export async function driverShiftRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // The driver's open shift (or the latest one, already ended).
  app.get('/', async (request) => {
    const driverId = request.currentUserId!;
    const shift = await db
      .selectFrom('driver_shifts')
      // Scoped select: an unscoped selectAll() with a join expands to the
      // joined vehicle's columns and clobbers the shift's own id.
      .selectAll('driver_shifts')
      .leftJoin('vehicles', 'driver_shifts.vehicle_id', 'vehicles.id')
      .select([
        'vehicles.registration_number as vehicle_registration',
        'vehicles.name as vehicle_name',
        'vehicles.classification as vehicle_classification',
      ])
      .where('driver_shifts.driver_id', '=', driverId)
      .orderBy('driver_shifts.started_at', 'desc')
      .executeTakeFirst();

    return { shift: shift ?? null, is_open: !!shift && !shift.ended_at };
  });

  // Start a shift: pick the vehicle. Re-starting with the same vehicle returns
  // the open shift; a different vehicle closes the old shift first (history).
  app.post<{ Body: z.infer<typeof startShiftSchema> }>('/start', async (request, reply) => {
    const data = parseBody(request.body, startShiftSchema);
    const driverId = request.currentUserId!;

    const vehicle = await db
      .selectFrom('vehicles')
      .select(['id', 'is_active'])
      .where('id', '=', data.vehicle_id)
      .executeTakeFirst();
    if (!vehicle) throw new AppError('Fordonet hittades inte', 'NOT_FOUND', 404);
    if (!vehicle.is_active) throw new AppError('Fordonet är inte aktivt', 'CONFLICT', 409);

    const open = await db
      .selectFrom('driver_shifts')
      .selectAll()
      .where('driver_id', '=', driverId)
      .where('ended_at', 'is', null)
      .executeTakeFirst();

    if (open && open.vehicle_id === data.vehicle_id) {
      return reply.code(200).send(open);
    }

    if (open) {
      await db
        .updateTable('driver_shifts')
        .set({ ended_at: new Date(), updated_at: new Date() })
        .where('id', '=', open.id)
        .execute();
    }

    const shift = await db
      .insertInto('driver_shifts')
      .values({
        driver_id: driverId,
        vehicle_id: data.vehicle_id,
        started_at: new Date(),
        notes: data.notes ?? null,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.code(201).send(shift);
  });

  // End the open shift.
  app.post<{ Body: z.infer<typeof endShiftSchema> }>('/end', async (request) => {
    const data = parseBody(request.body ?? {}, endShiftSchema);
    const driverId = request.currentUserId!;

    const open = await db
      .selectFrom('driver_shifts')
      .selectAll()
      .where('driver_id', '=', driverId)
      .where('ended_at', 'is', null)
      .executeTakeFirst();
    if (!open) throw new AppError('Du har inget pågående skift', 'CONFLICT', 409);

    const shift = await db
      .updateTable('driver_shifts')
      .set({ ended_at: new Date(), notes: data.notes ?? open.notes, updated_at: new Date() })
      .where('id', '=', open.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return shift;
  });
}
