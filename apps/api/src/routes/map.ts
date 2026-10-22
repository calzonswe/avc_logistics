// Map Routes - Site map editor and image upload
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireRole, AppError } from '../middleware/errorHandler.js';
import {
  createZoneSchema,
  updateZoneSchema,
  createParkingSpotSchema,
  updateParkingSpotSchema,
  createRampSchema,
  updateRampSchema,
  createPitSchema,
  updatePitSchema,
} from '@avc/shared-types/api.js';
import { createWriteStream } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { config } from '../config/index.js';

// Map images always live in the `maps/` subfolder of the upload root, matching
// the static-serve mapping `/uploads/maps/<file>` -> `<UPLOAD_DIR>/maps/<file>`.
const UPLOAD_DIR = join(config.UPLOAD_DIR, 'maps');

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

export async function mapRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // Upload site map image
  app.post<{ Params: { siteId: string } }>(
    '/site/:siteId/image',
    { preHandler: requireRole('admin', 'manager') },
    async (request, reply) => {
      const siteId = request.params.siteId;
      const site = await db.selectFrom('sites').select('id').where('id', '=', siteId).executeTakeFirst();
      if (!site) throw new AppError('Plats hittades inte', 'NOT_FOUND', 404);

      const data = await request.file();
      if (!data) throw new AppError('Ingen fil uppladdad', 'VALIDATION_ERROR', 400);

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(data.mimetype)) {
        throw new AppError('Endast JPEG, PNG och WebP tillåtna', 'VALIDATION_ERROR', 400);
      }

      const filename = `${siteId}-${Date.now()}${extname(data.filename)}`;
      const filepath = join(UPLOAD_DIR, filename);

      await pipeline(data.file, createWriteStream(filepath));

      const imageUrl = `/uploads/maps/${filename}`;

      // Get bounds from form fields — with `request.file()` multipart,
      // non-file fields arrive on data.fields (request.body is undefined).
      // Field values may come back as raw strings or {value} wrappers depending
      // on the multipart plugin version.
      const raw = (data.fields.bounds as string | { value?: string } | undefined) ?? null;
      const boundsRaw = typeof raw === 'object' && raw !== null ? raw.value ?? null : raw;
      const bounds =
        typeof boundsRaw === 'string' && boundsRaw.length > 0
          ? (JSON.parse(boundsRaw) as Record<string, number>)
          : null;

      await db
        .updateTable('sites')
        .set({ map_image_url: imageUrl, map_image_bounds: bounds })
        .where('id', '=', siteId)
        .execute();

      return { imageUrl, bounds };
    }
  );

  // Get site map data
  app.get<{ Params: { siteId: string } }>(
    '/site/:siteId',
    async (request) => {
      const site = await db
        .selectFrom('sites')
        .select(['id', 'name', 'map_image_url', 'map_image_bounds'])
        .where('id', '=', request.params.siteId)
        .executeTakeFirst();

      if (!site) throw new AppError('Plats hittades inte', 'NOT_FOUND', 404);

      const zones = await db
        .selectFrom('zones')
        .selectAll()
        .where('site_id', '=', request.params.siteId)
        .orderBy('sort_order')
        .execute();

      const parkingSpots = await db
        .selectFrom('parking_spots')
        .innerJoin('zones', 'parking_spots.zone_id', 'zones.id')
        .selectAll('parking_spots')
        .where('zones.site_id', '=', request.params.siteId)
        .execute();

      const ramps = await db
        .selectFrom('ramps')
        .selectAll()
        .where('site_id', '=', request.params.siteId)
        .execute();

      const pits = await db
        .selectFrom('pits')
        .selectAll()
        .where('site_id', '=', request.params.siteId)
        .where('is_active', '=', true)
        .execute();

      return {
        site: {
          id: site.id,
          name: site.name,
          map_image_url: site.map_image_url,
          map_image_bounds: site.map_image_bounds,
        },
        zones,
        parkingSpots,
        ramps,
        pits,
      };
    }
  );

  // ==================== ZONES ====================

  app.post<{ Params: { siteId: string }; Body: z.infer<typeof createZoneSchema> }>(
    '/site/:siteId/zones',
    { preHandler: requireRole('admin', 'manager') },
    async (request, reply) => {
      const { site_id: _ignored, ...data } = parseBody(request.body, createZoneSchema);
      // (site_id, name) is unique — catch user-facing conflicts explicitly.
      const existing = await db
        .selectFrom('zones')
        .select('id')
        .where('site_id', '=', request.params.siteId)
        .where('name', '=', data.name)
        .executeTakeFirst();
      if (existing) throw new AppError('En zon med detta namn finns redan på platsen', 'CONFLICT', 409);

      const zone = await db
        .insertInto('zones')
        .values({ ...data, site_id: request.params.siteId } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(zone);
    }
  );

  app.patch<{ Params: { siteId: string; id: string }; Body: z.infer<typeof updateZoneSchema> }>(
    '/site/:siteId/zones/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const { site_id: _ignored, ...data } = parseBody(request.body, updateZoneSchema);
      const zone = await db
        .updateTable('zones')
        .set({ ...data, updated_at: new Date() } as any)
        .where('id', '=', request.params.id)
        .where('site_id', '=', request.params.siteId)
        .returningAll()
        .executeTakeFirst();
      if (!zone) throw new AppError('Zon hittades inte', 'NOT_FOUND', 404);
      return zone;
    }
  );

  app.delete<{ Params: { siteId: string; id: string } }>(
    '/site/:siteId/zones/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      await db.deleteFrom('zones').where('id', '=', request.params.id).where('site_id', '=', request.params.siteId).execute();
      return { success: true };
    }
  );

  // ==================== PARKING SPOTS ====================

  app.post<{ Params: { siteId: string }; Body: z.infer<typeof createParkingSpotSchema> }>(
    '/site/:siteId/parking-spots',
    { preHandler: requireRole('admin', 'manager') },
    async (request, reply) => {
      const data = parseBody(request.body, createParkingSpotSchema);

      // Zone must belong to this site
      const zone = await db
        .selectFrom('zones')
        .select('id')
        .where('id', '=', data.zone_id)
        .where('site_id', '=', request.params.siteId)
        .executeTakeFirst();
      if (!zone) throw new AppError('Zon hittades inte på denna plats', 'NOT_FOUND', 404);

      // (zone_id, spot_code) is unique
      const existing = await db
        .selectFrom('parking_spots')
        .select('id')
        .where('zone_id', '=', data.zone_id)
        .where('spot_code', '=', data.spot_code)
        .executeTakeFirst();
      if (existing) throw new AppError('En parkeringsplats med denna kod finns redan i zonen', 'CONFLICT', 409);

      const spot = await db
        .insertInto('parking_spots')
        .values({ ...data, allowed_container_types: data.allowed_container_types ?? null } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(spot);
    }
  );

  app.patch<{ Params: { siteId: string; id: string }; Body: z.infer<typeof updateParkingSpotSchema> }>(
    '/site/:siteId/parking-spots/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const data = parseBody(request.body, updateParkingSpotSchema);
      if (data.zone_id) {
        const zone = await db
          .selectFrom('zones')
          .select('id')
          .where('id', '=', data.zone_id)
          .where('site_id', '=', request.params.siteId)
          .executeTakeFirst();
        if (!zone) throw new AppError('Zon hittades inte på denna plats', 'NOT_FOUND', 404);
      }
      const spot = await db
        .updateTable('parking_spots')
        .set({ ...data, updated_at: new Date() } as any)
        .where('id', '=', request.params.id)
        .where('zone_id', 'in', db.selectFrom('zones').select('id').where('site_id', '=', request.params.siteId))
        .returningAll()
        .executeTakeFirst();
      if (!spot) throw new AppError('Parkeringsplats hittades inte', 'NOT_FOUND', 404);
      return spot;
    }
  );

  app.delete<{ Params: { siteId: string; id: string } }>(
    '/site/:siteId/parking-spots/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      await db
        .deleteFrom('parking_spots')
        .where('id', '=', request.params.id)
        .where('zone_id', 'in', db.selectFrom('zones').select('id').where('site_id', '=', request.params.siteId))
        .execute();
      return { success: true };
    }
  );

  // ==================== RAMPS ====================

  app.post<{ Params: { siteId: string }; Body: z.infer<typeof createRampSchema> }>(
    '/site/:siteId/ramps',
    { preHandler: requireRole('admin', 'manager') },
    async (request, reply) => {
      const { site_id: _ignored, ...data } = parseBody(request.body, createRampSchema);

      const wasteCategory = await db
        .selectFrom('waste_categories')
        .select('id')
        .where('id', '=', data.waste_category_id)
        .where('site_id', '=', request.params.siteId)
        .executeTakeFirst();
      if (!wasteCategory) throw new AppError('Avfallskategori hittades inte på denna plats', 'NOT_FOUND', 404);

      const existing = await db
        .selectFrom('ramps')
        .select('id')
        .where('site_id', '=', request.params.siteId)
        .where('name', '=', data.name)
        .executeTakeFirst();
      if (existing) throw new AppError('En ramp med detta namn finns redan på platsen', 'CONFLICT', 409);

      const ramp = await db
        .insertInto('ramps')
        .values({ ...data, site_id: request.params.siteId } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(ramp);
    }
  );

  app.patch<{ Params: { siteId: string; id: string }; Body: z.infer<typeof updateRampSchema> }>(
    '/site/:siteId/ramps/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const { site_id: _ignored, ...data } = parseBody(request.body, updateRampSchema);
      if (data.waste_category_id) {
        const wasteCategory = await db
          .selectFrom('waste_categories')
          .select('id')
          .where('id', '=', data.waste_category_id)
          .where('site_id', '=', request.params.siteId)
          .executeTakeFirst();
        if (!wasteCategory) throw new AppError('Avfallskategori hittades inte på denna plats', 'NOT_FOUND', 404);
      }
      const ramp = await db
        .updateTable('ramps')
        .set({ ...data, updated_at: new Date() } as any)
        .where('id', '=', request.params.id)
        .where('site_id', '=', request.params.siteId)
        .returningAll()
        .executeTakeFirst();
      if (!ramp) throw new AppError('Ramp hittades inte', 'NOT_FOUND', 404);
      return ramp;
    }
  );

  app.delete<{ Params: { siteId: string; id: string } }>(
    '/site/:siteId/ramps/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      await db.deleteFrom('ramps').where('id', '=', request.params.id).where('site_id', '=', request.params.siteId).execute();
      return { success: true };
    }
  );

  // ==================== PITS ====================

  app.post<{ Params: { siteId: string }; Body: z.infer<typeof createPitSchema> }>(
    '/site/:siteId/pits',
    { preHandler: requireRole('admin', 'manager') },
    async (request, reply) => {
      const { site_id: _ignored, ...data } = parseBody(request.body, createPitSchema);
      const existing = await db
        .selectFrom('pits')
        .select('id')
        .where('site_id', '=', request.params.siteId)
        .where('name', '=', data.name)
        .executeTakeFirst();
      if (existing) throw new AppError('En grop med detta namn finns redan på platsen', 'CONFLICT', 409);

      const pit = await db
        .insertInto('pits')
        .values({ ...data, site_id: request.params.siteId, last_updated_by: request.currentUserId } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(pit);
    }
  );

  app.patch<{ Params: { siteId: string; id: string }; Body: z.infer<typeof updatePitSchema> }>(
    '/site/:siteId/pits/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const { site_id: _ignored, ...data } = parseBody(request.body, updatePitSchema);
      const { last_emptied_at, ...rest } = data;
      const pit = await db
        .updateTable('pits')
        .set({
          ...rest,
          ...(last_emptied_at !== undefined ? { last_emptied_at: last_emptied_at ? new Date(last_emptied_at) : null } : {}),
          last_updated_by: request.currentUserId,
          last_updated_at: new Date(),
          updated_at: new Date(),
        } as any)
        .where('id', '=', request.params.id)
        .where('site_id', '=', request.params.siteId)
        .returningAll()
        .executeTakeFirst();
      if (!pit) throw new AppError('Grop hittades inte', 'NOT_FOUND', 404);
      return pit;
    }
  );

  app.delete<{ Params: { siteId: string; id: string } }>(
    '/site/:siteId/pits/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      await db.deleteFrom('pits').where('id', '=', request.params.id).where('site_id', '=', request.params.siteId).execute();
      return { success: true };
    }
  );
}