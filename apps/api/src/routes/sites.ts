// Sites Routes - CRUD for sites, zones, parking spots, ramps, waste categories
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  siteSchema,
  createSiteSchema,
  updateSiteSchema,
  wasteCategorySchema,
  createWasteCategorySchema,
  updateWasteCategorySchema,
  zoneSchema,
  createZoneSchema,
  updateZoneSchema,
  parkingSpotSchema,
  createParkingSpotSchema,
  updateParkingSpotSchema,
  rampSchema,
  createRampSchema,
  updateRampSchema,
} from '@avc/shared-types/api.js';
import { paginatedResponseSchema } from '@avc/shared-types/api.js';
import { requireRole, requireSiteAccess, AppError } from '../middleware/errorHandler.js';

export async function siteRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // ==================== SITES ====================

  // List sites
  app.get<{ Querystring: { page?: string; limit?: string; search?: string } }>(
    '/',
    async (request) => {
      const { page = 1, limit = 20, search } = request.query;
      const pageNum = Number(page);
      const limitNum = Number(limit);

      let query = db.selectFrom('sites').selectAll().where('is_active', '=', true);

      if (search) {
        query = query.where((eb) =>
          eb.or([
            eb('name', 'ilike', `%${search}%`),
            eb('address', 'ilike', `%${search}%`),
          ])
        );
      }

      const total = await db.selectFrom('sites').where('is_active', '=', true).$if(!!search, (qb) => qb.where((eb) =>
          eb.or([
            eb('name', 'ilike', `%${search}%`),
            eb('address', 'ilike', `%${search}%`),
          ])
        )).select((eb) => eb.fn.count('id').as('count')).executeTakeFirst();
      const sites = await query
        .orderBy('name')
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum)
        .execute();

      return {
        data: sites,
        meta: { page: pageNum, limit: limitNum, total: Number(total?.count || 0), totalPages: Math.ceil(Number(total?.count || 0) / limitNum) },
      };
    }
  );

  // Get single site
  app.get<{ Params: { id: string } }>(
    '/:id',
    async (request) => {
      const site = await db
        .selectFrom('sites')
        .selectAll()
        .where('id', '=', request.params.id)
        .executeTakeFirst();

      if (!site) throw new AppError('Plats hittades inte', 'NOT_FOUND', 404);
      return site;
    }
  );

  // Create site (admin/manager)
  app.post<{ Body: z.infer<typeof import('@avc/shared-types/api').createSiteSchema> }>(
    '/',
    {
      preHandler: requireRole('admin', 'manager'),
    },
    async (request, reply) => {
      const site = await db
        .insertInto('sites')
        .values({ ...request.body, is_active: true } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

      return reply.code(201).send(site);
    }
  );

  // Update site
  app.patch<{ Params: { id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateSiteSchema> }>(
    '/:id',
    {
      preHandler: requireRole('admin', 'manager'),
    },
    async (request) => {
      const site = await db
        .updateTable('sites')
        .set(request.body as any)
        .where('id', '=', request.params.id)
        .returningAll()
        .executeTakeFirst();

      if (!site) throw new AppError('Plats hittades inte', 'NOT_FOUND', 404);
      return site;
    }
  );

  // Delete site (soft delete)
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireRole('admin') },
    async (request) => {
      await db.updateTable('sites').set({ is_active: false }).where('id', '=', request.params.id).execute();
      return { success: true };
    }
  );

  // ==================== WASTE CATEGORIES ====================

  app.get<{ Params: { siteId: string } }>(
    '/:siteId/waste-categories',
    async (request) => {
      return db
        .selectFrom('waste_categories')
        .selectAll()
        .where('site_id', '=', request.params.siteId)
        .orderBy('sort_order')
        .execute();
    }
  );

  app.post<{ Params: { siteId: string }; Body: z.infer<typeof import('@avc/shared-types/api').createWasteCategorySchema> }>(
    '/:siteId/waste-categories',
    {
      preHandler: requireRole('admin', 'manager'),
    },
    async (request, reply) => {
      const category = await db
        .insertInto('waste_categories')
        .values({ ...request.body, site_id: request.params.siteId } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(category);
    }
  );

  app.patch<{ Params: { siteId: string; id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateWasteCategorySchema> }>(
    '/:siteId/waste-categories/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const category = await db
        .updateTable('waste_categories')
        .set(request.body as any)
        .where('id', '=', request.params.id)
        .where('site_id', '=', request.params.siteId)
        .returningAll()
        .executeTakeFirst();
      if (!category) throw new AppError('Avfalls kategori hittades inte', 'NOT_FOUND', 404);
      return category;
    }
  );

  app.delete<{ Params: { siteId: string; id: string } }>(
    '/:siteId/waste-categories/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      await db.deleteFrom('waste_categories').where('id', '=', request.params.id).where('site_id', '=', request.params.siteId).execute();
      return { success: true };
    }
  );

  // ==================== ZONES ====================

  app.get<{ Params: { siteId: string } }>(
    '/:siteId/zones',
    async (request) => {
      return db
        .selectFrom('zones')
        .selectAll()
        .where('site_id', '=', request.params.siteId)
        .orderBy('sort_order')
        .execute();
    }
  );

  app.post<{ Params: { siteId: string }; Body: z.infer<typeof import('@avc/shared-types/api').createZoneSchema> }>(
    '/:siteId/zones',
    {
      preHandler: requireRole('admin', 'manager'),
    },
    async (request, reply) => {
      const zone = await db
        .insertInto('zones')
        .values({ ...request.body, site_id: request.params.siteId } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(zone);
    }
  );

  app.patch<{ Params: { siteId: string; id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateZoneSchema> }>(
    '/:siteId/zones/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const zone = await db
        .updateTable('zones')
        .set(request.body as any)
        .where('id', '=', request.params.id)
        .where('site_id', '=', request.params.siteId)
        .returningAll()
        .executeTakeFirst();
      if (!zone) throw new AppError('Zon hittades inte', 'NOT_FOUND', 404);
      return zone;
    }
  );

  app.delete<{ Params: { siteId: string; id: string } }>(
    '/:siteId/zones/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      await db.deleteFrom('zones').where('id', '=', request.params.id).where('site_id', '=', request.params.siteId).execute();
      return { success: true };
    }
  );

  // ==================== PARKING SPOTS ====================

  app.get<{ Params: { siteId: string } }>(
    '/:siteId/parking-spots',
    async (request) => {
      return db
        .selectFrom('parking_spots')
        .innerJoin('zones', 'parking_spots.zone_id', 'zones.id')
        .selectAll('parking_spots')
        .select(['zones.name as zone_name'])
        // Occupancy: the driver needs to know which spots are free.
        .leftJoin('containers as occupant', 'parking_spots.id', 'occupant.current_spot_id')
        .select([
          'occupant.id as occupied_by_container_id',
          'occupant.container_number as occupied_by_container_number',
        ])
        .where('zones.site_id', '=', request.params.siteId)
        .execute();
    }
  );

  app.post<{ Params: { siteId: string }; Body: z.infer<typeof import('@avc/shared-types/api').createParkingSpotSchema> }>(
    '/:siteId/parking-spots',
    {
      preHandler: requireRole('admin', 'manager'),
    },
    async (request, reply) => {
      // Verify zone belongs to site
      const zone = await db
        .selectFrom('zones')
        .select('id')
        .where('id', '=', request.body.zone_id)
        .where('site_id', '=', request.params.siteId)
        .executeTakeFirst();
      if (!zone) throw new AppError('Zon hittades inte på denna plats', 'NOT_FOUND', 404);

      const spot = await db
        .insertInto('parking_spots')
        .values(request.body as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(spot);
    }
  );

  app.patch<{ Params: { siteId: string; id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateParkingSpotSchema> }>(
    '/:siteId/parking-spots/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const spot = await db
        .updateTable('parking_spots')
        .set(request.body as any)
        .where('id', '=', request.params.id)
        .where('zone_id', 'in', db.selectFrom('zones').select('id').where('site_id', '=', request.params.siteId))
        .returningAll()
        .executeTakeFirst();
      if (!spot) throw new AppError('Parkeringsplats hittades inte', 'NOT_FOUND', 404);
      return spot;
    }
  );

  app.delete<{ Params: { siteId: string; id: string } }>(
    '/:siteId/parking-spots/:id',
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

  app.get<{ Params: { siteId: string } }>(
    '/:siteId/ramps',
    async (request) => {
      return db
        .selectFrom('ramps')
        .selectAll()
        .where('site_id', '=', request.params.siteId)
        .execute();
    }
  );

  app.post<{ Params: { siteId: string }; Body: z.infer<typeof import('@avc/shared-types/api').createRampSchema> }>(
    '/:siteId/ramps',
    {
      preHandler: requireRole('admin', 'manager'),
    },
    async (request, reply) => {
      const ramp = await db
        .insertInto('ramps')
        .values({ ...request.body, site_id: request.params.siteId } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(ramp);
    }
  );

  app.patch<{ Params: { siteId: string; id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateRampSchema> }>(
    '/:siteId/ramps/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const ramp = await db
        .updateTable('ramps')
        .set(request.body as any)
        .where('id', '=', request.params.id)
        .where('site_id', '=', request.params.siteId)
        .returningAll()
        .executeTakeFirst();
      if (!ramp) throw new AppError('Ramp hittades inte', 'NOT_FOUND', 404);
      return ramp;
    }
  );

  app.delete<{ Params: { siteId: string; id: string } }>(
    '/:siteId/ramps/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      await db.deleteFrom('ramps').where('id', '=', request.params.id).where('site_id', '=', request.params.siteId).execute();
      return { success: true };
    }
  );
}