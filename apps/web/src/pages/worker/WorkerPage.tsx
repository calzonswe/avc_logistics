// Worker Page - Mobile PWA for site workers (ticket 09)
//
// Tabs: pits (fill level + emptying), containers (fill level), maintenance
// (status), reports (damage report + swap request — the Worker App actions
// from GLOSSARY). All writes go through the worker service seam so ticket 14
// can route them through the offline queue.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalTable, useCachedSites } from '../../hooks/useLocalData';
import { useTranslation } from 'react-i18next';
import { api } from '../../utils/api';
import { Card } from '@avc/ui/components/Card';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Modal } from '@avc/ui/components/Modal';
import { Loader } from '../../components/Loader';
import { FillLevelIndicator, StatusBadge } from '@avc/ui/components';
import { Trash2, RefreshCw, CheckCircle, AlertTriangle, Wrench, Camera, Package, ArrowLeftRight, Upload } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import {
  listSitePits,
  listSiteContainers,
  listMaintenanceTasks,
  updatePitFillLevel,
  emptyPit,
  updateContainerFillLevel,
  updateMaintenanceStatus,
  uploadPhoto,
  createDamageReport,
  createSwapRequest,
} from '../../services/workerApi';
import { PushSettings } from '../../components/PushSettings';
import type { FillLevel, MaintenanceStatus } from '../../services/workerApi';

const FILL_LEVELS = ['0', '25', '50', '75', '100'];

export function WorkerPage() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'pits' | 'containers' | 'maintenance' | 'reports'>('pits');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const siteId = user?.site_id;

  // The site name (the worker must see which site they belong to) — from the
  // API when online, from the local cache when offline (ticket 15).
  const sites = useCachedSites();
  const siteName = sites.find((s: any) => s.id === siteId)?.name ?? null;

  // Offline-first reads (ticket 15): the local Dexie tables are rendered
  // immediately and refreshed from the server in the background.
  const { data: pitsData, isLoading: pitsLoading, refresh: refreshPits } = useLocalTable<any>('pits', { siteId });
  const { data: containersData, isLoading: containersLoading, refresh: refreshContainers } = useLocalTable<any>(
    'containers',
    { siteId, filter: (row: any) => row.current_site_id === siteId }
  );
  const { data: maintenanceData, isLoading: maintenanceLoading, refresh: refreshMaintenance } = useLocalTable<any>(
    'maintenanceTasks',
    { siteId, filter: (row: any) => !row.container_id || true }
  );

  const handleError = (err: any, fallback: string) => {
    setSuccess(null);
    setError(err?.response?.data?.error?.message ?? fallback);
  };

  const emptyPitMutation = useMutation({
    mutationFn: (id: string) => emptyPit(id),
    onSuccess: () => {
      void refreshPits();
      setError(null);
      setSuccess('Gropen är nu tom.');
    },
    onError: (err: any) => handleError(err, 'Kunde inte tömma gropen'),
  });

  const pitFillMutation = useMutation({
    mutationFn: ({ id, fill_level }: { id: string; fill_level: FillLevel }) => updatePitFillLevel(id, fill_level),
    onSuccess: () => {
      void refreshPits();
      setError(null);
    },
    onError: (err: any) => handleError(err, 'Kunde inte uppdatera fyllnadsgraden'),
  });

  const updateFillLevelMutation = useMutation({
    mutationFn: ({ id, fill_level }: { id: string; fill_level: FillLevel }) => updateContainerFillLevel(id, fill_level),
    onSuccess: () => {
      void refreshContainers();
      setError(null);
    },
    onError: (err: any) => handleError(err, 'Kunde inte uppdatera fyllnadsgraden'),
  });

  const updateMaintenanceMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MaintenanceStatus }) => updateMaintenanceStatus(id, status),
    onSuccess: () => {
      void refreshMaintenance();
      setError(null);
    },
    onError: (err: any) => handleError(err, 'Kunde inte uppdatera underhållsuppgiften'),
  });

  if (!siteId) {
    return (
      <Card className="text-center py-12">
        <AlertTriangle className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Ingen plats tilldelad</h2>
        <p className="text-gray-500">Din användare har ingen plats tilldelad. Kontakta administratören.</p>
      </Card>
    );
  }

  if (pitsLoading || containersLoading || maintenanceLoading) {
    return <Loader message="Laddar data..." />;
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('worker.title')}</h1>
          <p className="text-gray-500">
            {t('worker.site', { site: '' }).replace(':', '').trim()}:{' '}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
              {siteName ?? t('worker.assignedSite')}
            </span>
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void refreshPits();
            void refreshContainers();
            void refreshMaintenance();
          }}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          Uppdatera
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{success}</div>
      )}

      <div className="flex border-b mb-6">
        {(['pits', 'containers', 'maintenance', 'reports'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setError(null); setSuccess(null); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'pits' && <span className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> {t('worker.pits')}</span>}
            {tab === 'containers' && <span className="flex items-center gap-2"><Package className="w-4 h-4" /> {t('worker.containers')}</span>}
            {tab === 'maintenance' && <span className="flex items-center gap-2"><Wrench className="w-4 h-4" /> {t('worker.maintenance')}</span>}
            {tab === 'reports' && <span className="flex items-center gap-2"><Camera className="w-4 h-4" /> {t('worker.reports')}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'pits' && (
        <PitsTab
          pits={pitsData || []}
          onEmpty={(id) => emptyPitMutation.mutate(id)}
          isEmptying={emptyPitMutation.isPending && emptyPitMutation.variables === undefined}
          onFillLevel={(id, fill_level) => pitFillMutation.mutate({ id, fill_level })}
          updatingId={pitFillMutation.isPending ? pitFillMutation.variables?.id : undefined}
        />
      )}
      {activeTab === 'containers' && (
        <ContainersTab
          containers={containersData || []}
          onUpdateFillLevel={(id, fill_level) => updateFillLevelMutation.mutate({ id, fill_level })}
          updatingId={updateFillLevelMutation.isPending ? updateFillLevelMutation.variables?.id : undefined}
        />
      )}
      {activeTab === 'maintenance' && (
        <MaintenanceTab
          tasks={maintenanceData || []}
          onUpdate={(id, status) => updateMaintenanceMutation.mutate({ id, status })}
          updatingId={updateMaintenanceMutation.isPending ? updateMaintenanceMutation.variables?.id : undefined}
        />
      )}
      {activeTab === 'reports' && (
        <PushSettings />
      )}

      {activeTab === 'reports' && (
        <ReportsTab
          siteId={siteId}
          siteName={siteName}
          containers={containersData || []}
          onCreated={(message) => {
            setError(null);
            setSuccess(message);

          }}
          onError={handleError}
        />
      )}
    </div>
  );
}

function PitsTab({
  pits,
  onEmpty,
  isEmptying,
  onFillLevel,
  updatingId,
}: {
  pits: any[];
  onEmpty: (id: string) => void;
  isEmptying: boolean;
  onFillLevel: (id: string, fill_level: FillLevel) => void;
  updatingId?: string;
}) {
  const { t } = useTranslation();
  const pitsNeedingAttention = pits.filter((p) => parseInt(p.fill_level || '0') >= 75).length;

  return (
    <div className="space-y-6">
      {pitsNeedingAttention > 0 && (
        <Card className="border-red-200 bg-red-50">
          <div className="flex items-center gap-3 p-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-800">{t('worker.pitsNeedingAttention')}</h3>
              <p className="text-sm text-red-600">{t('worker.pitsNeedingAttentionCount', { count: pitsNeedingAttention })}</p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold mb-4">{t('worker.pits')}</h2>
        {pits.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{t('worker.noPits')}</p>
        ) : (
          <div className="space-y-3">
            {pits.map((pit) => (
              <PitWorkerCard
                key={pit.id}
                pit={pit}
                onEmpty={onEmpty}
                isEmptying={isEmptying}
                onFillLevel={onFillLevel}
                isUpdating={updatingId === pit.id}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PitWorkerCard({
  pit,
  onEmpty,
  isEmptying,
  onFillLevel,
  isUpdating,
}: {
  pit: any;
  onEmpty: (id: string) => void;
  isEmptying: boolean;
  onFillLevel: (id: string, fill_level: FillLevel) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation();
  const fillLevel = parseInt(pit.fill_level || '0');
  const isWarning = fillLevel >= 75;
  const isCritical = fillLevel >= 100;

  return (
    <div className={`p-4 rounded-lg border ${isCritical ? 'border-red-300 bg-red-50' : isWarning ? 'border-orange-200 bg-orange-50' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Trash2 className={`w-8 h-8 ${isCritical ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-gray-400'}`} />
          <div>
            <h3 className="font-semibold">{pit.name}</h3>
            <p className="text-sm text-gray-500">
              {pit.material_type}
              {pit.capacity_cubic_meters != null ? ` · ${t('worker.capacity', { value: Number(pit.capacity_cubic_meters) })}` : ''}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`flex items-center justify-end gap-2 ${isCritical ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-gray-600'}`}>
            <Trash2 className="w-5 h-5" />
            <span className={`text-2xl font-bold ${isCritical ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-green-600'}`}>
              {fillLevel}%
            </span>
          </div>
          <div className="mt-2 flex gap-2 items-center justify-end">
            <Select
              value={pit.fill_level}
              onChange={(e) => onFillLevel(pit.id, e.target.value as FillLevel)}
              options={FILL_LEVELS.map((l) => ({ value: l, label: `${l}%` }))}
              disabled={isUpdating}
              className="w-24"
            />
            <Button
              size="sm"
              variant={isWarning || isCritical ? 'destructive' : 'secondary'}
              onClick={() => {
                if (window.confirm(`Är du säker på att gropen "${pit.name}" är tömd? Fyllnadsgraden sätts till 0%.`)) {
                  onEmpty(pit.id);
                }
              }}
              disabled={isEmptying || fillLevel === 0}
              loading={isEmptying}
              icon={<CheckCircle className="w-4 h-4" />}
            >
              {t('worker.empty')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContainersTab({
  containers,
  onUpdateFillLevel,
  updatingId,
}: {
  containers: any[];
  onUpdateFillLevel: (id: string, fill_level: FillLevel) => void;
  updatingId?: string;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-lg font-semibold mb-4">{t('worker.containers')}</h2>
      {containers.length === 0 ? (
        <p className="text-gray-500 text-center py-8">{t('worker.noContainers')}</p>
      ) : (
        <div className="space-y-3">
          {containers.map((container) => (
            <ContainerWorkerCard
              key={container.id}
              container={container}
              onUpdateFillLevel={onUpdateFillLevel}
              isUpdating={updatingId === container.id}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function ContainerWorkerCard({
  container,
  onUpdateFillLevel,
  isUpdating,
}: {
  container: any;
  onUpdateFillLevel: (id: string, fill_level: FillLevel) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
            <Package className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <h3 className="font-medium">{container.container_number}</h3>
            <p className="text-sm text-gray-500">
              {container.type} · {container.zone_name || 'Okänd zon'}
              {container.spot_code ? ` · ${container.spot_code}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <FillLevelIndicator fillLevel={container.fill_level} size="md" showLabel />
          <Select
            value={container.fill_level}
            onChange={(e) => onUpdateFillLevel(container.id, e.target.value as FillLevel)}
            options={FILL_LEVELS.map((l) => ({ value: l, label: `${l}%` }))}
            disabled={isUpdating}
            className="w-24"
          />
        </div>
      </div>
    </div>
  );
}

function MaintenanceTab({
  tasks,
  onUpdate,
  updatingId,
}: {
  tasks: any[];
  onUpdate: (id: string, status: MaintenanceStatus) => void;
  updatingId?: string;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-lg font-semibold mb-4">{t('worker.maintenance')}</h2>
      {tasks.length === 0 ? (
        <p className="text-gray-500 text-center py-8">{t('worker.noMaintenance')}</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <MaintenanceWorkerCard
              key={task.id}
              task={task}
              onUpdate={onUpdate}
              isUpdating={updatingId === task.id}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function MaintenanceWorkerCard({
  task,
  onUpdate,
  isUpdating,
}: {
  task: any;
  onUpdate: (id: string, status: MaintenanceStatus) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation();
  // Only legal maintenance statuses (the enum is due/in_progress/completed/overdue).
  const statusLabels: Record<string, string> = {
    due: 'Förestående',
    in_progress: 'Pågår',
    completed: 'Avslutad',
    overdue: 'Försenad',
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Container: {task.container_number ?? task.container_id?.slice(0, 8)}</h3>
          <p className="text-sm text-gray-500">
            {task.type === 'condition_based' ? 'Tillståndsbaserat' : 'Schemalagd'} · Planerad:{' '}
            {task.scheduled_for ? new Date(task.scheduled_for).toLocaleString('sv-SE') : 'Okänt'}
          </p>
          {task.description && <p className="text-xs text-gray-600 mt-1">{task.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={task.status} />
          <Select
            value={task.status === 'overdue' ? 'due' : task.status}
            onChange={(e) => onUpdate(task.id, e.target.value as MaintenanceStatus)}
            options={[
              { value: 'due', label: 'Förestående' },
              { value: 'in_progress', label: 'Pågår' },
              { value: 'completed', label: 'Avslutad' },
            ]}
            disabled={isUpdating}
            className="w-40"
          />
        </div>
      </div>
    </div>
  );
}

function ReportsTab({
  siteId,
  siteName,
  containers,
  onCreated,
  onError,
}: {
  siteId: string;
  siteName: string | null;
  containers: any[];
  onCreated: (message: string) => void;
  onError: (err: any, fallback: string) => void;
}) {
  const { t } = useTranslation();
  const [damageOpen, setDamageOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold mb-4">{t('worker.reportProblem')}</h2>
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-medium text-blue-900 mb-2">Rapportera skada på container</h3>
            <p className="text-sm text-blue-700 mb-4">
              Beskriv skadan och välj allvarlighetsgrad. Stora skador skapar automatiskt en
              underhållsuppgift.
            </p>
            <Button variant="outline" onClick={() => setDamageOpen(true)} icon={<Camera className="w-4 h-4" />}>
              Rapportera skada
            </Button>
          </div>
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <h3 className="font-medium text-green-900 mb-2">Begär byte av container</h3>
            <p className="text-sm text-green-700 mb-4">
              {t('worker.requestSwapHint')}
            </p>
            <Button variant="outline" onClick={() => setSwapOpen(true)} icon={<ArrowLeftRight className="w-4 h-4" />}>
              Begär byte
            </Button>
          </div>
        </div>
      </Card>

      <DamageReportModal
        isOpen={damageOpen}
        onClose={() => setDamageOpen(false)}
        containers={containers}
        onCreated={() => {
          setDamageOpen(false);
          onCreated('Skaderapporten är skickad.');
        }}
        onError={onError}
      />

      <SwapRequestModal
        isOpen={swapOpen}
        onClose={() => setSwapOpen(false)}
        siteId={siteId}
        siteName={siteName}
        containers={containers}
        onCreated={() => {
          setSwapOpen(false);
          onCreated('Bytbegäran är skickad.');
        }}
        onError={onError}
      />
    </div>
  );
}

function DamageReportModal({
  isOpen,
  onClose,
  containers,
  onCreated,
  onError,
}: {
  isOpen: boolean;
  onClose: () => void;
  containers: any[];
  onCreated: () => void;
  onError: (err: any, fallback: string) => void;
}) {
  const { t } = useTranslation();
  const [containerId, setContainerId] = useState('');
  const [severity, setSeverity] = useState<'minor' | 'major' | 'critical'>('minor');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      createDamageReport({
        container_id: containerId,
        severity,
        description,
        ...(photoUrl ? { photos: [{ url: photoUrl, taken_at: new Date().toISOString() }] } : {}),
      }),
    onSuccess: onCreated,
    onError: (err: any) => onError(err, 'Kunde inte skicka skaderapporten'),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setPhotoUrl(url);
    } catch (err: any) {
      onError(err, 'Kunde inte ladda upp bilden');
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (!containerId) {
      onError(null, 'Välj en container');
      return;
    }
    if (!description.trim()) {
      onError(null, 'Beskriv skadan');
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rapportera skada">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Container</label>
          <Select
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
            options={[
              { value: '', label: 'Välj container' },
              ...containers.map((c) => ({ value: c.id, label: `${c.container_number} (${c.type})` })),
            ]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Allvarlighetsgrad</label>
          <Select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as any)}
            options={[
              { value: 'minor', label: 'Liten — ingen åtgärd behövs' },
              { value: 'major', label: 'Stor — underhåll krävs' },
              { value: 'critical', label: 'Kritisk — container kan ej användas' },
            ]}
          />
          {severity !== 'minor' && (
            <p className="text-xs text-amber-700 mt-1">
              En underhållsuppgift skapas automatiskt för denna skada.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beskriv skadan..."
            multiline
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Foto (valfritt)</label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm">
              <Upload className="w-4 h-4" />
              {uploading ? 'Laddar upp...' : photoUrl ? 'Byt bild' : 'Välj bild'}
            </span>
          </label>
          {photoUrl && <p className="text-xs text-green-700 mt-1">Bild uppladdad ✓</p>}
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button onClick={submit} loading={mutation.isPending} disabled={uploading}>
            Skicka rapport
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SwapRequestModal({
  isOpen,
  onClose,
  siteId,
  siteName,
  containers,
  onCreated,
  onError,
}: {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string | null;
  containers: any[];
  onCreated: () => void;
  onError: (err: any, fallback: string) => void;
}) {
  const { t } = useTranslation();
  const [containerId, setContainerId] = useState('');
  const [preferredType, setPreferredType] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createSwapRequest({
        site_id: siteId,
        current_container_id: containerId || null,
        preferred_container_type: (preferredType || null) as any,
        reason: reason || null,
      }),
    onSuccess: onCreated,
    onError: (err: any) => onError(err, 'Kunde inte skicka bytbegäran'),
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Begär byte av container">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Bytbegäran skickas till förvaltningen{siteName ? ` för ${siteName}` : ''}.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Container att byta (valfritt)</label>
          <Select
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
            options={[
              { value: '', label: 'Ingen specifik container' },
              ...containers.map((c) => ({ value: c.id, label: `${c.container_number} (${c.type})` })),
            ]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Önskad typ (valfritt)</label>
          <Select
            value={preferredType}
            onChange={(e) => setPreferredType(e.target.value)}
            options={[
              { value: '', label: 'Ingen preferens' },
              { value: 'open_top', label: 'Öppen container' },
              { value: 'closed', label: 'Stängd container' },
              { value: 'compactor', label: 'Kompressor' },
              { value: 'roll_off', label: 'Roll-off' },
            ]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Anledning</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="T.ex. trasig botten"
            multiline
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Skicka bytbegäran
          </Button>
        </div>
      </div>
    </Modal>
  );
}
