// Map Editor Page
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { Card } from '@avc/ui/components/Card';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Modal } from '@avc/ui/components/Modal';
import { Loader } from '../../components/Loader';
import { Plus, Edit, Trash2, Map, Image, Upload, Save, Eye, MapPin } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Site, Zone, ParkingSpot, Ramp, Pit, WasteCategory } from '@avc/shared-types';
import { useSearchParams } from 'react-router-dom';
import { ZoneEditorCanvas } from './ZoneEditorCanvas';
import { SpotEditorCanvas } from './SpotEditorCanvas';
import { RampEditorCanvas } from './RampEditorCanvas';
import { PitEditorCanvas } from './PitEditorCanvas';

export function MapEditorPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [siteId, setSiteId] = useState<string>(searchParams.get('site') ?? '');
  const [sites, setSites] = useState<Site[]>([]);
  const [activeTab, setActiveTab] = useState<'zones' | 'spots' | 'ramps' | 'pits' | 'image'>('zones');

  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data.data),
  });

  const { data: wasteCategories } = useQuery({
    queryKey: ['wasteCategories', siteId],
    queryFn: () => api.get(`/sites/${siteId}/waste-categories`).then((r) => r.data.data ?? r.data),
    enabled: !!siteId,
  });

  useEffect(() => {
    if (sitesData) {
      setSites(sitesData);
      if (!siteId && sitesData.length > 0) {
        setSiteId(sitesData[0].id);
      }
    }
  }, [sitesData]);

  const { data: mapData, isLoading } = useQuery({
    queryKey: ['mapData', siteId],
    queryFn: () => api.get(`/map/site/${siteId}`).then((r) => r.data),
    enabled: !!siteId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post(`/map/site/${siteId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mapData', siteId] });
    },
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  if (sitesLoading) return <Loader message="Laddar platser..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kartredigerare</h1>
        <Select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          options={sites.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="Välj plats"
          className="w-64"
        />
      </div>

      {isLoading && <Loader message="Laddar karta..." />}

      {!isLoading && mapData && (
        <>
          <div className="flex border-b mb-6">
            {(['image', 'zones', 'spots', 'ramps', 'pits'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'image' && <span className="flex items-center gap-2"><Image className="w-4 h-4" /> Kartbild</span>}
                {tab === 'zones' && <span className="flex items-center gap-2"><Map className="w-4 h-4" /> Zoner</span>}
                {tab === 'spots' && <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Parkeringsplatser</span>}
                {tab === 'ramps' && <span className="flex items-center gap-2"><Upload className="w-4 h-4" /> Rampar</span>}
                {tab === 'pits' && <span className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> Grop</span>}
              </button>
            ))}
          </div>

          {activeTab === 'image' && (
            <ImageEditor
              siteId={siteId}
              mapData={mapData}
              uploadMutation={uploadMutation}
              onUpload={handleImageUpload}
            />
          )}

          {activeTab === 'zones' && (
            <ZoneEditorCanvas
              siteId={siteId}
              zones={mapData.zones}
              onSave={async (zone) => {
                if (zone.id) {
                  await api.patch(`/map/site/${siteId}/zones/${zone.id}`, zone);
                } else {
                  await api.post(`/map/site/${siteId}/zones`, zone);
                }
                queryClient.invalidateQueries({ queryKey: ['mapData', siteId] });
              }}
              onDelete={async (id) => {
                await api.delete(`/map/site/${siteId}/zones/${id}`);
                queryClient.invalidateQueries({ queryKey: ['mapData', siteId] });
              }}
              zonesLoaded={!!mapData?.zones}
              mapData={mapData}
            />
          )}

          {activeTab === 'spots' && (
            <SpotEditorCanvas
              siteId={siteId}
              spots={mapData.parkingSpots}
              zones={mapData.zones}
              onSave={async (spot) => {
                if (spot.id) {
                  await api.patch(`/map/site/${siteId}/parking-spots/${spot.id}`, spot);
                } else {
                  await api.post(`/map/site/${siteId}/parking-spots`, spot);
                }
                queryClient.invalidateQueries({ queryKey: ['mapData', siteId] });
              }}
              onDelete={async (id) => {
                await api.delete(`/map/site/${siteId}/parking-spots/${id}`);
                queryClient.invalidateQueries({ queryKey: ['mapData', siteId] });
              }}
              spotsLoaded={!!mapData?.parkingSpots}
              mapData={mapData}
            />
          )}

          {activeTab === 'ramps' && (
            <RampEditorCanvas
              siteId={siteId}
              ramps={mapData.ramps}
              zones={mapData.zones}
              wasteCategories={wasteCategories ?? []}
              onSave={async (ramp) => {
                if (ramp.id) {
                  await api.patch(`/map/site/${siteId}/ramps/${ramp.id}`, ramp);
                } else {
                  await api.post(`/map/site/${siteId}/ramps`, ramp);
                }
                queryClient.invalidateQueries({ queryKey: ['mapData', siteId] });
              }}
              onDelete={async (id) => {
                await api.delete(`/map/site/${siteId}/ramps/${id}`);
                queryClient.invalidateQueries({ queryKey: ['mapData', siteId] });
              }}
              rampsLoaded={!!mapData?.ramps}
              mapData={mapData}
            />
          )}

          {activeTab === 'pits' && (
            <PitEditorCanvas
              siteId={siteId}
              pits={mapData.pits}
              zones={mapData.zones}
              onSave={async (pit) => {
                if (pit.id && typeof pit.id === 'string') {
                  const { id: _id, ...body } = pit;
                  await api.patch(`/map/site/${siteId}/pits/${pit.id}`, body);
                } else {
                  await api.post(`/map/site/${siteId}/pits`, pit);
                }
                queryClient.invalidateQueries({ queryKey: ['mapData', siteId] });
              }}
              onDelete={async (id) => {
                await api.delete(`/map/site/${siteId}/pits/${id}`);
                queryClient.invalidateQueries({ queryKey: ['mapData', siteId] });
              }}
              pitsLoaded={!!mapData?.pits}
              mapData={mapData}
            />
          )}
        </>
      )}
    </div>
  );
}

function ImageEditor({ siteId, mapData, uploadMutation, onUpload }: { siteId: string; mapData: any; uploadMutation: any; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Kartbild</h2>
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onUpload}
            className="sr-only"
            id="map-image-upload"
            disabled={uploadMutation.isPending}
          />
          <Button
            variant="outline"
            disabled={uploadMutation.isPending}
            onClick={() => document.getElementById('map-image-upload')?.click()}
            icon={<Upload className="w-4 h-4" />}
          >
            Ladda upp kartbild
          </Button>
        </label>
      </div>

      {mapData.site.map_image_url && (
        <div className="relative max-w-4xl mx-auto">
          <img
            src={mapData.site.map_image_url}
            alt="Kartbild"
            className="max-w-full h-auto rounded-lg border"
          />
          <div className="absolute top-4 right-4">
            <p className="text-sm text-gray-500 bg-white/80 px-2 py-1 rounded">
              Klicka för att ladda upp ny
            </p>
          </div>
        </div>
      )}

      {uploadMutation.isPending && (
        <div className="text-center py-8">
          <Loader message="Laddar upp..." />
        </div>
      )}
    </Card>
  );
}
