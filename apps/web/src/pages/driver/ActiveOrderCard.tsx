// Active order card - the driver's step-by-step execution of a transport order.
//
// Lifecycle: start -> pickup -> dropoff -> complete. Every step calls
// /transport-orders/:id/execute through the driver service seam (so ticket 14
// can route it through the offline queue).
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@avc/ui/components/Card';
import { Button } from '@avc/ui/components/Button';
import { Select } from '@avc/ui/components/Select';
import { StatusBadge } from '@avc/ui/components';
import { QRScanner } from './QRScanner';
import { executeOrderStep, lookupContainerByQr, listSpots } from '../../services/driverApi';
import { Truck, MapPin, Package, CheckCircle, Navigation, Camera, AlertCircle } from 'lucide-react';

interface ActiveOrderCardProps {
  order: any;
  onChanged: () => void;
  isLoading?: boolean;
}

export function ActiveOrderCard({ order, onChanged, isLoading }: ActiveOrderCardProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [spotPerContainer, setSpotPerContainer] = useState<Record<string, string>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stops: any[] = order.stops ?? [];
  const doneStops = stops.filter((s) => s.actual_at);
  const nextStop = stops.find((s) => !s.actual_at) ?? null;
  const allDone = stops.length > 0 && doneStops.length === stops.length;
  const orderStatus = order.status as string;

  // Free spots at the dropoff site (for the target spot).
  const dropoffStop = nextStop?.stop_type === 'dropoff' ? nextStop : null;
  const { data: siteSpots } = useQuery({
    queryKey: ['driverSpots', dropoffStop?.site_id],
    queryFn: () => listSpots(dropoffStop!.site_id),
    enabled: !!dropoffStop?.site_id,
  });

  const spotOptions = useMemo(() => {
    const spots = (siteSpots ?? []) as any[];
    return spots
      .filter((s) => !s.occupied_by_container_id && s.is_active !== false)
      .map((s) => ({ value: s.id, label: `${s.spot_code}${s.zone_name ? ` · ${s.zone_name}` : ''}` }));
  }, [siteSpots]);

  const containers: any[] = nextStop?.containers ?? [];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSelected([]);
      setSpotPerContainer({});
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Något gick fel. Försök igen.');
    } finally {
      setBusy(false);
    }
  };

  const handleStart = () =>
    run(() =>
      executeOrderStep({
        orderId: order.id,
        action: 'start',
        stopId: stops[0]?.id,
        containerIds: (stops[0]?.containers ?? []).map((c: any) => c.container_id),
      })
    );

  const handlePickup = () =>
    run(() =>
      executeOrderStep({
        orderId: order.id,
        action: 'pickup',
        stopId: nextStop!.id,
        containerIds: selected,
      })
    );

  const handleDropoff = () =>
    run(() =>
      executeOrderStep({
        orderId: order.id,
        action: 'dropoff',
        stopId: nextStop!.id,
        containerIds: selected,
        // One parking spot per container (the DB allows only one container per
        // spot).
        containerSpots: selected.map((containerId) => ({
          container_id: containerId,
          spot_id: spotPerContainer[containerId] ?? '',
        })),
      })
    );

  const handleComplete = () =>
    run(() =>
      executeOrderStep({
        orderId: order.id,
        action: 'complete',
        stopId: nextStop?.id ?? stops[stops.length - 1]?.id,
        containerIds: [],
      })
    );

  // A scanned QR code identifies a container and pre-fills the step.
  const handleScan = async (text: string) => {
    try {
      const container = await lookupContainerByQr(text);
      const known = containers.some((c) => c.container_id === container.id);
      if (!known) {
        setError(`Containern ${container.container_number} ingår inte i detta stopp.`);
        return;
      }
      setSelected((prev) => (prev.includes(container.id) ? prev : [...prev, container.id]));
      setError(null);
    } catch {
      setError('QR-koden kunde inte kopplas till en container.');
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  return (
    <Card className="border-blue-200 bg-blue-50">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{order.order_number}</h2>
          <p className="text-sm text-gray-600">
            {order.vehicle_name ?? order.vehicle_registration ?? 'Inget fordon'}
            {order.vehicle_registration ? ` (${order.vehicle_registration})` : ''}
          </p>
        </div>
        <StatusBadge status={orderStatus as any} />
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step list */}
      <ol className="space-y-2 mb-4">
        {stops.map((stop: any) => {
          const isNext = nextStop?.id === stop.id;
          return (
            <li
              key={stop.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                isNext ? 'border-blue-300 bg-white' : 'border-gray-200 bg-white/60'
              }`}
            >
              <span className="mt-0.5">
                {stop.actual_at ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <MapPin className="w-5 h-5 text-gray-400" />
                )}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {stop.sequence}. {stop.stop_type === 'pickup' ? 'Upphämtning' : 'Avlämning'} — {stop.site_name}
                </p>
                <p className="text-xs text-gray-600">
                  {(stop.containers ?? []).map((c: any) => c.container_number).join(', ') || 'Inga containrar'}
                </p>
                {stop.actual_at && (
                  <p className="text-xs text-green-700">Utförd {new Date(stop.actual_at).toLocaleTimeString('sv-SE')}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Action area */}
      {orderStatus === 'planned' || orderStatus === 'assigned' ? (
        <Button onClick={handleStart} disabled={busy || isLoading} loading={busy} icon={<Truck className="w-4 h-4" />}>
          {t('driver.startOrder')}
        </Button>
      ) : orderStatus === 'in_progress' && allDone ? (
        <Button onClick={handleComplete} disabled={busy || isLoading} loading={busy} icon={<CheckCircle className="w-4 h-4" />}>
          {t('driver.completeOrder')}
        </Button>
      ) : orderStatus === 'in_progress' && nextStop ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              {nextStop.stop_type === 'pickup' ? t('driver.confirmPickup') : t('driver.confirmDropoff')}
            </p>
            <Button variant="outline" size="sm" onClick={() => setScannerOpen(true)} icon={<Camera className="w-4 h-4" />}>
              {t('driver.scanQr')}
            </Button>
          </div>

          <ul className="space-y-1">
            {containers.map((c: any) => (
              <li key={c.container_id}>
                <label className="flex items-center gap-3 p-2 rounded-lg bg-white border border-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-gray-300"
                    checked={selected.includes(c.container_id)}
                    onChange={() => toggle(c.container_id)}
                  />
                  <Package className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-900">{c.container_number}</span>
                  <span className="text-xs text-gray-500">
                    {c.container_type} · {c.fill_level}%
                  </span>
                  {c.unloaded_at && <span className="ml-auto text-xs text-green-700">Avlastad</span>}
                  {c.loaded_at && !c.unloaded_at && <span className="ml-auto text-xs text-blue-700">Lastad</span>}
                </label>
              </li>
            ))}
          </ul>

          {nextStop.stop_type === 'dropoff' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('driver.targetSpotPerContainer')}
              </label>
              {selected.map((containerId) => {
                const container = containers.find((c) => c.container_id === containerId);
                return (
                  <div key={containerId} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 w-24 shrink-0">{container?.container_number}</span>
                    <Select
                      value={spotPerContainer[containerId] ?? ''}
                      onChange={(e) =>
                        setSpotPerContainer((prev) => ({ ...prev, [containerId]: e.target.value }))
                      }
                      options={[
                        { value: '', label: 'Välj parkeringsplats' },
                        ...spotOptions.filter((o) => !Object.values(spotPerContainer).includes(o.value)),
                      ]}
                      className="flex-1"
                    />
                  </div>
                );
              })}
              {selected.length === 0 && (
                <p className="text-sm text-gray-500">Välj containrar först — sedan anger du plats för varje container.</p>
              )}
            </div>
          )}

          <Button
            onClick={nextStop.stop_type === 'pickup' ? handlePickup : handleDropoff}
            disabled={
              busy ||
              isLoading ||
              selected.length === 0 ||
              (nextStop.stop_type === 'dropoff' &&
                selected.some((id) => !spotPerContainer[id]))
            }
            loading={busy}
            icon={<Navigation className="w-4 h-4" />}
          >
            {nextStop.stop_type === 'pickup' ? t('driver.pickContainer') : t('driver.dropoffContainer')}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-gray-600">Ordern är {orderStatus === 'completed' ? 'avslutad' : orderStatus}.</p>
      )}

      <QRScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        hint="Skanna containerns QR-kod för att markera den i listan."
      />
    </Card>
  );
}
