// Driver Page - Mobile PWA for drivers (ticket 08)
//
// Shift start (pick a vehicle) → pre-assigned orders → step-by-step execution
// of the active order. All writes go through the driver service seam.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@avc/ui/components/Card';
import { Button } from '@avc/ui/components/Button';
import { Select } from '@avc/ui/components/Select';
import { Loader } from '../../components/Loader';
import { StatusBadge } from '@avc/ui/components';
import { ActiveOrderCard } from './ActiveOrderCard';
import { Truck, MapPin, CheckCircle, Clock, RefreshCw, Play, Square } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { fetchDriverShift, fetchShift, startShift, endShift } from '../../services/driverApi';
import { useLocalTable } from '../../hooks/useLocalData';
import { PushSettings } from '../../components/PushSettings';
import { useTranslation } from 'react-i18next';

export function DriverPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { data: shiftData, isLoading: shiftLoading } = useQuery({
    queryKey: ['driverShiftState', user?.id],
    queryFn: () => fetchShift(),
    enabled: !!user,
  });

  // Offline-first reads (ticket 15): the driver's orders come from the local
  // table and are refreshed in the background.
  const { data: localOrders, isLoading: ordersLoading, refresh: refreshOrders } = useLocalTable<any>(
    'transportOrders',
    { driverId: user?.id }
  );

  // The shift view also carries the vehicle list (for the shift start) and the
  // order stops; the local table holds the orders themselves.
  const { data: shiftView, refetch } = useQuery({
    queryKey: ['driverShift', user?.id],
    queryFn: () => fetchDriverShift(user!.id),
    enabled: !!user,
    refetchInterval: 60000, // Auto-refresh every minute
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => startShift(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverShiftState'] });
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message ?? 'Kunde inte starta skiftet');
    },
  });

  const endMutation = useMutation({
    mutationFn: () => endShift(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverShiftState'] });
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message ?? 'Kunde inte avsluta skiftet');
    },
  });

  if (ordersLoading || shiftLoading) return <Loader message="Laddar skift..." />;

  // Prefer the local (cached) orders; fall back to the server's.
  const serverOrders = shiftView?.assigned_orders || [];
  const orders = localOrders.length > 0 ? localOrders : serverOrders;
  const activeOrder =
    orders.find((o: any) => o.id === selectedOrderId) ||
    orders.find((o: any) => o.status === 'in_progress') ||
    orders.find((o: any) => o.status === 'assigned') ||
    orders[0];
  const shift = shiftData?.shift ?? null;
  const isOpen = !!shift && !shift.ended_at;
  const vehicles = shiftView?.available_vehicles ?? [];

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('driver.title')}</h1>
          <p className="text-gray-500">{t('driver.welcome', { name: user?.full_name || 'Förare' })}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void refreshOrders();
            void refetch();
          }}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          Uppdatera
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Shift start */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {isOpen ? t('driver.shiftOn') : t('driver.startShift')}
          </h2>
          {isOpen && (
            <span className="inline-flex items-center gap-1 text-sm text-green-700">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Sedan {new Date(shift!.started_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {isOpen ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-gray-900">
                {shift!.vehicle_name ?? 'Fordon'}
                {shift!.vehicle_registration ? ` (${shift!.vehicle_registration})` : ''}
              </p>
              <p className="text-sm text-gray-500">{t('driver.readyToDrive')}</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => endMutation.mutate()}
              disabled={endMutation.isPending}
              icon={<Square className="w-4 h-4" />}
            >
              {t('driver.endShift')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {t('driver.startShiftHint')}
            </p>
            <div className="flex gap-2">
              <Select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                options={[
                  { value: '', label: 'Välj fordon' },
                  ...vehicles.map((v: any) => ({
                    value: v.id,
                    label: `${v.registration_number ?? ''}${v.name ? ` · ${v.name}` : ''}`,
                  })),
                ]}
                className="flex-1"
              />
              <Button
                onClick={() => vehicleId && startMutation.mutate(vehicleId)}
                disabled={!vehicleId || startMutation.isPending}
                loading={startMutation.isPending}
                icon={<Play className="w-4 h-4" />}
              >
                Starta skift
              </Button>
            </div>
            {vehicles.length === 0 && (
              <p className="text-sm text-gray-500">{t('driver.noVehicles')}</p>
            )}
          </div>
        )}
      </Card>

      {/* Active order */}
      {activeOrder ? (
        <ActiveOrderCard
          order={activeOrder}
          isLoading={startMutation.isPending || endMutation.isPending}
          onChanged={() => {
            queryClient.invalidateQueries({ queryKey: ['driverShift'] });
            queryClient.invalidateQueries({ queryKey: ['driverShiftState'] });
          }}
        />
      ) : (
        <Card className="text-center py-12">
          <Truck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('driver.noOrders')}</h2>
          <p className="text-gray-500">{t('driver.noOrdersHint')}</p>
        </Card>
      )}

      {/* Push notifications */}
      <PushSettings />

      {/* Order list */}
      {orders.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('driver.myOrders')}</h2>
          <ul className="space-y-2">
            {orders.map((order: any) => (
              <li
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={`flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer ${
                  activeOrder?.id === order.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-blue-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {order.status === 'completed' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : order.status === 'in_progress' ? (
                    <Clock className="w-5 h-5 text-blue-600" />
                  ) : (
                    <MapPin className="w-5 h-5 text-gray-400" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{order.order_number}</p>
                    <p className="text-xs text-gray-500">
                      {order.planned_start_at
                        ? new Date(order.planned_start_at).toLocaleString('sv-SE')
                        : 'Ingen planerad start'}
                    </p>
                  </div>
                </div>
                <StatusBadge status={order.status as any} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
