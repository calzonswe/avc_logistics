// Vehicles Page
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { Table, createActionsColumn } from '@avc/ui/components/Table';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Modal } from '@avc/ui/components/Modal';
import { Card } from '@avc/ui/components/Card';
import { Loader } from '../../components/Loader';
import { Plus, Search, Edit, Eye, Trash2, Truck } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Vehicle } from '@avc/shared-types';

const vehicleFormSchema = z.object({
  registration_number: z.string().min(1, 'Registreringsnummer krävs'),
  name: z.string().min(1, 'Namn krävs'),
  type: z.string().min(1, 'Typ krävs'),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().positive().optional(),
  classification: z.enum(['transport', 'location_bound']),
  home_site_id: z.string().uuid().optional(),
  max_containers: z.number().int().positive().default(1),
});

type VehicleForm = z.infer<typeof vehicleFormSchema>;

const CLASSIFICATION_OPTIONS = [
  { value: 'transport', label: 'Transport' },
  { value: 'location_bound', label: 'Platsbunden' },
];

export function VehiclesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', classification: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', page, filters],
    queryFn: () =>
      api
        .get('/vehicles', {
          params: { page, limit: 20, ...filters },
        })
        .then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: VehicleForm) => api.post('/vehicles', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<VehicleForm> }) =>
      api.patch(`/vehicles/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setModalOpen(false);
      setEditingVehicle(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/vehicles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
  });

  const handleOpenCreate = () => {
    setEditingVehicle(null);
    setModalOpen(true);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Är du säker på att du vill ta bort detta fordon?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <Loader message="Laddar fordon..." />;

  const columns = [
    { header: 'Registreringsnummer', accessorKey: 'registration_number' },
    { header: 'Namn', accessorKey: 'name' },
    { header: 'Typ', accessorKey: 'type' },
    { header: 'Tillverkare', accessorKey: 'manufacturer' },
    { header: 'Modell', accessorKey: 'model' },
    { header: 'Årsmodell', accessorKey: 'year' },
    {
      header: 'Klassificering',
      accessorKey: 'classification',
      cell: ({ getValue }) => {
        const val = getValue();
        const opt = CLASSIFICATION_OPTIONS.find(o => o.value === val);
        return opt ? opt.label : val;
      },
    },
    createActionsColumn([
      { label: 'Visa', icon: Eye, onClick: handleEdit },
      { label: 'Redigera', icon: Edit, onClick: handleEdit },
      { label: 'Ta bort', icon: Trash2, onClick: (row) => handleDelete(row.id), variant: 'destructive' },
    ]),
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fordon</h1>
        <Button onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Nytt fordon
        </Button>
      </div>

      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Sök..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="flex-1 max-w-xs"
          icon={<Search className="w-4 h-4" />}
        />
        <Select
          value={filters.classification}
          onChange={(e) => setFilters({ ...filters, classification: e.target.value })}
          options={CLASSIFICATION_OPTIONS}
          placeholder="Klassificering"
        />
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
        emptyMessage="Inga fordon hittades"
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingVehicle ? 'Redigera fordon' : 'Nytt fordon'}
      >
        <VehicleForm
          onSubmit={editingVehicle ? updateMutation.mutate : createMutation.mutate}
          initialData={editingVehicle}
          isLoading={createMutation.isPending || updateMutation.isPending}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </Card>
  );
}

function VehicleForm({
  onSubmit,
  initialData,
  isLoading,
  onCancel,
}: {
  onSubmit: (data: VehicleForm | { id: string; data: Partial<VehicleForm> }) => void;
  initialData: Vehicle | null;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const form = useForm<VehicleForm>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      registration_number: initialData?.registration_number || '',
      name: initialData?.name || '',
      type: initialData?.type || '',
      manufacturer: initialData?.manufacturer || '',
      model: initialData?.model || '',
      year: initialData?.year || new Date().getFullYear(),
      classification: initialData?.classification || 'transport',
      home_site_id: initialData?.home_site_id || '',
      max_containers: initialData?.max_containers || 1,
    },
  });

  const handleSubmit = (data: VehicleForm) => {
    if (initialData) {
      onSubmit({ id: initialData.id, data });
    } else {
      onSubmit(data);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Registreringsnummer</label>
          <Input {...form.register('registration_number')} placeholder="ABC 123" disabled={!!initialData} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
          <Input {...form.register('name')} placeholder="Lastbil 1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
          <Input {...form.register('type')} placeholder="Hook lift" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tillverkare</label>
          <Input {...form.register('manufacturer')} placeholder="Volvo" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Modell</label>
          <Input {...form.register('model')} placeholder="FH16" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Årsmodell</label>
          <Input type="number" {...form.register('year', { valueAsNumber: true })} min={1990} max={new Date().getFullYear() + 1} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Klassificering</label>
          <Select
            {...form.register('classification')}
            options={CLASSIFICATION_OPTIONS}
            value={form.watch('classification')}
            onChange={(e) => form.setValue('classification', e.target.value as any)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hemmaplats</label>
          <Select
            {...form.register('home_site_id')}
            options={[]}
            placeholder="Välj plats (valfritt)"
            value={form.watch('home_site_id')}
            onChange={(e) => form.setValue('home_site_id', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max containrar</label>
          <Input type="number" min="1" {...form.register('max_containers', { valueAsNumber: true })} />
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