// Transport Orders Page — manager view (ticket 07)
//
// Order builder (stops + containers + target spots), assignment flow
// (Planned → Assigned), transport suggestions and the order lifecycle.
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { Table, createActionsColumn } from '@avc/ui/components/Table';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Modal } from '@avc/ui/components/Modal';
import { Card } from '@avc/ui/components/Card';
import { StatusBadge } from '@avc/ui/components/StatusBadge';
import { Loader } from '../../components/Loader';
import { Plus, Search, Edit, Eye, Truck, MapPin, Lightbulb, UserCheck, Archive, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { TransportOrder, TransportOrderStatus } from '@avc/shared-types';
import { useTranslation } from 'react-i18next';

const STATUS_OPTIONS = [
  { value: '', label: 'Alla statusar' },
  { value: 'planned', label: 'Planerad' },
  { value: 'assigned', label: 'Tilldelad' },
  { value: 'in_progress', label: 'Pågår' },
  { value: 'completed', label: 'Avslutad' },
  { value: 'archived', label: 'Arkiverad' },
];

const LIFECYCLE: TransportOrderStatus[] = ['planned', 'assigned', 'in_progress', 'completed', 'archived'];

const LIFECYCLE_LABEL: Record<string, string> = {
  planned: 'Planerad',
  assigned: 'Tilldelad',
  in_progress: 'Pågår',
  completed: 'Avslutad',
  archived: 'Arkiverad',
};

interface StopDraft {
  id: string;
  site_id: string;
  stop_type: 'pickup' | 'dropoff';
  container_ids: string[];
  target_spot_id: string;
}

interface Suggestion {
  fromSiteId: string;
  fromSiteName: string | null;
  toSiteId: string | null;
  toSiteName: string | null;
  containerCount: number;
  containers: Array<{ id: string; container_number: string; type: string; fill_level: string }>;
  suggestedAction: string;
}

const newStop = (): StopDraft => ({
  id: Math.random().toString(36).slice(2),
  site_id: '',
  stop_type: 'pickup',
  container_ids: [],
  target_spot_id: '',
});

export function TransportOrdersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', status: '', site_id: '', driver_id: '' });
  const [builderOpen, setBuilderOpen] = useState(false);
  const [assigning, setAssigning] = useState<TransportOrder | null>(null);
  const [viewing, setViewing] = useState<TransportOrder | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['transportOrders', page, filters],
    queryFn: () =>
      api
        .get('/transport-orders', {
          params: {
            page,
            limit: 20,
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.site_id ? { site_id: filters.site_id } : {}),
            ...(filters.driver_id ? { driver_id: filters.driver_id } : {}),
          },
        })
        .then((r) => r.data),
  });

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data.data ?? r.data),
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers', 'options'],
    queryFn: () => api.get('/drivers', { params: { limit: 100 } }).then((r) => r.data.data ?? []),
  });

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles', 'options'],
    queryFn: () => api.get('/vehicles', { params: { limit: 100 } }).then((r) => r.data.data ?? []),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, driverId, vehicleId }: { id: string; driverId: string; vehicleId: string }) =>
      api.post(`/transport-orders/${id}/assign`, {
        assigned_driver_id: driverId,
        assigned_vehicle_id: vehicleId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transportOrders'] });
      setAssigning(null);
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message ?? 'Kunde inte tilldela ordern');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/transport-orders/${id}/archive`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transportOrders'] }),
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message ?? 'Kunde inte arkivera ordern');
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/transport-orders', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transportOrders'] });
      setBuilderOpen(false);
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message ?? 'Kunde inte skapa transportordern');
    },
  });

  const handleEdit = (order: TransportOrder) => setAssigning(order);

  const columns = [
    { header: t('manager.orders.orderNumber'), accessorKey: 'order_number' },
    {
      header: t('manager.orders.status'),
      accessorKey: 'status',
      render: (row: any) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status as TransportOrderStatus} />
          <LifecycleDots status={row.status as TransportOrderStatus} />
        </div>
      ),
    },
    { header: t('manager.orders.plannedStart'), accessorKey: 'planned_start_at', render: (row: any) => (row.planned_start_at ? new Date(row.planned_start_at).toLocaleString('sv-SE') : '—') },
    { header: t('manager.orders.driver'), accessorKey: 'driver_name', render: (row: any) => row.driver_name ?? '—' },
    { header: t('manager.orders.vehicle'), accessorKey: 'vehicle_name', render: (row: any) => row.vehicle_name ?? row.registration_number ?? '—' },
    { header: t('manager.orders.created'), accessorKey: 'created_at', render: (row: any) => new Date(row.created_at).toLocaleString('sv-SE') },
    createActionsColumn([
      {
        label: t('manager.orders.assign'),
        icon: UserCheck,
        onClick: handleEdit,
        disabled: (row: any) => row.status !== 'planned',
      },
      {
        label: 'Visa',
        icon: Eye,
        onClick: (row: any) => setViewing(row),
      },
      {
        label: t('manager.orders.archive'),
        icon: Archive,
        variant: 'destructive',
        onClick: (row: any) => {
          if (window.confirm(`Arkivera order ${row.order_number}?`)) archiveMutation.mutate(row.id);
        },
        disabled: (row: any) => row.status !== 'completed',
      },
    ]),
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t('manager.orders.title')}</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSuggestOpen(true)} icon={<Lightbulb className="w-4 h-4" />}>
              {t('manager.orders.suggest')}
            </Button>
            <Button onClick={() => setBuilderOpen(true)} icon={<Plus className="w-4 h-4" />}>
              {t('manager.orders.new')}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        <div className="flex flex-wrap gap-4 mb-6 items-center">
          <Input
            placeholder="Sök ordernummer..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-56 shrink-0"
            icon={<Search className="w-4 h-4" />}
          />
          <Select
            value={filters.status}
            onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
            options={STATUS_OPTIONS}
            className="w-44"
          />
          <Select
            value={filters.site_id}
            onChange={(e) => { setFilters({ ...filters, site_id: e.target.value }); setPage(1); }}
            options={[
              { value: '', label: 'Alla platser' },
              ...(sites ?? []).map((s: any) => ({ value: s.id, label: s.name })),
            ]}
            className="w-48"
          />
          <Select
            value={filters.driver_id}
            onChange={(e) => { setFilters({ ...filters, driver_id: e.target.value }); setPage(1); }}
            options={[
              { value: '', label: 'Alla förare' },
              ...(drivers ?? []).map((d: any) => ({ value: d.id, label: d.full_name })),
            ]}
            className="w-48"
          />
        </div>

        {isLoading ? (
          <Loader message="Laddar transportorder..." />
        ) : (
          <Table
            data={data?.data || []}
            columns={columns as any}
            keyExtractor={(row: any) => row.id}
            pagination={{
              page: data?.meta.page || 1,
              pageCount: data?.meta.totalPages || 1,
              total: data?.meta.total || 0,
              onPageChange: setPage,
            }}
            emptyMessage="Inga transportorder hittades"
          />
        )}
      </Card>

      <Modal
        isOpen={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title="Ny transportorder"
        size="xl"
      >
        <OrderBuilder
          sites={sites ?? []}
          onSubmit={(payload) => createMutation.mutate(payload)}
          isLoading={createMutation.isPending}
          onCancel={() => setBuilderOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={!!assigning}
        onClose={() => setAssigning(null)}
        title={assigning ? `Tilldela ${assigning.order_number}` : 'Tilldela order'}
      >
        <AssignForm
          order={assigning}
          drivers={drivers ?? []}
          vehicles={vehicles ?? []}
          isLoading={assignMutation.isPending}
          onSubmit={(driverId, vehicleId) => {
            if (!assigning) return;
            assignMutation.mutate({ id: assigning.id, driverId, vehicleId });
          }}
          onCancel={() => setAssigning(null)}
        />
      </Modal>

      <Modal
        isOpen={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Order ${viewing.order_number}` : 'Order'}
        size="lg"
      >
        <OrderDetails orderId={viewing?.id ?? null} />
      </Modal>

      <Modal isOpen={suggestOpen} onClose={() => setSuggestOpen(false)} title="Föreslagna transportorder" size="lg">
        <SuggestionsPanel
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['transportOrders'] });
          }}
        />
      </Modal>
    </div>
  );
}

function OrderDetails({ orderId }: { orderId: string | null }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['transportOrder', orderId],
    queryFn: () => api.get(`/transport-orders/${orderId}`).then((r) => r.data),
    enabled: !!orderId,
  });

  if (isLoading) return <Loader message="Laddar order..." />;
  if (!data) return <p className="text-gray-500">Kunde inte ladda ordern.</p>;

  // The detail endpoint returns a paginated single-item shape: { data: [order] }.
  const order = data.data?.[0];
  if (!order) return <p className="text-gray-500">Kunde inte ladda ordern.</p>;

  const stops: any[] = order.stops ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 text-sm">
        <div>
          <p className="text-gray-500">Status</p>
          <StatusBadge status={order.status as TransportOrderStatus} />
        </div>
        <div>
          <p className="text-gray-500">Förare</p>
          <p className="font-medium text-gray-900">{order.driver_name ?? 'Ej tilldelad'}</p>
        </div>
        <div>
          <p className="text-gray-500">Fordon</p>
          <p className="font-medium text-gray-900">
            {order.vehicle_name ?? order.registration_number ?? 'Ej tilldelat'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Planerad start</p>
          <p className="font-medium text-gray-900">
            {order.planned_start_at ? new Date(order.planned_start_at).toLocaleString('sv-SE') : '—'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Startad</p>
          <p className="font-medium text-gray-900">
            {order.actual_start_at ? new Date(order.actual_start_at).toLocaleString('sv-SE') : '—'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Anteckningar</p>
          <p className="font-medium text-gray-900">{order.notes ?? '—'}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('manager.orders.stops', { count: stops.length })}</h3>
        <div className="space-y-2">
          {stops.map((stop) => (
            <div key={stop.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  {stop.sequence}. {stop.stop_type === 'pickup' ? t('manager.orders.pickup') : t('manager.orders.dropoff')} — {stop.site_name}
                </span>
                <span className="text-xs text-gray-500">
                  {stop.actual_at ? `Utförd ${new Date(stop.actual_at).toLocaleString('sv-SE')}` : 'Väntar'}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {(stop.containers ?? []).map((c: any) => c.container_number).join(', ') || 'Inga containrar'}
              </p>
            </div>
          ))}
          {stops.length === 0 && <p className="text-sm text-gray-500">Ordern har inga stopp.</p>}
        </div>
      </div>
    </div>
  );
}

function LifecycleDots({ status }: { status: TransportOrderStatus }) {
  const index = LIFECYCLE.indexOf(status);
  return (
    <span className="flex items-center gap-0.5" title={LIFECYCLE_LABEL[status]}>
      {LIFECYCLE.map((step, i) => (
        <span
          key={step}
          className={`w-1.5 h-1.5 rounded-full ${
            i <= index ? 'bg-blue-500' : 'bg-gray-200'
          }`}
        />
      ))}
    </span>
  );
}

function OrderBuilder({
  sites,
  onSubmit,
  isLoading,
  onCancel,
}: {
  sites: any[];
  onSubmit: (payload: any) => void;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [stops, setStops] = useState<StopDraft[]>([newStop()]);
  const [notes, setNotes] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: drivers } = useQuery({
    queryKey: ['drivers', 'options'],
    queryFn: () => api.get('/drivers', { params: { limit: 100 } }).then((r) => r.data.data ?? []),
  });

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles', 'options'],
    queryFn: () => api.get('/vehicles', { params: { limit: 100 } }).then((r) => r.data.data ?? []),
  });

  const updateStop = (id: string, patch: Partial<StopDraft>) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const moveStop = (index: number, direction: -1 | 1) => {
    setStops((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = () => {
    setLocalError(null);
    if (stops.length === 0) {
      setLocalError('Ordern måste ha minst en stopp');
      return;
    }
    for (const [index, stop] of stops.entries()) {
      if (!stop.site_id) {
        setLocalError(`Stopp ${index + 1}: välj plats`);
        return;
      }
      if (stop.container_ids.length === 0) {
        setLocalError(`Stopp ${index + 1}: minst en container krävs`);
        return;
      }
    }

    onSubmit({
      ...(plannedStart ? { planned_start_at: new Date(plannedStart).toISOString() } : {}),
      ...(driverId ? { assigned_driver_id: driverId } : {}),
      ...(vehicleId ? { assigned_vehicle_id: vehicleId } : {}),
      ...(notes ? { notes } : {}),
      stops: stops.map((stop) => ({
        site_id: stop.site_id,
        stop_type: stop.stop_type,
        containers: stop.container_ids.map((containerId) => ({
          container_id: containerId,
          ...(stop.target_spot_id ? { target_spot_id: stop.target_spot_id } : {}),
        })),
      })),
    });
  };

  return (
    <div className="space-y-4">
      {localError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{localError}</div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Planerad start</label>
          <Input type="datetime-local" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Förare (valfritt)</label>
          <Select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            options={[
              { value: '', label: 'Välj förare' },
              ...(drivers ?? []).map((d: any) => ({ value: d.id, label: d.full_name })),
            ]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fordon (valfritt)</label>
          <Select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            options={[
              { value: '', label: 'Välj fordon' },
              ...(vehicles ?? []).map((v: any) => ({ value: v.id, label: v.registration_number || v.name })),
            ]}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">{t('manager.orders.stops', { count: stops.length })}</h3>
          <Button variant="outline" size="sm" onClick={() => setStops((prev) => [...prev, newStop()])} icon={<Plus className="w-4 h-4" />}>
            Lägg till stopp
          </Button>
        </div>

        <div className="space-y-3">
          {stops.map((stop, index) => (
            <StopEditor
              key={stop.id}
              stop={stop}
              index={index}
              total={stops.length}
              sites={sites}
              onChange={(patch) => updateStop(stop.id, patch)}
              onRemove={() => setStops((prev) => prev.filter((s) => s.id !== stop.id))}
              onMove={(direction) => moveStop(index, direction)}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Anteckningar</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anteckningar..." multiline rows={2} />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="secondary" onClick={onCancel}>Avbryt</Button>
        <Button onClick={handleSubmit} disabled={isLoading} loading={isLoading}>{t('manager.orders.createOrder')}</Button>
      </div>
    </div>
  );
}

function StopEditor({
  stop,
  index,
  total,
  sites,
  onChange,
  onRemove,
  onMove,
}: {
  stop: StopDraft;
  index: number;
  total: number;
  sites: any[];
  onChange: (patch: Partial<StopDraft>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const { data: containers } = useQuery({
    queryKey: ['containers', 'builder', stop.site_id],
    queryFn: () =>
      api
        .get('/containers', { params: { site_id: stop.site_id, status: 'active', limit: 100 } })
        .then((r) => r.data.data ?? []),
    enabled: !!stop.site_id,
  });

  const { data: spots } = useQuery({
    queryKey: ['parkingSpots', 'builder', stop.site_id],
    queryFn: () => api.get(`/sites/${stop.site_id}/parking-spots`).then((r) => r.data.data ?? r.data),
    enabled: !!stop.site_id,
  });

  const containerOptions = (containers ?? []).map((c: any) => ({
    value: c.id,
    label: `${c.container_number} (${c.fill_level}%)`,
  }));

  const spotOptions = (spots ?? []).map((s: any) => ({
    value: s.id,
    label: `${s.spot_code}${s.zone_name ? ` · ${s.zone_name}` : ''}`,
  }));

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Stopp {index + 1}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onMove(-1)} disabled={index === 0} icon={<ArrowUp className="w-4 h-4" />} aria-label="Flytta upp" />
          <Button variant="ghost" size="sm" onClick={() => onMove(1)} disabled={index === total - 1} icon={<ArrowDown className="w-4 h-4" />} aria-label="Flytta ner" />
          <Button variant="destructive" size="sm" onClick={onRemove} disabled={total === 1} icon={<Trash2 className="w-4 h-4" />} aria-label="Ta bort stopp" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
          <Select
            value={stop.stop_type}
            onChange={(e) => onChange({ stop_type: e.target.value as 'pickup' | 'dropoff', target_spot_id: '' })}
            options={[
              { value: 'pickup', label: t('manager.orders.pickup') },
              { value: 'dropoff', label: t('manager.orders.dropoff') },
            ]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plats</label>
          <Select
            value={stop.site_id}
            onChange={(e) => onChange({ site_id: e.target.value, container_ids: [], target_spot_id: '' })}
            options={[
              { value: '', label: 'Välj plats' },
              ...sites.map((s: any) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Containrar</label>
          <Select
            multiple
            size={Math.min(6, Math.max(3, containerOptions.length))}
            value={stop.container_ids}
            onChange={(e) =>
              onChange({
                container_ids: Array.from(e.target.selectedOptions).map((o) => (o as HTMLOptionElement).value),
              })
            }
            options={containerOptions}
            placeholder={stop.site_id ? 'Välj containrar' : 'Välj plats först'}
            disabled={!stop.site_id}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Målplats (valfritt)</label>
          <Select
            value={stop.target_spot_id}
            onChange={(e) => onChange({ target_spot_id: e.target.value })}
            options={[{ value: '', label: 'Ingen specifik plats' }, ...spotOptions]}
            disabled={!stop.site_id || stop.stop_type !== 'dropoff'}
          />
        </div>
      </div>
    </div>
  );
}

function AssignForm({
  order,
  drivers,
  vehicles,
  isLoading,
  onSubmit,
  onCancel,
}: {
  order: TransportOrder | null;
  drivers: any[];
  vehicles: any[];
  isLoading: boolean;
  onSubmit: (driverId: string, vehicleId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [driverId, setDriverId] = useState(order?.assigned_driver_id ?? '');
  const [vehicleId, setVehicleId] = useState(order?.assigned_vehicle_id ?? '');

  const canSubmit = !!driverId && !!vehicleId;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Tilldela en förare och ett fordon. Ordern går från <strong>Planerad</strong> till <strong>Tilldelad</strong>.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Förare</label>
        <Select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          options={[
            { value: '', label: 'Välj förare' },
            ...drivers.map((d: any) => ({ value: d.id, label: d.full_name })),
          ]}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Fordon</label>
        <Select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          options={[
            { value: '', label: 'Välj fordon' },
            ...vehicles.map((v: any) => ({ value: v.id, label: `${v.registration_number || v.name}${v.name ? ` · ${v.name}` : ''}` })),
          ]}
        />
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="secondary" onClick={onCancel}>Avbryt</Button>
        <Button onClick={() => onSubmit(driverId, vehicleId)} disabled={!canSubmit || isLoading} loading={isLoading}>
          Tilldela
        </Button>
      </div>
    </div>
  );
}

function SuggestionsPanel({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['transportSuggestions'],
    queryFn: () => api.post('/transport-orders/suggest', {}).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (suggestion: Suggestion) =>
      api.post('/transport-orders/from-suggestion', {
        site_id: suggestion.fromSiteId,
        to_site_id: suggestion.toSiteId,
        container_ids: suggestion.containers.map((c) => c.id),
        notes: `Föreslagen order: ${suggestion.suggestedAction}`,
      }),
    onSuccess: () => {
      setCreating(null);
      setError(null);
      onCreated();
    },
    onError: (err: any) => {
      setCreating(null);
      setError(err?.response?.data?.error?.message ?? 'Kunde inte skapa ordern');
    },
  });

  const suggestions: Suggestion[] = data?.suggestions ?? [];

  if (isLoading) return <Loader message="Beräknar förslag..." />;

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-8">
        <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{t('manager.orders.suggestEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}
      <p className="text-sm text-gray-600">
        Containrar som nått 75% eller mer, grupperade per plats. Skapa en order för att flytta dem.
      </p>
      {suggestions.map((suggestion) => (
        <div key={suggestion.fromSiteId} className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">
                {suggestion.fromSiteName ?? suggestion.fromSiteId} → {suggestion.toSiteName ?? '—'}
              </p>
              <p className="text-sm text-gray-600">
                {suggestion.containerCount} container{suggestion.containerCount === 1 ? '' : 'ar'} behöver transport
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {suggestion.containers.map((c) => `${c.container_number} (${c.fill_level}%)`).join(', ')}
              </p>
            </div>
            <Button
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              disabled={!suggestion.toSiteId || creating === suggestion.fromSiteId}
              loading={creating === suggestion.fromSiteId}
              onClick={() => {
                setCreating(suggestion.fromSiteId);
                createMutation.mutate(suggestion);
              }}
            >
              {t('manager.orders.createOrder')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
