// Database Seed Script — demo data useful for every role view.
// Deterministic (no randomness) so demos and acceptance walkthroughs are repeatable.
import { db } from '../db/index.js';
import bcrypt from 'bcrypt';
import { config } from '../config/index.js';
import { createSiteMapPng } from './placeholderMap.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

async function seed() {
  console.log('Seeding database...');

  try {
    // Check if already seeded
    const existingCompanies = await db.selectFrom('companies').select('id').executeTakeFirst();
    if (existingCompanies) {
      console.log('Database already seeded, skipping...');
      return;
    }

    // ---------------------------------------------------------------- Companies
    const companies = await db
      .insertInto('companies')
      .values([
        { name: 'AVC Recycling AB', description: 'Huvudenhet för återvinning' },
        { name: 'AVC Transport AB', description: 'Transport och logistik' },
        { name: 'AVC Miljö AB', description: 'Miljötjänster' },
      ] as any)
      .returningAll()
      .execute();
    console.log(`Created ${companies.length} companies`);

    // ---------------------------------------------------------------- Sites
    const sites = await db
      .insertInto('sites')
      .values([
        { name: 'AVC Centralterminal', address: 'Industrivägen 1, 123 45 Staden', gps_lat: 59.3293, gps_lng: 18.0686, is_active: true },
        { name: 'AVC Norr', address: 'Norrvägen 10, 123 46 Staden', gps_lat: 59.34, gps_lng: 18.07, is_active: true },
        { name: 'AVC Söder', address: 'Södervägen 5, 123 47 Staden', gps_lat: 59.31, gps_lng: 18.06, is_active: true },
      ] as any)
      .returningAll()
      .execute();
    console.log(`Created ${sites.length} sites`);

    // ---------------------------------------------------------------- Site map image
    // The main site gets a generated site plan so the map editor and the site
    // dashboard map have a real image to draw on. The file is written to the
    // same folder the upload route uses (<UPLOAD_DIR>/maps) and is served as
    // /uploads/maps/<file>.
    const mapFileName = `seed-${sites[0].id}.png`;
    const mapDir = join(process.cwd(), config.UPLOAD_DIR, 'maps');
    mkdirSync(mapDir, { recursive: true });
    writeFileSync(join(mapDir, mapFileName), createSiteMapPng());
    await db
      .updateTable('sites')
      .set({ map_image_url: `/uploads/maps/${mapFileName}` })
      .where('id', '=', sites[0].id)
      .execute();
    console.log(`Created map image /uploads/maps/${mapFileName}`);

    // ---------------------------------------------------------------- Waste categories
    for (const site of sites) {
      await db
        .insertInto('waste_categories')
        .values([
          { site_id: site.id, name: 'Trä', description: 'Träavfall', color_hex: '#8B4513', sort_order: 1 },
          { site_id: site.id, name: 'Metall', description: 'Metallskrot', color_hex: '#708090', sort_order: 2 },
          { site_id: site.id, name: 'Plast', description: 'Plastförpackningar', color_hex: '#FF69B4', sort_order: 3 },
          { site_id: site.id, name: 'Papper', description: 'Papper och kartong', color_hex: '#F5F5DC', sort_order: 4 },
          { site_id: site.id, name: 'Trädgård', description: 'Trädgårdsavfall', color_hex: '#228B22', sort_order: 5 },
          { site_id: site.id, name: 'Blandat', description: 'Blandat avfall', color_hex: '#808080', sort_order: 6 },
          { site_id: site.id, name: 'Farligt', description: 'Farligt avfall', color_hex: '#FF0000', sort_order: 7 },
        ] as any)
        .execute();
    }
    console.log('Created waste categories for all sites');

    // ---------------------------------------------------------------- Zones + parking spots
    for (const site of sites) {
      const zones = await db
        .insertInto('zones')
        .values([
          { site_id: site.id, name: 'Inkörning', description: 'Inkörningszon', color_hex: '#3B82F6', sort_order: 1 },
          { site_id: site.id, name: 'Lager A', description: 'Lagerzon A', color_hex: '#10B981', sort_order: 2 },
          { site_id: site.id, name: 'Lager B', description: 'Lagerzon B', color_hex: '#F59E0B', sort_order: 3 },
          { site_id: site.id, name: 'Utkörning', description: 'Utkörningszon', color_hex: '#EF4444', sort_order: 4 },
        ] as any)
        .returningAll()
        .execute();

      // Create parking spots in each zone
      for (const zone of zones) {
        const spots = [];
        for (let i = 1; i <= 5; i++) {
          spots.push({
            zone_id: zone.id,
            spot_code: `${zone.name.charAt(0)}-${String(i).padStart(2, '0')}`,
            position_x: 10 + i * 15,
            position_y: (zones.indexOf(zone) + 1) * 20,
            allowed_container_types: ['open_top', 'closed', 'roll_off'],
            is_active: true,
          });
        }
        await db.insertInto('parking_spots').values(spots as any).execute();

        // The zone polygon (GeoJSON, coordinates as image-percentages 0-100)
        // is derived from the zone's spots so the dashboard map and the map
        // editor show the zone outline right away.
        const xs = spots.map((s) => s.position_x);
        const ys = spots.map((s) => s.position_y);
        const minX = Math.max(0, Math.min(...xs) - 8);
        const maxX = Math.min(100, Math.max(...xs) + 8);
        const minY = Math.max(0, Math.min(...ys) - 8);
        const maxY = Math.min(100, Math.max(...ys) + 8);
        const polygon = {
          type: 'Polygon',
          coordinates: [[
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY],
            [minX, minY],
          ]],
        };
        await db
          .updateTable('zones')
          .set({ polygon_geojson: polygon as any })
          .where('id', '=', zone.id)
          .execute();
      }
    }
    console.log('Created zones and parking spots for all sites');

    // ---------------------------------------------------------------- Ramps
    for (const site of sites) {
      const wasteCategories = await db
        .selectFrom('waste_categories')
        .select(['id', 'name'])
        .where('site_id', '=', site.id)
        .execute();

      const rampData = wasteCategories.slice(0, 4).map((wc, index) => ({
        site_id: site.id,
        name: `Ramp ${index + 1} - ${wc.name}`,
        waste_category_id: wc.id,
        position_x: 5 + index * 20,
        position_y: 5,
        is_active: true,
      }));

      await db.insertInto('ramps').values(rampData as any).execute();
    }
    console.log('Created ramps for all sites');

    // ---------------------------------------------------------------- Pits
    // Main site pit sits exactly at the 75% alert threshold (demo for pit alert,
    // per GLOSSARY: pits raise their alert at 75%).
    const allPits: Array<{ id: string; site_id: string; name: string }> = [];
    for (const [siteIndex, site] of sites.entries()) {
      const pitFill = siteIndex === 0 ? '75' : '25';
      const sitePits = await db
        .insertInto('pits')
        .values([
          { site_id: site.id, name: 'Trädgårdsgrop 1', material_type: 'Trädgårdsavfall', capacity_cubic_meters: 50, position_x: 80, position_y: 80, fill_level: pitFill, alert_threshold: '75', is_active: true },
          { site_id: site.id, name: 'Byggavfallsgrop', material_type: 'Byggavfall', capacity_cubic_meters: 30, position_x: 85, position_y: 70, fill_level: siteIndex === 0 ? '50' : '0', alert_threshold: '75', is_active: true },
        ] as any)
        .returningAll()
        .execute();
      allPits.push(...sitePits);
    }
    console.log('Created pits for all sites (main site pit at 75%)');

    // ---------------------------------------------------------------- Vehicles
    const vehicles = await db
      .insertInto('vehicles')
      .values([
        { registration_number: 'ABC 123', name: 'Lastbil 1', type: 'Hook lift', manufacturer: 'Volvo', model: 'FH16', year: 2022, classification: 'transport', max_containers: 2, is_active: true },
        { registration_number: 'DEF 456', name: 'Lastbil 2', type: 'Skip loader', manufacturer: 'Scania', model: 'R450', year: 2021, classification: 'transport', max_containers: 1, is_active: true },
        { registration_number: 'GHI 789', name: 'Terminalvagn', type: 'Terminal tractor', manufacturer: 'Kalmar', model: 'T2', year: 2023, classification: 'location_bound', home_site_id: sites[0].id, max_containers: 1, is_active: true },
      ] as any)
      .returningAll()
      .execute();
    console.log(`Created ${vehicles.length} vehicles`);

    // ---------------------------------------------------------------- Users
    const adminHash = await bcrypt.hash('admin123', config.BCRYPT_ROUNDS);
    const managerHash = await bcrypt.hash('manager123', config.BCRYPT_ROUNDS);
    const driverHash = await bcrypt.hash('driver123', config.BCRYPT_ROUNDS);
    const workerHash = await bcrypt.hash('worker123', config.BCRYPT_ROUNDS);

    const admin = await db
      .insertInto('users')
      .values({
        email: 'admin@avc.local',
        password_hash: adminHash,
        full_name: 'Systemadministratör',
        role: 'admin',
        is_active: true,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    const manager = await db
      .insertInto('users')
      .values({
        email: 'manager@avc.local',
        password_hash: managerHash,
        full_name: 'Platschef Maria Lindqvist',
        role: 'manager',
        site_id: sites[0].id,
        is_active: true,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    const drivers = await db
      .insertInto('users')
      .values([
        { email: 'driver1@avc.local', password_hash: driverHash, full_name: 'Erik Andersson', role: 'driver', site_id: sites[0].id, is_active: true },
        { email: 'driver2@avc.local', password_hash: driverHash, full_name: 'Maria Svensson', role: 'driver', site_id: sites[1].id, is_active: true },
        { email: 'driver3@avc.local', password_hash: driverHash, full_name: 'Johan Nilsson', role: 'driver', site_id: sites[2].id, is_active: true },
      ] as any)
      .returningAll()
      .execute();

    await db
      .insertInto('users')
      .values([
        { email: 'worker1@avc.local', password_hash: workerHash, full_name: 'Anna Karlsson', role: 'worker', site_id: sites[0].id, is_active: true },
        { email: 'worker2@avc.local', password_hash: workerHash, full_name: 'Per Johansson', role: 'worker', site_id: sites[1].id, is_active: true },
        { email: 'worker3@avc.local', password_hash: workerHash, full_name: 'Lisa Olsson', role: 'worker', site_id: sites[2].id, is_active: true },
      ] as any)
      .execute();

    console.log(`Created users: ${admin.email}, ${manager.email}, ${drivers.length} drivers, 3 workers`);
    console.log('Demo logins: admin@avc.local/admin123 · manager@avc.local/manager123 · driver1@avc.local/driver123 · worker1@avc.local/worker123');

    // ---------------------------------------------------------------- Containers
    // Spread containers across sites and give every container a DISTINCT spot
    // (GLOSSARY rule: a parking spot holds at most one container).
    const containerTypes = ['open_top', 'closed', 'compactor', 'roll_off'];
    const fillLevels = ['0', '25', '50', '75', '100'] as const;
    const containersPerSite = [8, 6, 6];
    const containerData = [];
    let containerSeq = 0;

    for (const [siteIndex, site] of sites.entries()) {
      const siteSpots = await db
        .selectFrom('parking_spots')
        .innerJoin('zones', 'parking_spots.zone_id', 'zones.id')
        .select('parking_spots.id')
        .where('zones.site_id', '=', site.id)
        .where('parking_spots.is_active', '=', true)
        .orderBy('zones.sort_order')
        .orderBy('parking_spots.spot_code')
        .execute();

      for (let i = 0; i < containersPerSite[siteIndex]; i++) {
        containerSeq += 1;
        const type = containerTypes[containerSeq % containerTypes.length];
        const prefix = type === 'open_top' ? 'OT' : type === 'closed' ? 'CL' : type === 'compactor' ? 'CP' : 'RO';
        const company = companies[containerSeq % companies.length];
        // deterministic, evenly spread fill levels (0/25/50/75/100)
        const fillLevel = fillLevels[containerSeq % fillLevels.length];
        const spot = siteSpots[i]; // distinct spot per container

        containerData.push({
          container_number: `${prefix}-${String(containerSeq).padStart(5, '0')}`,
          qr_code_value: `CONT-${String(containerSeq).padStart(6, '0')}`,
          type,
          owning_company_id: company.id,
          current_site_id: site.id,
          current_spot_id: spot?.id ?? null,
          fill_level: fillLevel,
          maintenance_interval_months: 6,
          last_maintenance_at: daysAgo(30 + (containerSeq % 5) * 45),
          status: 'active',
        });
      }
    }

    const insertedContainers: Array<{ id: string; container_number: string; type: string}> = await db
      .insertInto('containers')
      .values(containerData as any)
      .returningAll()
      .execute();
    console.log(`Created ${insertedContainers.length} containers, one per parking spot`);

    // ---------------------------------------------------------------- Transport orders
    const year = new Date().getFullYear();
    const mainContainers = insertedContainers.slice(0, 8);

    const createOrder = async (opts: {
      order_number: string;
      status: 'planned' | 'assigned' | 'in_progress' | 'completed';
      driver?: { id: string };
      vehicle?: { id: string };
      plannedStart: Date;
      actualStart?: Date;
      completed?: Date;
      notes?: string;
      pickupSite: (typeof sites)[number];
      dropoffSite: (typeof sites)[number];
      pickupContainers: Array<{ id: string }>;
    }) => {
      const [order] = await db
        .insertInto('transport_orders')
        .values({
          order_number: opts.order_number,
          status: opts.status,
          planned_by: admin.id,
          assigned_driver_id: opts.driver?.id ?? null,
          assigned_vehicle_id: opts.vehicle?.id ?? null,
          planned_start_at: opts.plannedStart,
          actual_start_at: opts.actualStart ?? null,
          completed_at: opts.completed ?? null,
          notes: opts.notes ?? null,
        } as any)
        .returningAll()
        .execute();

      const [pickupStop, dropoffStop] = await db
        .insertInto('transport_order_stops')
        .values([
          { order_id: order.id, sequence: 1, site_id: opts.pickupSite.id, stop_type: 'pickup', planned_at: opts.plannedStart },
          { order_id: order.id, sequence: 2, site_id: opts.dropoffSite.id, stop_type: 'dropoff', planned_at: new Date(opts.plannedStart.getTime() + 90 * 60 * 1000) },
        ] as any)
        .returningAll()
        .execute();

      // The same containers are linked to both stops: they are picked up at the
      // first stop and delivered at the second (loaded_at / unloaded_at mark
      // which end of the journey a link belongs to).
      await db.insertInto('transport_order_containers').values([
        ...opts.pickupContainers.map((c) => ({ order_id: order.id, stop_id: pickupStop.id, container_id: c.id })),
        ...opts.pickupContainers.map((c) => ({ order_id: order.id, stop_id: dropoffStop.id, container_id: c.id })),
      ] as any).execute();

      return order;
    };

    await createOrder({
      order_number: `TO-${year}-00001`,
      status: 'planned',
      plannedStart: daysFromNow(2),
      notes: 'Obehandlad order — inget fordon eller förare tilldelad än.',
      pickupSite: sites[0],
      dropoffSite: sites[1],
      pickupContainers: mainContainers.slice(0, 2),
    });
    const assignedPlannedOrder = await createOrder({
      order_number: `TO-${year}-00002`,
      // Driver + vehicle assigned -> the order is 'assigned' (the driver can
      // start it from the Driver App).
      status: 'assigned',
      driver: drivers[0],
      vehicle: vehicles[0],
      plannedStart: daysFromNow(1),
      notes: 'Tilldelad föraren Erik, start imorgon förmiddag.',
      pickupSite: sites[0],
      dropoffSite: sites[2],
      pickupContainers: mainContainers.slice(2, 4),
    });
    const inProgressOrder = await createOrder({
      order_number: `TO-${year}-00003`,
      status: 'in_progress',
      driver: drivers[0],
      vehicle: vehicles[0],
      plannedStart: daysAgo(0),
      actualStart: new Date(Date.now() - 45 * 60 * 1000),
      notes: 'Pågår just nu — godakhämtning pågår.',
      pickupSite: sites[0],
      dropoffSite: sites[1],
      pickupContainers: mainContainers.slice(4, 6),
    });
    const completedOrder = await createOrder({
      order_number: `TO-${year}-00004`,
      status: 'completed',
      driver: drivers[1],
      vehicle: vehicles[1],
      plannedStart: daysAgo(2),
      actualStart: daysAgo(2),
      completed: daysAgo(2),
      notes: 'Genomförd i går — arkiveras vid nästa veckostängning.',
      pickupSite: sites[1],
      dropoffSite: sites[0],
      pickupContainers: insertedContainers.slice(8, 10),
    });
    console.log('Created 4 transport orders (planned/planned/in_progress/completed)');

    // ---------------------------------------------------------------- Maintenance tasks
    // Containers lacking recent maintenance get scheduled tasks (4 real targets).
    const maintenanceTargets = insertedContainers.filter((_, idx) => idx % 5 === 0).slice(0, 4);
    const maintenanceRows: Array<{ type: string; status: string; scheduledFor: Date; description: string; resolution?: string }> = [
      { type: 'condition_based', status: 'overdue', scheduledFor: daysAgo(5), description: 'Kompressor läcker olja — besiktigas och repareras.' },
      { type: 'scheduled', status: 'due', scheduledFor: daysFromNow(3), description: 'Ordinärt sexmånadersunderhåll.' },
      { type: 'scheduled', status: 'due', scheduledFor: daysFromNow(10), description: 'Kontrolla dörrar och låsmekanism.' },
      { type: 'scheduled', status: 'completed', scheduledFor: daysAgo(40), description: 'Genomfört ordinärt underhåll.', resolution: 'Bonat dörrar, bytt brickor.' },
    ];

    const createdTasks: Array<{ id: string; status: string }> = [];
    for (const [i, target] of maintenanceTargets.entries()) {
      const row = maintenanceRows[i % maintenanceRows.length];
      const [task] = await db.insertInto('maintenance_tasks').values({
        container_id: target.id,
        type: row.type,
        status: row.status,
        scheduled_for: row.scheduledFor,
        assigned_to: null,
        created_by: manager.id,
        description: row.description,
        resolution: row.resolution ?? null,
        started_at: row.status === 'completed' ? row.scheduledFor : null,
        completed_at: row.status === 'completed' ? row.scheduledFor : null,
      } as any).returningAll().execute();
      createdTasks.push(task);
    }
    console.log(`Created ${maintenanceTargets.length} maintenance tasks (1 overdue, 2 due, 1 completed)`);

    // ---------------------------------------------------------------- Damage reports
    const damageReports = await db
      .insertInto('damage_reports')
      .values([
        {
          container_id: insertedContainers[0].id,
          reported_by: drivers[0].id,
          severity: 'major',
          description: 'Sidodörr lossnar från gångjärnet vid lastning.',
          status: 'open',
        },
        {
          container_id: insertedContainers[3].id,
          reported_by: drivers[0].id,
          severity: 'minor',
          description: 'Mindre buckla på vänster sida, inga funktionella problem.',
          status: 'open',
        },
      ] as any)
      .returningAll()
      .execute();
    console.log(`Created ${damageReports.length} damage reports`);

    // Per GLOSSARY, a 'major' damage report triggers a condition-based
    // maintenance task (the API does this automatically on create — the seed
    // mirrors it so demo data is consistent).
    const majorReport = damageReports.find((r) => r.severity === 'major');
    if (majorReport) {
      await db
        .insertInto('maintenance_tasks')
        .values({
          container_id: majorReport.container_id,
          type: 'condition_based',
          status: 'due',
          scheduled_for: new Date(Date.now() + 48 * 3600 * 1000),
          description: `Tillståndsbaserat underhåll utlöst av major skaderapport: ${majorReport.description}`,
          created_by: drivers[0].id,
          damage_report_id: majorReport.id,
        } as any)
        .execute();
      console.log('Created 1 condition-based maintenance task for the major damage report');
    }

    // ---------------------------------------------------------------- Notifications
    // In-app notifications so the bell (ticket 11) and web-push (ticket 13) have real content.
    const pit75 = allPits.find((p) => p.site_id === sites[0].id && p.name === 'Trädgårdsgrop 1') ?? allPits[0];
    const overdueTask = createdTasks.find((t) => t.status === 'overdue') ?? createdTasks[0];

    await db.insertInto('notifications').values([
      {
        user_id: drivers[0].id,
        type: 'order_assigned',
        title: 'Ny order tilldelad',
        message: `Du har fått transportorder ${assignedPlannedOrder.order_number}, start imorgon.`,
        related_entity_type: 'transport_order',
        related_entity_id: assignedPlannedOrder.id,
      },
      {
        user_id: drivers[0].id,
        type: 'order_assigned',
        title: 'Order pågår',
        message: `${inProgressOrder.order_number} är påbörjad — fortsätt enligt stoppordning.`,
        related_entity_type: 'transport_order',
        related_entity_id: inProgressOrder.id,
      },
      {
        user_id: manager.id,
        type: 'pit_alert',
        title: 'Grop når 75 %',
        message: `Grop "${pit75.name}" på ${sites[0].name} har nått 75 % fyllnad.`,
        related_entity_type: 'pit',
        related_entity_id: pit75.id,
      },
      {
        user_id: manager.id,
        type: 'damage_reported',
        title: 'Skadeanmälan skapad',
        message: 'Allvarlig skada anmäld: sidodörr lossnar vid lastning. Kräver åtgärd.',
        related_entity_type: 'damage_report',
        related_entity_id: damageReports[0].id,
      },
      {
        user_id: manager.id,
        type: 'maintenance_due',
        title: 'Underhåll försenat',
        message: 'En underhållsuppgift har passerat sitt schemalagda datum.',
        related_entity_type: 'maintenance_task',
        related_entity_id: overdueTask.id,
      },
      {
        user_id: admin.id,
        type: 'order_updated',
        title: 'Order slutförd',
        message: `${completedOrder.order_number} har slutförts av Maria Svensson.`,
        related_entity_type: 'transport_order',
        related_entity_id: completedOrder.id,
      },
    ] as any).execute();
    console.log('Created notifications for manager, admin and driver1');

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

seed();
