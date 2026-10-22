// Sites Page
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import { Table, createActionsColumn } from '@avc/ui/components/Table';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Modal } from '@avc/ui/components/Modal';
import { Card } from '@avc/ui/components/Card';
import { Loader } from '../../components/Loader';
import { Plus, Search, Edit, Eye, MapPin, Map, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Site } from '@avc/shared-types';

const siteFormSchema = z.object({
  name: z.string().min(1, 'Namn krävs'),
  address: z.string().min(1, 'Adress krävs'),
  gps_lat: z.number().optional(),
  gps_lng: z.number().optional(),
});

type SiteForm = z.infer<typeof siteFormSchema>;

export function SitesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sites', page, filters],
    queryFn: () =>
      api
        .get('/sites', {
          params: { page, limit: 20, ...filters },
        })
        .then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: SiteForm) => api.post('/sites', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SiteForm> }) =>
      api.patch(`/sites/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setModalOpen(false);
      setEditingSite(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sites/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sites'] }),
  });

  const handleOpenCreate = () => {
    setEditingSite(null);
    setModalOpen(true);
  };

  const handleEdit = (site: Site) => {
    setEditingSite(site);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Är du säker på att du vill ta bort denna plats?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <Loader message="Laddar platser..." />;

  const columns = [
    { header: 'Namn', accessorKey: 'name' },
    { header: 'Adress', accessorKey: 'address' },
    { header: 'GPS Lat', accessorKey: 'gps_lat' },
    { header: 'GPS Lng', accessorKey: 'gps_lng' },
    createActionsColumn([
      { label: 'Visa', icon: Eye, onClick: handleEdit },
      { label: 'Redigera', icon: Edit, onClick: handleEdit },
      { label: 'Karta', icon: Map, onClick: (row) => navigate(`/manager/map?site=${row.id}`) },
      { label: 'Ta bort', icon: Trash2, onClick: (row) => handleDelete(row.id), variant: 'destructive' },
    ]),
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Platser</h1>
        <Button onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Ny plats
        </Button>
      </div>

      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Sök namn eller adress..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="flex-1 max-w-xs"
          icon={<Search className="w-4 h-4" />}
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
        emptyMessage="Inga platser hittades"
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSite ? 'Redigera plats' : 'Ny plats'}
      >
        <SiteForm
          onSubmit={editingSite ? updateMutation.mutate : createMutation.mutate}
          initialData={editingSite}
          isLoading={createMutation.isPending || updateMutation.isPending}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </Card>
  );
}

function SiteForm({
  onSubmit,
  initialData,
  isLoading,
  onCancel,
}: {
  onSubmit: (data: SiteForm | { id: string; data: Partial<SiteForm> }) => void;
  initialData: Site | null;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const form = useForm<SiteForm>({
    resolver: zodResolver(siteFormSchema),
    defaultValues: {
      name: initialData?.name || '',
      address: initialData?.address || '',
      gps_lat: initialData?.gps_lat || 0,
      gps_lng: initialData?.gps_lng || 0,
    },
  });

  const handleSubmit = (data: SiteForm) => {
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
          <Input {...form.register('name')} placeholder="Platsnamn" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Adress</label>
          <Input {...form.register('address')} placeholder="Adress" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GPS Latitud</label>
          <Input type="number" step="any" {...form.register('gps_lat', { valueAsNumber: true })} placeholder="59.3293" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GPS Longitud</label>
          <Input type="number" step="any" {...form.register('gps_lng', { valueAsNumber: true })} placeholder="18.0686" />
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