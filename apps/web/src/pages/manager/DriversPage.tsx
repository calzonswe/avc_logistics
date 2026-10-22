// Drivers Page
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
import { Plus, Search, Edit, Eye, Trash2, User as UserIcon } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { User } from '@avc/shared-types';

const driverFormSchema = z.object({
  email: z.string().email('Ogiltig e-post'),
  full_name: z.string().min(1, 'Namn krävs'),
  password: z.string().min(8, 'Lösenord måste vara minst 8 tecken').optional(),
  site_id: z.string().uuid().optional(),
});

type DriverForm = z.infer<typeof driverFormSchema>;

export function DriversPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<User | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', page, filters],
    queryFn: () =>
      api
        .get('/drivers', {
          params: { page, limit: 20, ...filters },
        })
        .then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: DriverForm) => api.post('/drivers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      setModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DriverForm> }) =>
      api.patch(`/drivers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      setModalOpen(false);
      setEditingDriver(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/drivers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const handleOpenCreate = () => {
    setEditingDriver(null);
    setModalOpen(true);
  };

  const handleEdit = (driver: User) => {
    setEditingDriver(driver);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Är du säker på att du vill ta bort denna förare?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <Loader message="Laddar förare..." />;

  const columns = [
    { header: 'Namn', accessorKey: 'full_name' },
    { header: 'E-post', accessorKey: 'email' },
    { header: 'Plats', accessorKey: 'site_id' },
    { header: 'Senast inloggad', accessorKey: 'last_login_at' },
    { header: 'Skapad', accessorKey: 'created_at' },
    createActionsColumn([
      { label: 'Visa', icon: Eye, onClick: handleEdit },
      { label: 'Redigera', icon: Edit, onClick: handleEdit },
      { label: 'Ta bort', icon: Trash2, onClick: (row) => handleDelete(row.id), variant: 'destructive' },
    ]),
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Förare</h1>
        <Button onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Ny förare
        </Button>
      </div>

      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Sök namn eller e-post..."
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
        emptyMessage="Inga förare hittades"
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingDriver ? 'Redigera förare' : 'Ny förare'}
      >
        <DriverForm
          onSubmit={editingDriver ? updateMutation.mutate : createMutation.mutate}
          initialData={editingDriver}
          isLoading={createMutation.isPending || updateMutation.isPending}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </Card>
  );
}

function DriverForm({
  onSubmit,
  initialData,
  isLoading,
  onCancel,
}: {
  onSubmit: (data: DriverForm | { id: string; data: Partial<DriverForm> }) => void;
  initialData: User | null;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const form = useForm<DriverForm>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: {
      email: initialData?.email || '',
      full_name: initialData?.full_name || '',
      password: '',
      site_id: initialData?.site_id || '',
    },
  });

  const handleSubmit = (data: DriverForm) => {
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
          <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
          <Input type="email" {...form.register('email')} placeholder="foreare@avc.se" disabled={!!initialData} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
          <Input {...form.register('full_name')} placeholder="Erik Andersson" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lösenord {initialData ? '(lämna tomt för att behålla nuvarande)' : '*'}
          </label>
          <Input type="password" {...form.register('password')} placeholder={initialData ? '••••••••' : 'Minst 8 tecken'} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plats</label>
          <Select
            {...form.register('site_id')}
            options={[]}
            placeholder="Välj plats (valfritt)"
            value={form.watch('site_id')}
            onChange={(e) => form.setValue('site_id', e.target.value)}
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