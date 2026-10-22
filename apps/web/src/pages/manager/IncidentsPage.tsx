// Damage Reports & Swap Requests Page (manager)
//
// Manager side of ticket 06: acknowledge/resolve damage reports and
// approve/cancel/fulfil swap requests. The worker side (create) lands with
// the Worker App in ticket 09.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../utils/api';
import { Table, createActionsColumn } from '@avc/ui/components/Table';
import { Button } from '@avc/ui/components/Button';
import { Select } from '@avc/ui/components/Select';
import { Input } from '@avc/ui/components/Input';
import { Modal } from '@avc/ui/components/Modal';
import { Card } from '@avc/ui/components/Card';
import { Badge } from '@avc/ui/components/Badge';
import { Loader } from '../../components/Loader';
import { AlertTriangle, Check, X, RefreshCw, ArrowLeftRight, Camera } from 'lucide-react';

type Tab = 'damage' | 'swaps';

interface DamageReportRow {
  id: string;
  container_id: string;
  container_number?: string | null;
  site_id?: string | null;
  severity: 'minor' | 'major' | 'critical';
  description: string;
  photos?: Array<{ url: string; caption?: string }> | null;
  status: 'open' | 'acknowledged' | 'resolved';
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  created_at: string;
}

interface SwapRequestRow {
  id: string;
  site_id: string;
  requested_by_name?: string | null;
  current_container_number?: string | null;
  new_container_number?: string | null;
  preferred_container_type?: string | null;
  reason?: string | null;
  status: 'pending' | 'approved' | 'fulfilled' | 'cancelled';
  created_at: string;
  approved_at?: string | null;
  fulfilled_at?: string | null;
}

export function IncidentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('damage');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [resolving, setResolving] = useState<DamageReportRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data.data),
  });

  const { data: damage, isLoading: damageLoading } = useQuery({
    queryKey: ['damageReports', page, statusFilter, severityFilter, siteFilter],
    queryFn: () =>
      api
        .get('/damage-reports', {
          params: {
            page,
            limit: 20,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(severityFilter ? { severity: severityFilter } : {}),
            ...(siteFilter ? { site_id: siteFilter } : {}),
          },
        })
        .then((r) => r.data),
    enabled: tab === 'damage',
  });

  const { data: swaps, isLoading: swapsLoading } = useQuery({
    queryKey: ['swapRequests', page, statusFilter, siteFilter],
    queryFn: () =>
      api
        .get('/swap-requests', {
          params: {
            page,
            limit: 20,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(siteFilter ? { site_id: siteFilter } : {}),
          },
        })
        .then((r) => r.data),
    enabled: tab === 'swaps',
  });

  const damageMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      setError(null);
      try {
        await api.patch(`/damage-reports/${id}`, body);
      } catch (err: any) {
        setError(err?.response?.data?.error?.message ?? 'Kunde inte uppdatera skaderapporten');
        throw err;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['damageReports'] }),
  });

  const swapMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      setError(null);
      try {
        await api.patch(`/swap-requests/${id}`, body);
      } catch (err: any) {
        setError(err?.response?.data?.error?.message ?? 'Kunde inte uppdatera bytbegäran');
        throw err;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['swapRequests'] }),
  });

  const damageColumns = [
    {
      header: t('manager.incidents.container'),
      accessorKey: 'container_number',
      render: (row: DamageReportRow) => row.container_number ?? row.container_id.slice(0, 8),
    },
    {
      header: t('manager.incidents.severity'),
      accessorKey: 'severity',
      render: (row: DamageReportRow) => (
        <Badge variant="status" status={row.severity}>
          {t(`manager.incidents.${row.severity}`)}
        </Badge>
      ),
    },
    {
      header: t('manager.incidents.description'),
      accessorKey: 'description',
      render: (row: DamageReportRow) => (
        <div className="max-w-xs">
          <p className="truncate" title={row.description}>{row.description}</p>
          {(row.photos?.length ?? 0) > 0 && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Camera className="w-3 h-3" /> {row.photos!.length} foto
            </p>
          )}
        </div>
      ),
    },
    {
      header: t('manager.incidents.status'),
      accessorKey: 'status',
      render: (row: DamageReportRow) => (
        <Badge variant="status" status={row.status}>{t(`manager.incidents.${row.status}`)}</Badge>
      ),
    },
    {
      header: t('manager.incidents.reported'),
      accessorKey: 'created_at',
      render: (row: DamageReportRow) => new Date(row.created_at).toLocaleString('sv-SE'),
    },
    createActionsColumn<DamageReportRow>([
      {
        label: t('manager.incidents.acknowledge'),
        icon: Check,
        onClick: (row) => damageMutation.mutate({ id: row.id, body: { status: 'acknowledged' } }),
        disabled: (row) => row.status !== 'open',
      },
      {
        label: t('manager.incidents.resolve'),
        icon: X,
        onClick: (row) => {
          setResolving(row);
          setResolutionNotes('');
        },
        disabled: (row) => row.status === 'resolved',
      },
    ]),
  ];

  const swapColumns = [
    {
      header: 'Plats',
      accessorKey: 'site_id',
      render: (row: SwapRequestRow) => sites?.find((s: any) => s.id === row.site_id)?.name ?? row.site_id.slice(0, 8),
    },
    {
      header: t('manager.incidents.container'),
      accessorKey: 'current_container_number',
      render: (row: SwapRequestRow) => row.current_container_number ?? '—',
    },
    {
      header: 'Önskad typ',
      accessorKey: 'preferred_container_type',
      render: (row: SwapRequestRow) => row.preferred_container_type ?? '—',
    },
    {
      header: 'Anledning',
      accessorKey: 'reason',
      render: (row: SwapRequestRow) => (
        <span className="block max-w-xs truncate" title={row.reason ?? ''}>{row.reason ?? '—'}</span>
      ),
    },
    {
      header: 'Beställd av',
      accessorKey: 'requested_by_name',
      render: (row: SwapRequestRow) => row.requested_by_name ?? '—',
    },
    {
      header: t('manager.incidents.status'),
      accessorKey: 'status',
      render: (row: SwapRequestRow) => (
        <Badge variant="status" status={row.status}>{t(`manager.incidents.${row.status}`)}</Badge>
      ),
    },
    createActionsColumn<SwapRequestRow>([
      {
        label: t('manager.incidents.approve'),
        icon: Check,
        onClick: (row) => swapMutation.mutate({ id: row.id, body: { status: 'approved' } }),
        disabled: (row) => row.status !== 'pending',
      },
      {
        label: t('manager.incidents.cancel'),
        icon: X,
        variant: 'destructive',
        onClick: (row) => {
          if (window.confirm('Vill du avbryta bytbegäran?')) {
            swapMutation.mutate({ id: row.id, body: { status: 'cancelled' } });
          }
        },
        disabled: (row) => row.status !== 'pending' && row.status !== 'approved',
      },
    ]),
  ];

  const activeList = tab === 'damage' ? damage : swaps;
  const isLoading = tab === 'damage' ? damageLoading : swapsLoading;
  const rows = (activeList?.data ?? []) as any[];
  const meta = activeList?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('manager.incidents.title')}</h1>
          <p className="text-sm text-gray-500">
            {t('manager.incidents.subtitle')}
          </p>
        </div>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries()} icon={<RefreshCw className="w-4 h-4" />}>
          Uppdatera
        </Button>
      </div>

      <div className="flex border-b">
        {([['damage', 'Skaderapporter'], ['swaps', 'Bytbegäranden']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              setPage(1);
              setStatusFilter('');
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              {key === 'damage' ? <AlertTriangle className="w-4 h-4" /> : <ArrowLeftRight className="w-4 h-4" />}
              {label}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            options={tab === 'damage'
              ? [
                  { value: '', label: 'Alla statusar' },
                  { value: 'open', label: 'Öppen' },
                  { value: 'acknowledged', label: 'Bekräftad' },
                  { value: 'resolved', label: 'Löst' },
                ]
              : [
                  { value: '', label: 'Alla statusar' },
                  { value: 'pending', label: 'Väntar' },
                  { value: 'approved', label: 'Godkänd' },
                  { value: 'fulfilled', label: 'Utförd' },
                  { value: 'cancelled', label: 'Avbruten' },
                ]}
            className="w-48"
          />
          {tab === 'damage' && (
            <Select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
              options={[
                { value: '', label: 'Alla gradar' },
                { value: 'minor', label: 'Liten' },
                { value: 'major', label: 'Stor' },
                { value: 'critical', label: 'Kritisk' },
              ]}
              className="w-48"
            />
          )}
          <Select
            value={siteFilter}
            onChange={(e) => { setSiteFilter(e.target.value); setPage(1); }}
            options={[
              { value: '', label: 'Alla platser' },
              ...(sites ?? []).map((s: any) => ({ value: s.id, label: s.name })),
            ]}
            className="w-64"
          />
        </div>

        {isLoading ? (
          <Loader message="Laddar..." />
        ) : (
          <Table
            data={rows}
            columns={tab === 'damage' ? (damageColumns as any) : (swapColumns as any)}
            keyExtractor={(row: any) => row.id}
            emptyMessage={tab === 'damage' ? 'Inga skaderapporter' : 'Inga bytbegäranden'}
            pagination={{
              page,
              pageCount: meta?.totalPages ?? 1,
              total: meta?.total ?? 0,
              onPageChange: setPage,
            }}
          />
        )}
      </Card>

      <Modal
        isOpen={!!resolving}
        onClose={() => setResolving(null)}
        title="Lös skaderapport"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{resolving?.description}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Åtgärdsnotering</label>
            <Input
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="T.ex. Byte till ny container"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => setResolving(null)}>Avbryt</Button>
            <Button
              onClick={() => {
                if (!resolving) return;
                damageMutation.mutate(
                  { id: resolving.id, body: { status: 'resolved', resolution_notes: resolutionNotes } },
                  { onSettled: () => setResolving(null) }
                );
              }}
              isLoading={damageMutation.isPending}
            >
              Markera som löst
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
