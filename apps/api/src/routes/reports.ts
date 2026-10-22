// Reports Routes - Operational KPIs and analytics
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireRole } from '../middleware/errorHandler.js';

export async function reportRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // Container utilization report
  app.post<{ Body: z.infer<typeof import('@avc/shared-types/api').containerUtilizationReportSchema> }>(
    '/container-utilization',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const { site_id, company_id, date_from, date_to } = request.body;

      // This would typically query historical fill level data
      // For now, return current snapshot
      let query = db
        .selectFrom('containers')
        .leftJoin('sites', 'containers.current_site_id', 'sites.id')
        .leftJoin('companies', 'containers.owning_company_id', 'companies.id')
        .select([
          'containers.id',
          'containers.container_number',
          'containers.type',
          'containers.fill_level',
          'containers.current_site_id',
          'sites.name as site_name',
          'containers.owning_company_id',
          'companies.name as company_name',
        ])
        .where('containers.status', '=', 'active');

      if (site_id) query = query.where('containers.current_site_id', '=', site_id);
      if (company_id) query = query.where('containers.owning_company_id', '=', company_id);

      const containers = await query.execute();

      // Group by site and type
      const bySite = containers.reduce((acc, c) => {
        const key = c.current_site_id || 'unknown';
        if (!acc[key]) acc[key] = { siteName: c.site_name || 'Okänd', containers: [], total: 0, byFillLevel: { '0': 0, '25': 0, '50': 0, '75': 0, '100': 0 } };
        acc[key].containers.push(c);
        acc[key].total++;
        const fillLevelKey = c.fill_level as '0' | '25' | '50' | '75' | '100';
        acc[key].byFillLevel[fillLevelKey]++;
        return acc;
      }, {} as Record<string, { siteName: string; containers: typeof containers; total: number; byFillLevel: Record<string, number> }>);

      return { report: Object.entries(bySite).map(([siteId, data]) => ({ siteId, ...data })), dateRange: { from: date_from, to: date_to } };
    }
  );

  // Driver efficiency report
  app.post<{ Body: z.infer<typeof import('@avc/shared-types/api').driverEfficiencyReportSchema> }>(
    '/driver-efficiency',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const { driver_id, date_from, date_to } = request.body;

      let query = db
        .selectFrom('transport_orders')
        .leftJoin('users', 'transport_orders.assigned_driver_id', 'users.id')
        .select([
          'transport_orders.id',
          'transport_orders.status',
          'transport_orders.planned_start_at',
          'transport_orders.actual_start_at',
          'transport_orders.completed_at',
          'transport_orders.assigned_driver_id',
          'users.full_name as driver_name',
        ])
        .where('transport_orders.status', '=', 'completed');

      if (driver_id) query = query.where('transport_orders.assigned_driver_id', '=', driver_id);
      if (date_from) query = query.where('transport_orders.completed_at', '>=', new Date(date_from));
      if (date_to) query = query.where('transport_orders.completed_at', '<=', new Date(date_to));

      const orders = await query.execute();

      // Calculate metrics per driver
      const byDriver = orders.reduce((acc, o) => {
        const key = o.assigned_driver_id || 'unassigned';
        if (!acc[key]) acc[key] = { driverId: o.assigned_driver_id, driverName: o.driver_name || 'Okänd', orders: [], totalDuration: 0, completed: 0 };
        acc[key].orders.push(o);
        if (o.actual_start_at && o.completed_at) {
          const duration = new Date(o.completed_at).getTime() - new Date(o.actual_start_at).getTime();
          acc[key].totalDuration += duration;
        }
        acc[key].completed++;
        return acc;
      }, {} as Record<string, { driverId: string | null; driverName: string; orders: typeof orders; totalDuration: number; completed: number }>);

      const report = Object.entries(byDriver).map(([driverId, data]) => ({
        driverId,
        driverName: data.driverName,
        ordersCompleted: data.completed,
        avgDurationHours: data.completed > 0 ? data.totalDuration / data.completed / 1000 / 60 / 60 : 0,
        orders: data.orders.map(o => ({
          id: o.id,
          plannedStart: o.planned_start_at,
          actualStart: o.actual_start_at,
          completedAt: o.completed_at,
        })),
      }));

      return { report, dateRange: { from: date_from, to: date_to } };
    }
  );

  // Transport order throughput
  app.get<{ Querystring: { date_from?: string; date_to?: string } }>(
    '/throughput',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const { date_from, date_to } = request.query;

      let query = db
        .selectFrom('transport_orders')
        .select([
          'status',
          (eb) => eb.fn.count('id').as('count')
        ])
        .groupBy('status');

      if (date_from) query = query.where('created_at', '>=', new Date(date_from));
      if (date_to) query = query.where('created_at', '<=', new Date(date_to));

      const statusCounts = await query.execute();

      // Orders by site
      const ordersBySite = await db
        .selectFrom('transport_orders')
        .leftJoin('transport_order_stops', 'transport_orders.id', 'transport_order_stops.order_id')
        .leftJoin('sites', 'transport_order_stops.site_id', 'sites.id')
        .select([
          'sites.id as site_id',
          'sites.name as site_name',
          (eb) => eb.fn.count('transport_orders.id').as('count')
        ])
        .where('transport_order_stops.stop_type', '=', 'pickup')
        .groupBy(['sites.id', 'sites.name'])
        .execute();

      return { statusCounts, ordersBySite, dateRange: { from: date_from, to: date_to } };
    }
  );

  // Maintenance compliance report
  app.get<{ Querystring: { date_from?: string; date_to?: string } }>(
    '/maintenance-compliance',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const { date_from, date_to } = request.query;

      let query = db
        .selectFrom('maintenance_tasks')
        .leftJoin('containers', 'maintenance_tasks.container_id', 'containers.id')
        .select([
          'maintenance_tasks.status',
          (eb) => eb.fn.count('maintenance_tasks.id').as('count')
        ])
        .groupBy('maintenance_tasks.status');

      if (date_from) query = query.where('maintenance_tasks.scheduled_for', '>=', new Date(date_from));
      if (date_to) query = query.where('maintenance_tasks.scheduled_for', '<=', new Date(date_to));

      const statusCounts = await query.execute();

      // Overdue by container type
      const overdueByType = await db
        .selectFrom('maintenance_tasks')
        .leftJoin('containers', 'maintenance_tasks.container_id', 'containers.id')
        .select([
          'containers.type',
          (eb) => eb.fn.count('maintenance_tasks.id').as('count')
        ])
        .where('maintenance_tasks.scheduled_for', '<=', new Date())
        .where('maintenance_tasks.status', '!=', 'completed')
        .groupBy('containers.type')
        .execute();

      return { statusCounts, overdueByType, dateRange: { from: date_from, to: date_to } };
    }
  );
}