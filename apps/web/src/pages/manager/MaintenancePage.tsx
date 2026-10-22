// Maintenance Page
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { Table, createStatusColumn, createActionsColumn } from '@avc/ui/components/Table';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Modal } from '@avc/ui/components/Modal';
import { Card } from '@avc/ui/components/Card';
import { StatusBadge } from '@avc/ui/components/StatusBadge';
import { Loader } from '../../components/Loader';
import { Plus, Search, Filter, Edit, Eye, Trash2, Wrench } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { MaintenanceTask, MaintenanceStatus, MaintenanceType } from '@avc/shared-types';

const maintenanceTaskFormSchema = z.object({
  container_id: z.string().uuid('Välj container'),
  type: z.enum(['scheduled', 'condition_based']),
  status: z.enum(['due', 'in_progress', 'completed', 'overdue']),
  scheduled_for: z.string().datetime(),
  assigned_to: z.string().uuid().optional(),
  description: z.string().optional(),
});

type MaintenanceTaskForm = z.infer<typeof maintenanceTaskFormSchema>;

const STATUS_OPTIONS = [
  { value: 'due', label: 'Förestående' },
  { value: 'in_progress', label: 'Pågår' },
  { value: 'completed', label: 'Avslutad' },
  { value: 'overdue', label: 'Försenad' },
];

const TYPE_OPTIONS = [
  { value: 'scheduled', label: 'Schemalagd' },
  { value: 'condition_based', label: 'Kondition' },
];

export function MaintenancePage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    type: '',
    overdue_only: false,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MaintenanceTask | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['maintenance', page, filters],
    queryFn: () =>
      api
        .get('/maintenance', {
          params: { page, limit: 20, ...filters },
        })
        .then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: MaintenanceTaskForm) => api.post('/maintenance', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      setModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<MaintenanceTaskForm> }) =>
      api.patch(`/maintenance/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      setModalOpen(false);
      setEditingTask(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance'] }),
  });

  const handleOpenCreate = () => {
    setEditingTask(null);
    setModalOpen(true);
  };

  const handleEdit = (task: MaintenanceTask) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Är du säker på att du vill ta bort denna underhållsuppgift?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <Loader message="Laddar underhållsuppgifter..." />;

  const columns = [
    { header: 'Container', accessorKey: 'container_number' },
    { header: 'Typ', accessorKey: 'type' },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: ({ getValue }) => (
        <StatusBadge status={getValue() as MaintenanceStatus} />
      ),
    },
    { header: 'Planerad för', accessorKey: 'scheduled_for' },
    { header: 'Startad', accessorKey: 'started_at' },
    { header: 'Avslutad', accessorKey: 'completed_at' },
    { header: 'Tilldelad till', accessorKey: 'assigned_to_name' },
    createActionsColumn([
      { label: 'Visa', icon: Eye, onClick: handleEdit },
      { label: 'Redigera', icon: Edit, onClick: handleEdit },
      { label: 'Ta bort', icon: Trash2, onClick: (row) => handleDelete(row.id), variant: 'destructive' },
    ]),
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Underhåll</h1>
        <Button onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Ny underhållsuppgift
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <Input
          placeholder="Sök..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="flex-1 max-w-xs"
          icon={<Search className="w-4 h-4" />}
        />
        <Select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          options={STATUS_OPTIONS}
          placeholder="Status"
        />
        <Select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          options={TYPE_OPTIONS}
          placeholder="Typ"
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.overdue_only}
            onChange={(e) => setFilters({ ...filters, overdue_only: e.target.checked })}
            className="rounded border-gray-300"
          />
          Endast försenade
        </label>
      </div>

      <Table
        data={data?.data || []}
        columns={columns}
        pagination={{
          page: data?.meta.page || 1,
          pageCount: data?.meta.totalPages || 1,
          total: data?.meta.total || 0,
          onPageChange: setPage,
        }}
        isLoading={isLoading}
        emptyMessage="Inga underhållsuppgifter hittades"
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTask ? 'Redigera underhållsuppgift' : 'Ny underhållsuppgift'}
      >
        <MaintenanceTaskForm
          onSubmit={editingTask ? updateMutation.mutate : createMutation.mutate}
          initialData={editingTask}
          isLoading={createMutation.isPending || updateMutation.isPending}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </Card>
  );
}

function MaintenanceTaskForm({
  onSubmit,
  initialData,
  isLoading,
  onCancel,
}: {
  onSubmit: (data: MaintenanceTaskForm | { id: string; data: Partial<MaintenanceTaskForm> }) => void;
  initialData: MaintenanceTask | null;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const form = useForm<MaintenanceTaskForm>({
    resolver: zodResolver(maintenanceTaskFormSchema),
    defaultValues: {
      container_id: initialData?.container_id || '',
      type: initialData?.type || 'scheduled',
      status: initialData?.status || 'due',
      scheduled_for: initialData?.scheduled_for ? new Date(initialData.scheduled_for).toISOString().slice(0, 16) : '',
      assigned_to: initialData?.assigned_to || '',
      description: initialData?.description || '',
    },
  });

  const handleSubmit = (data: MaintenanceTaskForm) => {
    const submitData = {
      ...data,
      scheduled_for: data.scheduled_for ? new Date(data.scheduled_for).toISOString() : '',
    };
    if (initialData) {
      onSubmit({ id: initialData.id, data: submitData });
    } else {
      onSubmit(submitData);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Container</label>
          <Select
            {...form.register('container_id')}
            options={[]}
            placeholder="Välj container"
            value={form.watch('container_id')}
            onChange={(e) => form.setValue('container_id', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
          <Select
            {...form.register('type')}
            options={TYPE_OPTIONS}
            value={form.watch('type')}
            onChange={(e) => form.setValue('type', e.target.value as any)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <Select
            {...form.register('status')}
            options={STATUS_OPTIONS}
            value={form.watch('status')}
            onChange={(e) => form.setValue('status', e.target.value as any)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Planerad för</label>
          <Input
            type="datetime-local"
            {...form.register('scheduled_for')}
            value={form.watch('scheduled_for') ? form.watch('scheduled_for').slice(0, 16) : ''}
            onChange={(e) => form.setValue('scheduled_for', e.target.value ? new Date(e.target.value).toISOString() : '')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tilldelad till</label>
          <Select
            {...form.register('assigned_to')}
            options={[]}
            placeholder="Välj personal (valfritt)"
            value={form.watch('assigned_to')}
            onChange={(e) => form.setValue('assigned_to', e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
          <Input
            {...form.register('description')}
            placeholder="Beskrivning av underhållet..."
            multiline
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Avbryt
        </Button>
        <Button type="submit" disabled={isLoading} loading={isLoading}>
          {initialData ? 'Uppdatera' : 'Skapa'}
        </Button>
      </div>
    </form>
  );
}