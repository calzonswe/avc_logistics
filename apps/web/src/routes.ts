// Route path table for the four role views.
//
// IMPORTANT: these paths are RELATIVE to their role section root
// ("/manager/*", "/dashboard/*", "/driver/*", "/worker/*"). React Router strips
// the parent route's pathBase before matching the nested <Routes>, so an
// absolute child path (e.g. "/manager/containers") never matches the URL
// "/manager/containers" — the content area then renders completely empty
// (no error, just a white/grey body next to the sidebar).
//
// `src/__tests__/routing.test.ts` locks this invariant.
export const MANAGER_PATHS = {
  index: '',
  containers: 'containers',
  transportOrders: 'transport-orders',
  sites: 'sites',
  vehicles: 'vehicles',
  drivers: 'drivers',
  maintenance: 'maintenance',
  incidents: 'incidents',
  reports: 'reports',
  map: 'map',
  settings: 'settings',
} as const;

export const DASHBOARD_PATHS = {
  index: '',
  site: ':siteId',
} as const;

/** Section roots (used as the splat parent routes in App.tsx). */
export const ROLE_SECTIONS = {
  manager: '/manager/*',
  dashboard: '/dashboard/*',
  driver: '/driver/*',
  worker: '/worker/*',
} as const;

/** Every URL that must resolve to a route (used by the routing regression test). */
export const KNOWN_URLS: Array<{ section: keyof typeof ROLE_SECTIONS; url: string }> = [
  { section: 'manager', url: '/manager' },
  { section: 'manager', url: '/manager/containers' },
  { section: 'manager', url: '/manager/transport-orders' },
  { section: 'manager', url: '/manager/sites' },
  { section: 'manager', url: '/manager/vehicles' },
  { section: 'manager', url: '/manager/drivers' },
  { section: 'manager', url: '/manager/maintenance' },
  { section: 'manager', url: '/manager/incidents' },
  { section: 'manager', url: '/manager/reports' },
  { section: 'manager', url: '/manager/map' },
  { section: 'manager', url: '/manager/settings' },
  { section: 'dashboard', url: '/dashboard' },
  { section: 'dashboard', url: '/dashboard/8a28569b-9628-45d4-aca0-3d482d7e48ad' },
  { section: 'driver', url: '/driver' },
  { section: 'worker', url: '/worker' },
];
