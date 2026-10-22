// Site Dashboard Page - kiosk / mobile supervisor view (ticket 10)
//
// Two layouts over the same data:
//  - normal: the standard page inside the app chrome (desktop manager / mobile
//    supervisor on a phone)
//  - kiosk:  a fullscreen, chrome-free layout for a TV screen (?kiosk=1) —
//            large glanceable numbers, no controls, auto-refresh
//
// The map shows the zones (GeoJSON polygons), the containers on their spots
// (coloured by fill level) and the pits (coloured by fill level).
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { Card } from '@avc/ui/components/Card';
import { Button } from '@avc/ui/components/Button';
import { Select } from '@avc/ui/components/Select';
import { Loader } from '../../components/Loader';
import { Container, Trash2, MapPin, AlertTriangle, RefreshCw, Maximize2 } from 'lucide-react';
import { FillLevelIndicator, StatusBadge } from '@avc/ui/components';
import { useAuthStore } from '../../stores/authStore';
import { useTranslation } from 'react-i18next';

export function SiteDashboardPage({ siteId, kiosk = false }: { siteId?: string; kiosk?: boolean }) {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  // The site can come from the route (/dashboard/:siteId) — a kiosk on a TV
  // screen has no site picker, so the URL is the only source.
  const { siteId: routeSiteId } = useParams();
  const targetSiteId = siteId || routeSiteId || user?.site_id;
  const [selectedSiteId, setSelectedSiteId] = useState(targetSiteId || '');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['siteDashboard', selectedSiteId],
    queryFn: () => api.get(`/dashboard/site/${selectedSiteId}`).then((r) => r.data),
    enabled: !!selectedSiteId,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // The site picker (the site dashboard payload only covers one site).
  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data.data ?? r.data),
  });

  const siteName = data?.site_name || 'Okänd plats';
  const containers = data?.containers || [];
  const pits = data?.pits || [];

  const containersByFillLevel = {
    '100': containers.filter(c => c.fill_level === '100').length,
    '75': containers.filter(c => c.fill_level === '75').length,
    '50': containers.filter(c => c.fill_level === '50').length,
    '25': containers.filter(c => c.fill_level === '25').length,
    '0': containers.filter(c => c.fill_level === '0').length,
  };

  const pitsNeedingAttention = pits.filter(p => parseInt(p.fill_level || '0') >= 75).length;

  if (kiosk) {
    return (
      <KioskDashboard
        data={data}
        siteName={siteName}
        siteId={selectedSiteId}
        containers={containers}
        pits={pits}
        containersByFillLevel={containersByFillLevel}
        pitsNeedingAttention={pitsNeedingAttention}
        isLoading={isLoading}
      />
    );
  }

  if (!selectedSiteId) {
    return (
      <Card>
        <h2 className="text-xl font-semibold mb-4">{t('dashboard.title')}</h2>
        <p className="text-gray-500">{t('dashboard.selectSite')}</p>
      </Card>
    );
  }

  if (isLoading) return <Loader message="Laddar dashboard..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{siteName}</h1>
          <p className="text-gray-500">{t('dashboard.updated', { time: new Date().toLocaleTimeString() })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            options={[
              { value: '', label: 'Välj plats' },
              ...(sites ?? []).map((s: any) => ({ value: s.id, label: s.name })),
            ]}
            className="w-full sm:w-48"
          />
          <Button
            variant="outline"
            onClick={() => window.open(`/dashboard/${selectedSiteId}?kiosk=1`, '_blank')}
            icon={<Maximize2 className="w-4 h-4" />}
          >
            {t('dashboard.kiosk')}
          </Button>
          <Button variant="outline" onClick={() => refetch()} icon={<RefreshCw className="w-4 h-4" />}>
            Uppdatera
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title={t('dashboard.totalContainers')}
          value={containers.length}
          icon={<Container className="w-6 h-6" />}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <StatCard
          title={t('dashboard.full')}
          value={containersByFillLevel['100']}
          icon={<Container className="w-6 h-6" />}
          color="text-red-600"
          bgColor="bg-red-50"
          warning={containersByFillLevel['100'] > 0}
        />
        <StatCard
          title={t('dashboard.nearlyFull')}
          value={containersByFillLevel['75']}
          icon={<Container className="w-6 h-6" />}
          color="text-orange-600"
          bgColor="bg-orange-50"
          warning={containersByFillLevel['75'] > 0}
        />
        <StatCard
          title={t('dashboard.halfFull')}
          value={containersByFillLevel['50']}
          icon={<Container className="w-6 h-6" />}
          color="text-yellow-600"
          bgColor="bg-yellow-50"
        />
        <StatCard
          title={t('dashboard.pitsToEmpty')}
          value={pitsNeedingAttention}
          icon={<Trash2 className="w-6 h-6" />}
          color="text-red-600"
          bgColor="bg-red-50"
          warning={pitsNeedingAttention > 0}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold">{t('dashboard.containersByFill')}</h2>
            <div className="flex gap-2">
              <FillLevelLegend />
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {containers.map((container) => (
              <ContainerCard key={container.id} container={container} />
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-4">{t('dashboard.pits')}</h2>
          {pits.length > 0 ? (
            <div className="space-y-3">
              {pits.map((pit) => (
                <PitCard key={pit.id} pit={pit} />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">{t('dashboard.noPits')}</p>
          )}
        </Card>
      </div>

      {data?.map_image_url && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">{t('dashboard.map')}</h2>
          <MapView data={data} />
        </Card>
      )}
    </div>
  );
}

/**
 * Kiosk layout: fills the screen, no navigation, no controls — only the
 * numbers and the map. Refreshes itself every 30 seconds.
 */
function KioskDashboard({
  data,
  siteName,
  containers,
  pits,
  containersByFillLevel,
  pitsNeedingAttention,
  isLoading,
}: {
  data: any;
  siteName: string;
  siteId: string;
  containers: any[];
  pits: any[];
  containersByFillLevel: Record<string, number>;
  pitsNeedingAttention: number;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <Loader message="Laddar dashboard..." />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 text-white overflow-hidden flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{siteName}</h1>
          <p className="text-lg text-gray-400">
            {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}{' '}
            · {new Date().toLocaleTimeString('sv-SE')}
          </p>
        </div>
        <button
          onClick={toggleFullscreen}
          className="p-3 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
          aria-label="Fullskärm"
        >
          <Maximize2 className="w-6 h-6" />
        </button>
      </header>

      <div className="flex-1 grid grid-cols-2 lg:grid-cols-6 gap-4 p-6 overflow-hidden">
        <KioskStat label="Containrar" value={containers.length} tone="text-blue-300" />
        <KioskStat label="100%" value={containersByFillLevel['100']} tone="text-red-400" alert={containersByFillLevel['100'] > 0} />
        <KioskStat label="75%" value={containersByFillLevel['75']} tone="text-orange-400" alert={containersByFillLevel['75'] > 0} />
        <KioskStat label="50%" value={containersByFillLevel['50']} tone="text-yellow-300" />
        <KioskStat label="25%" value={containersByFillLevel['25']} tone="text-green-400" />
        <KioskStat label="Grop att tömma" value={pitsNeedingAttention} tone="text-red-400" alert={pitsNeedingAttention > 0} />
      </div>

      <div className="flex-1 grid lg:grid-cols-3 gap-4 px-6 pb-6 overflow-hidden">
        <div className="lg:col-span-2 bg-white/5 rounded-2xl p-4 overflow-hidden flex flex-col min-h-0">
          <h2 className="text-xl font-semibold mb-3 text-gray-200">{t('dashboard.map')}</h2>
          <div className="flex-1 min-h-0 overflow-hidden rounded-xl bg-gray-800">
            {data?.map_image_url ? (
              <MapView data={data} kiosk />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                {t('dashboard.noMapImage')}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/5 rounded-2xl p-4 overflow-y-auto min-h-0">
          <h2 className="text-xl font-semibold mb-3 text-gray-200">Gropar</h2>
          {pits.length === 0 ? (
            <p className="text-gray-500">Inga groper</p>
          ) : (
            <div className="space-y-3">
              {pits.map((pit) => {
                const fill = parseInt(pit.fill_level || '0');
                const alerting = fill >= 75;
                return (
                  <div
                    key={pit.id}
                    className={`p-4 rounded-xl ${alerting ? 'bg-red-500/20 border border-red-500/40' : 'bg-white/5'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-medium">{pit.name}</span>
                      <span className={`text-3xl font-bold ${alerting ? 'text-red-400' : 'text-green-400'}`}>{fill}%</span>
                    </div>
                    <p className="text-sm text-gray-400">{pit.material_type}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KioskStat({ label, value, tone, alert }: { label: string; value: number; tone: string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 flex flex-col justify-center ${alert ? 'bg-red-500/15 border border-red-500/30' : 'bg-white/5'}`}>
      <span className="text-lg text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-6xl font-bold ${tone}`}>{value}</span>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  bgColor,
  warning = false,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  warning?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card className={`p-6 ${warning && 'border-l-4 border-red-500'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${bgColor} ${color}`}>{icon}</div>
      </div>
    </Card>
  );
}

function FillLevelLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> 100%</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500" /> 75%</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500" /> 50%</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500" /> 25%</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-300" /> 0%</span>
    </div>
  );
}

function ContainerCard({ container }: { container: any }) {
  const { t } = useTranslation();
  const fillLevel = parseInt(container.fill_level || '0');
  const fillColor =
    fillLevel >= 100 ? 'bg-red-500' :
    fillLevel >= 75 ? 'bg-orange-500' :
    fillLevel >= 50 ? 'bg-yellow-500' :
    fillLevel >= 25 ? 'bg-green-500' :
    'bg-gray-300';

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{container.container_number}</span>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${fillColor} text-white`}>
          {fillLevel}%
        </span>
      </div>
      <div className="text-sm text-gray-600 space-y-1">
        <div>{t('dashboard.type')}: {container.type}</div>
        <div>{t('dashboard.spot')}: {container.zone_name || t('dashboard.unknownZone')}</div>
        {container.spot_code && <div>{t('dashboard.spot')}: {container.spot_code}</div>}
      </div>
    </div>
  );
}

function PitCard({ pit }: { pit: any }) {
  const { t } = useTranslation();
  const fillLevel = parseInt(pit.fill_level || '0');
  const isWarning = fillLevel >= 75;
  const fillColor = isWarning ? 'bg-red-500' : fillLevel >= 50 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className={`p-4 rounded-lg border ${isWarning ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{pit.name}</h3>
          <p className="text-sm text-gray-500">{pit.material_type}</p>
        </div>
        <div className="text-right">
          <div className={`flex items-center justify-end gap-2 ${isWarning ? 'text-red-600' : 'text-gray-600'}`}>
            <Trash2 className="w-5 h-5" />
            <span className="font-semibold text-lg">{fillLevel}%</span>
          </div>
          <p className="text-xs text-gray-500">{t('dashboard.capacity', { value: pit.capacity_cubic_meters })}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The map: the site image with the zone polygons (GeoJSON), the containers on
 * their spots (coloured by fill level) and the pits. Coordinates are stored as
 * percentages of the image (0-100), so markers land exactly where the map
 * editor placed them.
 */
function MapView({ data, kiosk = false }: { data: any; kiosk?: boolean }) {
  const markerSize = kiosk ? 'w-6 h-6' : 'w-3.5 h-3.5';
  const ring = kiosk ? 'ring-4 ring-white/40' : 'ring-2 ring-white/80';

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* The overlay wrapper shrink-wraps the image so the markers and the zone
          polygons line up with the *rendered* image box (the image is scaled to
          fit, so the box can be narrower than the container). */}
      <div className="relative inline-block max-h-full max-w-full">
        <img
          src={data.map_image_url}
          alt="Platskarta"
          className="block max-h-full max-w-full h-auto w-auto"
        />

        {/* Zones (GeoJSON polygons) */}
        {data.zones?.map((zone: any) => (
          <ZoneOverlay key={`zone-${zone.id}`} zone={zone} />
        ))}

        {/* Containers on their spots */}
        {data.containers?.map((container: any) => (
          <ContainerMarker key={`container-${container.id}`} container={container} size={markerSize} ring={ring} />
        ))}

        {/* Pits */}
        {data.pits?.map((pit: any) => (
          <PitMarker key={`pit-${pit.id}`} pit={pit} size={kiosk ? 'w-8 h-8' : 'w-4 h-4'} ring={ring} />
        ))}
      </div>

      {!kiosk && (
        <div className="absolute bottom-2 left-2 flex gap-3 text-xs text-gray-700 bg-white/85 px-2 py-1 rounded">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> Container 100%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500" /> 75%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500" /> 50%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500" /> 25%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-300" /> 0%</span>
        </div>
      )}
    </div>
  );
}

// Map overlay helpers. All map coordinates are stored as percentages of the map
// image (0-100) — the image above renders at its natural aspect ratio, so a
// marker at left: x% / top: y% sits exactly where the editor placed it.
const fillDotColor = (fillLevel: number): string =>
  fillLevel >= 100 ? 'bg-red-500' :
  fillLevel >= 75 ? 'bg-orange-500' :
  fillLevel >= 50 ? 'bg-yellow-500' :
  fillLevel >= 25 ? 'bg-green-500' :
  'bg-gray-300';

function ZoneOverlay({ zone }: { zone: any }) {
  // GeoJSON polygon whose coordinates are image-percentages (0-100), as saved
  // by the map editor. Rendered as a stretched SVG covering the image.
  const coords: number[][] = zone.polygon_geojson?.coordinates?.[0] ?? [];
  if (coords.length < 3) return null;

  const color: string = zone.color_hex || '#3b82f6';
  const avgX = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
  const avgY = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      <polygon
        points={coords.map((c) => `${c[0]},${c[1]}`).join(' ')}
        fill={`${color}55`}
        stroke={color}
        strokeWidth="0.4"
      />
      <text
        x={avgX}
        y={avgY}
        fontSize="3"
        textAnchor="middle"
        fill={color}
        fontWeight="600"
      >
        {zone.name}
      </text>
    </svg>
  );
}

function ContainerMarker({ container, size, ring }: { container: any; size: string; ring: string }) {
  // DECIMAL columns arrive as strings from the API — coerce before using them.
  const x = Number(container.position_x);
  const y = Number(container.position_y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const fillLevel = parseInt(container.fill_level || '0', 10);
  const tooltip = [
    container.container_number,
    container.zone_name ? `Zon: ${container.zone_name}` : null,
    container.spot_code ? `Plats: ${container.spot_code}` : null,
    `Fyllnadsgrad: ${fillLevel}%`,
  ].filter(Boolean).join(' — ');

  return (
    <div
      title={tooltip}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className={`block ${size} rounded-full ${fillDotColor(fillLevel)} border border-black/40 ${ring}`} />
    </div>
  );
}

function PitMarker({ pit, size, ring }: { pit: any; size: string; ring: string }) {
  const x = Number(pit.position_x);
  const y = Number(pit.position_y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const fillLevel = parseInt(pit.fill_level || '0', 10);
  const threshold = parseInt(pit.alert_threshold || '75', 10);
  const alerting = fillLevel >= threshold;
  const tooltip = [
    pit.name,
    pit.material_type,
    `Fyllnadsgrad: ${fillLevel}% (larmgräns ${threshold}%)`,
    alerting ? 'Larm — behöver tömning' : null,
  ].filter(Boolean).join(' — ');

  return (
    <div
      title={tooltip}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span
        className={`flex items-center justify-center ${size} rounded-full ${fillDotColor(fillLevel)} border ${alerting ? 'border-red-700 ring-4 ring-red-400/60 animate-pulse' : `border-black/40 ${ring}`}`}
      >
        <Trash2 className="w-1/2 h-1/2 text-white" />
      </span>
    </div>
  );
}
