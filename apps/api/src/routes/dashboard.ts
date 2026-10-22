// Dashboard Routes - Aggregated data for dashboard views
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db/index.js';
import { SiteDashboard, DriverShiftView, TransportOrderDetail } from '@avc/shared-types';
import { requireRole, requireSiteAccess } from '../middleware/errorHandler.js';

export async function dashboardRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // Site dashboard (kiosk/mobile)
  app.get<{ Params: { siteId: string } }>(
    '/site/:siteId',
    { preHandler: requireSiteAccess() },
    async (request) => {
      const site = await db
        .selectFrom('sites')
        .select(['id', 'name', 'map_image_url', 'map_image_bounds'])
        .where('id', '=', request.params.siteId)
        .executeTakeFirst();

      if (!site) return { error: 'Plats hittades inte' };

      // Containers at site
      const containers = await db
        .selectFrom('containers')
        .leftJoin('parking_spots', 'containers.current_spot_id', 'parking_spots.id')
        .leftJoin('zones', 'parking_spots.zone_id', 'zones.id')
        .select([
          'containers.id',
          'containers.container_number',
          'containers.type',
          'containers.fill_level',
          'containers.current_spot_id as spot_id',
          'parking_spots.spot_code',
          'zones.id as zone_id',
          'zones.name as zone_name',
          'parking_spots.position_x',
          'parking_spots.position_y',
        ])
        .where('containers.current_site_id', '=', request.params.siteId)
        .execute();

      // Pits at site (mapped to the dashboard pit view; alert rule per GLOSSARY:
      // discrete fill levels, pit raises its alert when it crosses the threshold)
      const pitRows = await db
        .selectFrom('pits')
        .selectAll()
        .where('site_id', '=', request.params.siteId)
        .where('is_active', '=', true)
        .execute();

      const pits: SiteDashboard['pits'] = pitRows.map((p) => {
        const fill = Number(p.fill_level);
        const threshold = Number(p.alert_threshold);
        return {
          id: p.id,
          name: p.name,
          material_type: p.material_type,
          fill_level: p.fill_level,
          alert_threshold: p.alert_threshold,
          position_x: Number(p.position_x),
          position_y: Number(p.position_y),
          alert_level: fill >= threshold ? 'critical' : fill >= threshold - 25 ? 'warning' : 'ok',
        };
      });

      // Zones for map
      const zones = await db
        .selectFrom('zones')
        .selectAll()
        .where('site_id', '=', request.params.siteId)
        .execute();

      const dashboard: SiteDashboard = {
        site_id: site.id,
        site_name: site.name,
        map_image_url: site.map_image_url,
        map_image_bounds: site.map_image_bounds as Record<string, number> | null,
        containers,
        pits,
        zones,
      };

      return dashboard;
    }
  );

  // Driver shift view
  app.get<{ Params: { driverId: string } }>(
    '/driver/:driverId/shift',
    { preHandler: requireRole('driver') },
    async (request) => {
      const driver = await db
        .selectFrom('users')
        .select(['id', 'full_name', 'site_id'])
        .where('id', '=', request.params.driverId)
        .executeTakeFirst();

      if (!driver) return { error: 'Förare hittades inte' };

      // ISO-date helpers: JSON responses carry strings, not Date objects.
      function iso(d: Date): string;
      function iso(d: Date | null | undefined): string | null;
      function iso(d: Date | null | undefined): string | null {
        return d ? new Date(d).toISOString() : null;
      }

      const orders = await db
        .selectFrom('transport_orders')
        .leftJoin('users as planner', 'transport_orders.planned_by', 'planner.id')
        .leftJoin('users as driver_user', 'transport_orders.assigned_driver_id', 'driver_user.id')
        .leftJoin('vehicles', 'transport_orders.assigned_vehicle_id', 'vehicles.id')
        .selectAll('transport_orders')
        .select([
          'planner.full_name as planner_name',
          'driver_user.full_name as driver_name',
          'vehicles.registration_number as vehicle_registration',
          'vehicles.name as vehicle_name',
        ])
        .where('transport_orders.assigned_driver_id', '=', request.params.driverId)
        .where('transport_orders.status', 'in', ['planned', 'assigned', 'in_progress'])
        .orderBy('transport_orders.planned_start_at')
        .execute();

      // Vehicles available to this driver (active, bound to their home site if any)
      const available_vehicles = await db
        .selectFrom('vehicles')
        .selectAll()
        .where('is_active', '=', true)
        .$if(!!driver.site_id, (qb) => qb.where('home_site_id', '=', driver.site_id as string))
        .execute();

      // Get stops for each order
      const orderIds = orders.map((o) => o.id);
      const stops = orderIds.length > 0 ? await db
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
        .where('transport_order_stops.order_id', 'in', orderIds)
        .orderBy('transport_order_stops.sequence')
        .execute() : [];

      // Get containers for each stop
      const stopIds = stops.map((s) => s.id);
      const containers = stopIds.length > 0 ? await db
        .selectFrom('transport_order_containers')
        .innerJoin('containers', 'transport_order_containers.container_id', 'containers.id')
        .leftJoin('parking_spots', 'transport_order_containers.target_spot_id', 'parking_spots.id')
        .select([
          'transport_order_containers.id',
          'transport_order_containers.order_id',
          'transport_order_containers.stop_id',
          'transport_order_containers.container_id',
          'transport_order_containers.target_spot_id',
          'transport_order_containers.loaded_at',
          'transport_order_containers.unloaded_at',
          'transport_order_containers.notes',
          'containers.container_number',
          'containers.type as container_type',
          'containers.fill_level',
          'parking_spots.spot_code as target_spot_code',
        ])
        .where('transport_order_containers.stop_id', 'in', stopIds)
        .execute() : [];

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

      const assigned_orders: TransportOrderDetail[] = orders.map((order) => ({
        id: order.id,
        created_at: iso(order.created_at),
        updated_at: iso(order.updated_at),
        order_number: order.order_number,
        status: order.status,
        planned_by: order.planned_by,
        assigned_driver_id: order.assigned_driver_id,
        assigned_vehicle_id: order.assigned_vehicle_id,
        planned_start_at: iso(order.planned_start_at),
        actual_start_at: iso(order.actual_start_at),
        completed_at: iso(order.completed_at),
        notes: order.notes ?? null,
        planner_name: order.planner_name,
        driver_name: order.driver_name,
        vehicle_registration: order.vehicle_registration ?? null,
        vehicle_name: order.vehicle_name ?? null,
        stops: (stopsByOrder[order.id] || []).map((stop) => ({
          id: stop.id,
          order_id: stop.order_id,
          sequence: stop.sequence,
          site_id: stop.site_id,
          stop_type: stop.stop_type,
          planned_at: iso(stop.planned_at),
          actual_at: iso(stop.actual_at),
          notes: stop.notes ?? null,
          site_name: stop.site_name ?? '',
          containers: (containersByStop[stop.id] || []).map((c) => ({
            id: c.id,
            order_id: c.order_id,
            stop_id: c.stop_id,
            container_id: c.container_id,
            target_spot_id: c.target_spot_id,
            loaded_at: iso(c.loaded_at),
            unloaded_at: iso(c.unloaded_at),
            notes: c.notes ?? null,
            container_number: c.container_number,
            container_type: c.container_type,
            fill_level: c.fill_level,
            target_spot_code: c.target_spot_code,
          })),
        })),
      }));

      const shiftView: DriverShiftView = {
        driver_id: driver.id,
        driver_name: driver.full_name,
        assigned_orders,
        available_vehicles: available_vehicles.map((v) => ({
          ...v,
          created_at: iso(v.created_at),
          updated_at: iso(v.updated_at),
        })),
      };

      return shiftView;
    }
  );

  // Manager overview dashboard
  app.get('/manager/overview', { preHandler: requireRole('admin', 'manager') }, async (request) => {
    // Contract: matches ManagerOverview in @avc/shared-types (all six stat
    // fields the manager Dashboard renders) + a fill/status breakdown.
    // Container stats (status × fill_level breakdown)
    const containerStats = await db
      .selectFrom('containers')
      .select([
        'status',
        'fill_level',
        (eb) => eb.fn.count('id').as('count')
      ])
      .groupBy(['status', 'fill_level'])
      .execute();

    // Total containers
    const totalContainers = await db
      .selectFrom('containers')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('status', '!=', 'retired')
      .executeTakeFirst();

    // Active transport orders
    const activeOrders = await db
      .selectFrom('transport_orders')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('status', 'in', ['planned', 'assigned', 'in_progress'])
      .executeTakeFirst();

    // Overdue maintenance
    const overdueMaintenance = await db
      .selectFrom('maintenance_tasks')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('scheduled_for', '<=', new Date())
      .where('status', '!=', 'completed')
      .executeTakeFirst();

    // Pit alerts (pits at 75%+ = needing emptying)
    const pitsNeedingAttention = await db
      .selectFrom('pits')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('fill_level', 'in', ['75', '100'])
      .where('is_active', '=', true)
      .executeTakeFirst();

    // Containers needing transport (75%+ fill)
    const containersNeedingTransport = await db
      .selectFrom('containers')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('fill_level', 'in', ['75', '100'])
      .where('status', '=', 'active')
      .executeTakeFirst();

    // Open damage reports (open or acknowledged, not yet resolved)
    const openDamageReports = await db
      .selectFrom('damage_reports')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('status', 'in', ['open', 'acknowledged'])
      .executeTakeFirst();

    // Pending swap requests
    const pendingSwapRequests = await db
      .selectFrom('swap_requests')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('status', 'in', ['pending', 'approved'])
      .executeTakeFirst();

    return {
      containerStats: containerStats.map((row) => ({
        status: row.status,
        fill_level: row.fill_level,
        count: Number(row.count),
      })),
      activeOrders: Number(activeOrders?.count || 0),
      totalContainers: Number(totalContainers?.count || 0),
      overdueMaintenance: Number(overdueMaintenance?.count || 0),
      pitAlerts: Number(pitsNeedingAttention?.count || 0),
      containersNeedingTransport: Number(containersNeedingTransport?.count || 0),
      openDamageReports: Number(openDamageReports?.count || 0),
      pendingSwapRequests: Number(pendingSwapRequests?.count || 0),
      pitsNeedingAttention: Number(pitsNeedingAttention?.count || 0),
    };
  });
}