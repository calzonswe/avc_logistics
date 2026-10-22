// App - Main App Component with Routing
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@avc/ui/components/Layout';
import { useAuthStore } from './stores/authStore';
import { Loader } from './components/Loader';
import { roleHome } from './utils/roleHome';
import {
  MANAGER_PATHS,
  DASHBOARD_PATHS,
  ROLE_SECTIONS,
} from './routes';

// Views
import { LoginPage } from './pages/auth/LoginPage';
import { ManagerDashboard } from './pages/manager/Dashboard';
import { ContainersPage } from './pages/manager/ContainersPage';
import { TransportOrdersPage } from './pages/manager/TransportOrdersPage';
import { SitesPage } from './pages/manager/SitesPage';
import { VehiclesPage } from './pages/manager/VehiclesPage';
import { DriversPage } from './pages/manager/DriversPage';
import { MaintenancePage } from './pages/manager/MaintenancePage';
import { IncidentsPage } from './pages/manager/IncidentsPage';
import { NotificationBell } from './components/NotificationBell';
import { useAppEvents } from './hooks/useAppEvents';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import { useSync } from '@avc/ui/hooks/useSync';
import { useToast } from '@avc/ui/hooks/useToast';
import { ReportsPage } from './pages/manager/ReportsPage';
import { SettingsPage } from './pages/manager/SettingsPage';
import { SiteDashboardPage } from './pages/dashboard/SiteDashboardPage';
import { DriverPage } from './pages/driver/DriverPage';
import { WorkerPage } from './pages/worker/WorkerPage';
import { MapEditorPage } from './pages/manager/MapEditorPage';

// Logged-in users hitting /login bounce straight to their role view
const PublicOnlyLogin = () => {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  return <LoginPage />;
};

// Post-auth landing: role decides, not a hardcoded /manager
const RoleHomeRedirect = () => {
  const user = useAuthStore((s) => s.user);
  return <Navigate to={roleHome(user?.role)} replace />;
};

// Protected routes wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuthStore();

  if (isLoading) return <Loader message="Laddar..." />;

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

// Role-based routes
//
// NOTE: these are nested inside the splat routes ("/manager/*") in App(), so the
// child paths must be RELATIVE to that parent. With absolute child paths
// ("/manager/containers") React Router strips the parent's pathBase before
// matching ("/manager" -> "/") and the nested <Routes> silently renders
// nothing — a blank content area with only the sidebar visible.
const NotFoundPanel = ({ area }: { area: string }) => (
  <div className="rounded-xl bg-white shadow-sm p-8">
    <h1 className="text-xl font-semibold text-gray-900">Sidan hittades inte</h1>
    <p className="text-gray-500 mt-1">Det finns ingen sida under {area}. Kontrollera adressen eller använd menyn.</p>
  </div>
);

const ManagerRoutes = () => {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  if (user?.role !== 'admin' && user?.role !== 'manager') return <Navigate to="/dashboard" replace />;

  return (
    <Layout
      headerActions={
        <>
          <NotificationBell />
          <LanguageSwitcher />
        </>
      }
      sidebar={
        <nav className="space-y-1">
          <a href="/manager" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.overview')}</a>
          <a href="/manager/containers" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.containers')}</a>
          <a href="/manager/transport-orders" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.transportOrders')}</a>
          <a href="/manager/sites" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.sites')}</a>
          <a href="/manager/vehicles" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.vehicles')}</a>
          <a href="/manager/drivers" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.drivers')}</a>
          <a href="/manager/maintenance" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.maintenance')}</a>
          <a href="/manager/incidents" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.incidents')}</a>
          <a href="/manager/reports" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.reports')}</a>
          <a href="/manager/map" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.map')}</a>
          <a href="/manager/settings" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.manager.settings')}</a>
        </nav>
      }
    >
      <Routes>
        <Route index element={<ManagerDashboard />} />
        <Route path={MANAGER_PATHS.containers} element={<ContainersPage />} />
        <Route path={MANAGER_PATHS.transportOrders} element={<TransportOrdersPage />} />
        <Route path={MANAGER_PATHS.sites} element={<SitesPage />} />
        <Route path={MANAGER_PATHS.vehicles} element={<VehiclesPage />} />
        <Route path={MANAGER_PATHS.drivers} element={<DriversPage />} />
        <Route path={MANAGER_PATHS.maintenance} element={<MaintenancePage />} />
        <Route path={MANAGER_PATHS.incidents} element={<IncidentsPage />} />
        <Route path={MANAGER_PATHS.reports} element={<ReportsPage />} />
        <Route path={MANAGER_PATHS.map} element={<MapEditorPage />} />
        <Route path={MANAGER_PATHS.settings} element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPanel area="/manager" />} />
      </Routes>
    </Layout>
  );
};

const DashboardRoutes = () => {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const kiosk = searchParams.get('kiosk') === '1';
  if (!['admin', 'manager', 'worker'].includes(user?.role || '')) return <Navigate to="/driver" replace />;

  // Kiosk mode (ticket 10): a TV screen shows the dashboard without any app
  // chrome (no sidebar, no buttons) — the page renders fullscreen itself.
  if (kiosk) {
    return (
      <Routes>
        <Route index element={<SiteDashboardPage kiosk />} />
        <Route path={DASHBOARD_PATHS.site} element={<SiteDashboardPage kiosk />} />
        <Route path="*" element={<NotFoundPanel area="/dashboard" />} />
      </Routes>
    );
  }

  return (
    <Layout
      headerActions={
        <>
          <NotificationBell />
          <LanguageSwitcher />
        </>
      }
      sidebar={
        <nav className="space-y-1">
          <a href="/dashboard" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.dashboard')}</a>
          {user?.role === 'worker' && <a href="/worker" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.worker')}</a>}
        </nav>
      }
    >
      <Routes>
        <Route index element={<SiteDashboardPage />} />
        <Route path={DASHBOARD_PATHS.site} element={<SiteDashboardPage />} />
        <Route path="*" element={<NotFoundPanel area="/dashboard" />} />
      </Routes>
    </Layout>
  );
};

const DriverRoutes = () => {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  if (user?.role !== 'driver') return <Navigate to="/dashboard" replace />;

  return (
    <Layout
      headerActions={
        <>
          <NotificationBell />
          <LanguageSwitcher />
        </>
      }
      header={
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-900">{t('nav.manager.drivers')}</h1>
        </div>
      }
    >
      <Routes>
        <Route index element={<DriverPage />} />
        <Route path="*" element={<NotFoundPanel area="/driver" />} />
      </Routes>
    </Layout>
  );
};

const WorkerRoutes = () => {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  if (user?.role !== 'worker') return <Navigate to="/dashboard" replace />;

  return (
    <Layout
      headerActions={
        <>
          <NotificationBell />
          <LanguageSwitcher />
        </>
      }
      sidebar={
        <nav className="space-y-1">
          <a href="/dashboard" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.dashboard')}</a>
          <a href="/worker" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">{t('nav.worker')}</a>
        </nav>
      }
    >
      <Routes>
        <Route index element={<WorkerPage />} />
        <Route path="*" element={<NotFoundPanel area="/worker" />} />
      </Routes>
    </Layout>
  );
};

function App() {
  // Ticket 12: keeps the WebSocket connection open and feeds the app events
  // into the notification bell and the React Query caches. The app keeps
  // working on its polling intervals when the socket is unavailable.
  useAppEvents();

  // Ticket 14: a server-wins conflict overwrites the local copy — tell the user.
  const { showToast } = useToast();
  useSync({
    onConflict: (entityType) => {
      showToast({
        type: 'info',
        title: 'Data uppdaterad från servern',
        message: `En ändring av ${entityType} gjordes på en annan enhet och har ersatt din lokala version.`,
      });
    },
  });

  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyLogin />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Routes>
              <Route path={ROLE_SECTIONS.manager} element={<ManagerRoutes />} />
              <Route path={ROLE_SECTIONS.dashboard} element={<DashboardRoutes />} />
              <Route path={ROLE_SECTIONS.driver} element={<DriverRoutes />} />
              <Route path={ROLE_SECTIONS.worker} element={<WorkerRoutes />} />
              <Route path="*" element={<RoleHomeRedirect />} />
            </Routes>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;