// Containers Page — real data paths: /companies, /sites, /sites/:id/parking-spots,
// discrete fill-level PATCH (no spot_id) and a true ownership-transfer dialog
// with a history timeline (container_ownership_history + movements).
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { Table, createFillLevelColumn, createActionsColumn } from '@avc/ui/components/Table';
import { Button } from '@avc/ui/components/Button';
import { Input, Textarea } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Modal } from '@avc/ui/components/Modal';
import { Card } from '@avc/ui/components/Card';
import { FillLevelSelector } from '@avc/ui/components/FillLevelIndicator';
import { StatusBadge } from '@avc/ui/components/StatusBadge';
import { ContainerTypeBadge } from '@avc/ui/components/StatusBadge';
import { Loader } from '../../components/Loader';
import { Plus, Search, Filter, Edit, Eye, ArrowLeftRight, History } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ContainerOverview, ContainerType, FillLevel } from '@avc/shared-types';
import type { CompanyOverview, OwnershipHistoryEntry, ContainerMovement } from '@avc/shared-types/api.js';
import { formatDate, getFillLevelColor } from '@avc/ui/utils';

const containerTypeSchema = z.enum(['open_top', 'closed', 'compactor', 'roll_off']);
const fillLevelSchema = z.enum(['0', '25', '50', '75', '100']);

const containerFormSchema = z.object({
  container_number: z.string().min(1, 'Containernummer krävs'),
  qr_code_value: z.string().min(1, 'QR-kod krävs'),
  type: containerTypeSchema,
  owning_company_id: z.string().uuid('Välj företag'),
  current_site_id: z.string().uuid('Välj plats').nullable().optional(),
  current_spot_id: z.string().uuid().nullable().optional(),
  fill_level: fillLevelSchema.default('0'),
  maintenance_interval_months: z.number().int().positive().default(6),
  notes: z.string().optional(),
});

type ContainerForm = z.infer<typeof containerFormSchema>;

const transferFormSchema = z.object({
  to_company_id: z.string().uuid('Välj mottagande företag'),
  reason: z.string().max(500, 'Max 500 tecken').optional(),
});
type TransferForm = z.infer<typeof transferFormSchema>;

const TYPE_OPTIONS = [
  { value: 'open_top', label: 'Öppen container' },
  { value: 'closed', label: 'Stängd container' },
  { value: 'compactor', label: 'Kompressor' },
  { value: 'roll_off', label: 'Roll-off' },
];

const FILTER_OPTIONS = {
  types: TYPE_OPTIONS,
  fillLevels: [
    { value: '0', label: 'Tom (0%)' },
    { value: '25', label: '25%' },
    { value: '50', label: '50%' },
    { value: '75', label: '75%' },
    { value: '100', label: 'Full (100%)' },
  ],
};

/** Removes empty strings that would violate uuid/optional fields in the shared schema. */
function stripEmptyFields(data: ContainerForm) {
  const payload: Record<string, unknown> = { ...data };
  for (const key of ['current_site_id', 'current_spot_id', 'notes']) {
    if (payload[key] === '' || payload[key] === undefined) {
      if (key === 'notes') payload[key] = undefined;
      else payload[key] = null;
    }
  }
  return payload;
}

export function ContainersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    type: '',
    fill_level: '',
    site_id: '',
    company_id: '',
    needs_maintenance: false,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<ContainerOverview | null>(null);
  const [viewContainer, setViewContainer] = useState<ContainerOverview | null>(null);
  const [transferContainer, setTransferContainer] = useState<ContainerOverview | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['containers', page, filters],
    queryFn: () =>
      api
        .get('/containers', {
          params: { page, limit: 20, ...filters },
        })
        .then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: ContainerForm) => api.post('/containers', stripEmptyFields(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      setModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ContainerForm }) => api.patch(`/containers/${id}`, stripEmptyFields(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      setModalOpen(false);
      setEditingContainer(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/containers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['containers'] }),
  });

  // Contract match: { fill_level } only — spot moves are a separate flow.
  const fillLevelMutation = useMutation({
    mutationFn: ({ id, fill_level }: { id: string; fill_level: FillLevel }) =>
      api.patch(`/containers/${id}/fill-level`, { fill_level }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['containers'] }),
  });

  const transferMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TransferForm }) =>
      api.patch(`/containers/${id}/transfer-ownership`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      queryClient.invalidateQueries({ queryKey: ['container-history', transferContainer?.id] });
      setTransferContainer(null);
    },
  });

  const handleOpenCreate = () => {
    setEditingContainer(null);
    setModalOpen(true);
  };

  const handleEdit = (container: ContainerOverview) => {
    setEditingContainer(container);
    setModalOpen(true);
  };

  const handleView = (container: ContainerOverview) => {
    setViewContainer(container);
  };

  const handleFillLevelChange = (container: ContainerOverview, newFillLevel: FillLevel) => {
    fillLevelMutation.mutate({ id: container.id, fill_level: newFillLevel });
  };

  const columns = [
    { key: 'container_number', header: 'Containernummer', className: 'font-mono' },
    { key: 'type', header: 'Typ', render: (row: ContainerOverview) => <ContainerTypeBadge type={row.type} /> },
    { key: 'owning_company_name', header: 'Ägare' },
    { key: 'current_site_name', header: 'Anläggning', render: (row: ContainerOverview) => row.current_site_name || 'Okänd' },
    { key: 'spot_code', header: 'Plats', render: (row: ContainerOverview) => row.spot_code ? `${row.zone_name || ''} ${row.spot_code}` : 'Ej placerad' },
    createFillLevelColumn<ContainerOverview>('fill_level', 'Fyllnad', (r: ContainerOverview) => r.fill_level),
    { key: 'status', header: 'Status', render: (r: ContainerOverview) => <StatusBadge status={r.status} type="container" /> },
    createActionsColumn<ContainerOverview>([
      { label: 'Visa', onClick: handleView, icon: <Eye className="w-4 h-4" />, variant: 'ghost' },
      { label: 'Redigera', onClick: handleEdit, icon: <Edit className="w-4 h-4" />, variant: 'ghost' },
      {
        label: 'Överlåt ägande',
        onClick: (c: ContainerOverview) => setTransferContainer(c),
        icon: <ArrowLeftRight className="w-4 h-4" />,
        variant: 'ghost',
      },
    ]),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Containrar</h1>
          <p className="text-gray-500">Hantera alla containrar och deras status</p>
        </div>
        <Button onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Ny container
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Sök containernummer, QR-kod..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="flex-1 sm:max-w-xs"
            icon={<Search className="w-4 h-4" />}
          />
          <Select
            options={[{ value: '', label: 'Alla typer' }, ...FILTER_OPTIONS.types]}
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="sm:w-48"
          />
          <Select
            options={[{ value: '', label: 'Alla fyllnader' }, ...FILTER_OPTIONS.fillLevels]}
            value={filters.fill_level}
            onChange={(e) => setFilters({ ...filters, fill_level: e.target.value })}
            className="sm:w-44"
          />
          <Button variant="outline" onClick={() => setFilters({ search: '', type: '', fill_level: '', site_id: '', company_id: '', needs_maintenance: false })}>
            <Filter className="w-4 h-4 mr-2" />
            Återställ
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <Loader message="Laddar containrar..." />
        ) : (
          <>
            <Table
              data={data?.data || []}
              columns={columns}
              keyExtractor={(row: ContainerOverview) => row.id}
              emptyMessage="Inga containrar hittades"
              striped
              hoverable
            />
            {data && data.meta.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Visar {(page - 1) * 20 + 1}–{Math.min(page * 20, data.meta.total)} av {data.meta.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Föregående
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                    disabled={page === data.meta.totalPages}
                  >
                    Nästa
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingContainer(null); }}
        title={editingContainer ? 'Redigera container' : 'Ny container'}
        size="lg"
      >
        <ContainerForm
          container={editingContainer}
          onSubmit={editingContainer
            ? (data: ContainerForm) => updateMutation.mutate({ id: editingContainer.id, data })
            : (data: ContainerForm) => createMutation.mutate(data)}
          isLoading={createMutation.isPending || updateMutation.isPending}
          error={createMutation.error?.message ?? updateMutation.error?.message ?? null}
          onCancel={() => { setModalOpen(false); setEditingContainer(null); }}
        />
      </Modal>

      {/* Ownership transfer modal */}
      <Modal
        isOpen={!!transferContainer}
        onClose={() => setTransferContainer(null)}
        title={`Överlåt ägande — ${transferContainer?.container_number ?? ''}`}
        size="md"
      >
        {transferContainer && (
          <TransferOwnershipDialog
            container={transferContainer}
            onSubmit={(data: TransferForm) => transferMutation.mutate({ id: transferContainer.id, data })}
            isLoading={transferMutation.isPending}
            error={transferMutation.error?.message ?? null}
            onCancel={() => setTransferContainer(null)}
          />
        )}
      </Modal>

      {/* View Modal */}
      <Modal
        isOpen={!!viewContainer}
        onClose={() => setViewContainer(null)}
        title="Containerdetaljer"
        size="lg"
      >
        {viewContainer && (
          <ContainerDetailView
            container={viewContainer}
            onFillLevelChange={handleFillLevelChange}
            onTransfer={() => {
              setTransferContainer(viewContainer);
              setViewContainer(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// Companies are fetched once and reused by both the container form and the transfer dialog.
function useCompaniesQuery() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then((r) => r.data as { data: CompanyOverview[] }),
    staleTime: 5 * 60 * 1000,
  });
}

function ContainerForm({ container, onSubmit, isLoading, error, onCancel }: { container: ContainerOverview | null; onSubmit: (data: ContainerForm) => void; isLoading: boolean; error: string | null; onCancel: () => void }) {
  const { data: companiesData } = useCompaniesQuery();
  const companies: CompanyOverview[] = companiesData?.data ?? [];
  const { data: sitesData } = useQuery({
    queryKey: ['sites-for-form'],
    queryFn: () => api.get('/sites', { params: { limit: 100 } }).then((r) => r.data as { data: Array<{ id: string; name: string }> }),
  });
  const sites = sitesData?.data ?? [];

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<ContainerForm>({
    resolver: zodResolver(containerFormSchema),
    defaultValues: container
      ? {
          container_number: container.container_number,
          qr_code_value: container.qr_code_value,
          type: container.type,
          owning_company_id: container.owning_company_id,
          current_site_id: container.current_site_id,
          current_spot_id: container.current_spot_id,
          fill_level: container.fill_level,
          maintenance_interval_months: container.maintenance_interval_months,
          notes: container.notes ?? undefined,
        }
      : { type: 'open_top', fill_level: '0', maintenance_interval_months: 6 },
  });

  const selectedSiteId = watch('current_site_id') || '';

  // Real parking spots for the chosen site (active only).
  const { data: spots } = useQuery({
    queryKey: ['parking-spots', selectedSiteId],
    queryFn: () => api.get(`/sites/${selectedSiteId}/parking-spots`).then((r) => r.data as Array<{ id: string; spot_code: string; is_active: boolean }>),
    enabled: !!selectedSiteId,
  });
  const activeSpots = (spots ?? []).filter((s) => s.is_active);

  const submit = async (data: ContainerForm) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Containernummer" {...register('container_number')} error={errors.container_number?.message} disabled={!!container} />
        <Input label="QR-kod" {...register('qr_code_value')} error={errors.qr_code_value?.message} disabled={!!container} />
        <Select label="Typ" options={TYPE_OPTIONS} {...register('type')} error={errors.type?.message} disabled={!!container} />
        <Select
          label="Ägare"
          options={[{ value: '', label: 'Välj företag' }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
          {...register('owning_company_id')}
          error={errors.owning_company_id?.message}
        />
        <Select
          label="Anläggning"
          options={[{ value: '', label: 'Ingen (ej placerad)' }, ...sites.map((s) => ({ value: s.id, label: s.name }))]}
          {...register('current_site_id')}
          onChange={(e) => {
            // A spot always belongs to exactly one site — clear it when the site changes.
            setValue('current_spot_id', null);
            register('current_site_id').onChange(e);
          }}
          error={errors.current_site_id?.message as string | undefined}
        />
        <Select
          label="Parkeringsplats"
          options={[
            { value: '', label: selectedSiteId ? 'Ej placerad' : 'Välj anläggning först' },
            ...activeSpots.map((s) => ({ value: s.id, label: s.spot_code })),
          ]}
          {...register('current_spot_id')}
          error={errors.current_spot_id?.message as string | undefined}
          disabled={!selectedSiteId}
        />
        <div>
          <label className="label">Fyllnadsgrad</label>
          <FillLevelSelector value={watch('fill_level')} onChange={(v) => setValue('fill_level', v as FillLevel)} />
          {errors.fill_level && <p className="text-red-600 text-sm mt-1">{errors.fill_level.message}</p>}
        </div>
        <Input
          label="Underhållsintervall (månader)"
          type="number"
          {...register('maintenance_interval_months', { valueAsNumber: true })}
          error={errors.maintenance_interval_months?.message}
        />
      </div>
      <Textarea label="Anteckningar" {...register('notes')} rows={3} />
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Avbryt
        </Button>
        <Button type="submit" disabled={isLoading} loading={isLoading}>
          {container ? 'Uppdatera' : 'Skapa'}
        </Button>
      </div>
    </form>
  );
}

function TransferOwnershipDialog({ container, onSubmit, isLoading, error, onCancel }: {
  container: ContainerOverview;
  onSubmit: (data: TransferForm) => void;
  isLoading: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  const { data: companiesData } = useCompaniesQuery();
  const list: CompanyOverview[] = companiesData?.data ?? [];
  const { register, handleSubmit, formState: { errors } } = useForm<TransferForm>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: { to_company_id: '', reason: '' },
  });

  const candidates = list.filter((c) => c.id !== container.owning_company_id);

  return (
    <form onSubmit={handleSubmit((d) => onSubmit(d))} className="space-y-4">
      <p className="text-sm text-gray-500">
        Överlåter <span className="font-mono">{container.container_number}</span> från{' '}
        <span className="font-medium text-gray-700">{container.owning_company_name}</span>. Övergången loggas i
        ägarhistoriken med dig som aktör.
      </p>
      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>}
      <Select
        label="Nytt ägande företag"
        options={[
          { value: '', label: 'Välj företag' },
          ...candidates.map((c) => ({ value: c.id, label: `${c.name} (${c.container_count} containrar)` })),
        ]}
        {...register('to_company_id')}
        error={errors.to_company_id?.message}
      />
      <Textarea label="Anledning" {...register('reason')} rows={2} placeholder="T.ex. kundbyte, avveckling..." />
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Avbryt
        </Button>
        <Button type="submit" disabled={isLoading} loading={isLoading}>
          Bekräfta överlåtelse
        </Button>
      </div>
    </form>
  );
}

function HistoryTimeline({ containerId }: { containerId: string }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['container-history', containerId],
    queryFn: () => api.get(`/containers/${containerId}/history`).then((r) => r.data),
  });

  if (isLoading) return <Loader message="Laddar historik..." />;

  const ownership = (history?.ownership ?? []) as OwnershipHistoryEntry[];
  const movements = (history?.movements ?? []) as ContainerMovement[];

  if (ownership.length === 0 && movements.length === 0) {
    return <p className="text-gray-500 text-sm">Ingen historik än.</p>;
  }

  return (
    <div className="space-y-4">
      {ownership.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Ägarhistorik</p>
          <ol className="space-y-2">
            {ownership.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <div>
                  <span className="text-gray-700">
                    {entry.from_company_name ?? '—'} <span aria-hidden>→</span> <span className="font-medium">{entry.to_company_name}</span>
                  </span>
                  <p className="text-gray-400 text-xs">
                    {formatDate(entry.changed_at)} · aktör {entry.changed_by_name}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {movements.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Transportrörelser</p>
          <ol className="space-y-2">
            {movements.map((m, index) => (
              <li key={`${m.order_id}-${index}`} className="flex items-start gap-3 text-sm">
                <span className="mt-1 w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                <div>
                  <span className="font-mono text-xs text-gray-700">{m.order_number}</span>
                  <span className="text-gray-500"> · {m.stop_type === 'pickup' ? 'hämtning' : 'avlämning'} på {m.site_name ?? 'okänd plats'}</span>
                  <p className="text-gray-400 text-xs">
                    {m.loaded_at ? `Lastad ${formatDate(m.loaded_at)}` : m.planned_at ? `Planerat ${formatDate(m.planned_at)}` : ''}
                    {m.unloaded_at ? ` · Lossad ${formatDate(m.unloaded_at)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ContainerDetailView({ container, onFillLevelChange, onTransfer }: { container: ContainerOverview; onFillLevelChange: (c: ContainerOverview, fl: FillLevel) => void; onTransfer: () => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium text-gray-900">Grundinformation</h4>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Containernummer:</dt><dd className="font-mono font-medium">{container.container_number}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">QR-kod:</dt><dd className="font-mono text-xs">{container.qr_code_value}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Typ:</dt><dd><ContainerTypeBadge type={container.type} /></dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Ägare:</dt><dd>{container.owning_company_name}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Status:</dt><dd><StatusBadge status={container.status} type="container" /></dd></div>
          </dl>
        </div>
        <div>
          <h4 className="font-medium text-gray-900">Placering & Status</h4>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Anläggning:</dt><dd>{container.current_site_name || 'Ej placerad'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Parkeringsplats:</dt><dd>{container.spot_code ? `${container.zone_name} ${container.spot_code}` : 'Ej tilldelad'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Fyllnadsgrad:</dt><dd>
              <div className="flex items-center gap-2">
                <FillLevelSelector value={container.fill_level} onChange={(v) => onFillLevelChange(container, v as FillLevel)} size="sm" />
                <span className={`px-2 py-1 text-sm font-medium rounded-full ${getFillLevelColor(container.fill_level)}`}>{container.fill_level}%</span>
              </div>
            </dd></div>
          </dl>
          <div className="mt-4">
            <Button variant="outline" size="sm" icon={<ArrowLeftRight className="w-4 h-4" />} onClick={onTransfer}>
              Överlåt ägande
            </Button>
          </div>
        </div>
        <div className="md:col-span-2">
          <h4 className="font-medium text-gray-900">Underhåll</h4>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Senast underhåll:</dt><dd>{container.last_maintenance_at ? formatDate(container.last_maintenance_at) : 'Aldrig'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Nästa underhåll:</dt><dd>{container.next_maintenance_due ? formatDate(container.next_maintenance_due) : 'Ej schemalagt'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Intervall:</dt><dd>{container.maintenance_interval_months} månader</dd></div>
          </dl>
        </div>
        <div className="md:col-span-2 border-t pt-4">
          <h4 className="font-medium text-gray-900 flex items-center gap-2"><History className="w-4 h-4" /> Historik</h4>
          <div className="mt-3">
            <HistoryTimeline containerId={container.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
