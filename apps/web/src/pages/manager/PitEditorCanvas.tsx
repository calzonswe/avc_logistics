// Canvas-based Pit Editor - Visual editor for pits using HTML5 Canvas
import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@avc/ui/components/Card';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Modal } from '@avc/ui/components/Modal';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Pit, Zone } from '@avc/shared-types';
import { pctToPx, worldToPct } from './mapCoords';

const pitFormSchema = z.object({
  name: z.string().min(1, 'Namn krävs'),
  material_type: z.string().min(1, 'Material krävs'),
  capacity_cubic_meters: z.number().positive('Kapacitet måste vara positiv').optional(),
  position_x: z.number().min(0).max(100),
  position_y: z.number().min(0).max(100),
  alert_threshold: z.enum(['0', '25', '50', '75', '100']),
});

type PitForm = z.infer<typeof pitFormSchema>;

// Zones are stored as GeoJSON polygons (schema: polygon_geojson/color_hex).
const zonePoints = (zone: Zone): number[][] => {
  const geom = zone.polygon_geojson as { coordinates?: number[][][] } | null;
  return geom?.coordinates?.[0] ?? [];
};

const FILL_LEVEL_COLORS: Record<string, string> = {
  '0': '#22c55e',
  '25': '#84cc16',
  '50': '#eab308',
  '75': '#f97316',
  '100': '#ef4444',
};

// Discrete fill levels per GLOSSARY; label shown as "0%" etc.
const fillPct = (level: string | null | undefined): number => Number(level ?? '0');

interface PitEditorCanvasProps {
  siteId: string;
  pits: Pit[];
  zones: Zone[];
  onSave: (pit: Partial<Pit>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pitsLoaded: boolean;
  mapData: any;
}

export function PitEditorCanvas({ siteId, pits, zones, onSave, onDelete, pitsLoaded, mapData }: PitEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [editingPit, setEditingPit] = useState<Pit | null>(null);
  const [selectedPit, setSelectedPit] = useState<Pit | null>(null);
  const [drawingMode, setDrawingMode] = useState<'idle' | 'placing' | 'editing'>('idle');
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);

  const form = useForm<PitForm>({
    resolver: zodResolver(pitFormSchema),
    defaultValues: {
      name: '',
      material_type: '',
      capacity_cubic_meters: undefined,
      position_x: 50,
      position_y: 50,
      alert_threshold: '75',
    },
  });

  // Load background image
  useEffect(() => {
    if (mapData?.site?.map_image_url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setBackgroundImage(img);
      img.src = mapData.site.map_image_url;
    }
  }, [mapData?.site?.map_image_url]);

  const handleOpenCreate = () => {
    form.reset({ name: '', material_type: '', capacity_cubic_meters: undefined, position_x: 50, position_y: 50, alert_threshold: '75' });
    setEditingPit(null);
    setDrawingMode('placing');
    setPosition({ x: 50, y: 50 });
    setModalOpen(true);
  };

  const handleEdit = (pit: Pit) => {
    form.reset({
      name: pit.name,
      material_type: pit.material_type,
      capacity_cubic_meters: pit.capacity_cubic_meters != null ? Number(pit.capacity_cubic_meters) : undefined,
      // DECIMAL columns arrive as strings from the API — coerce before zod sees them.
      position_x: Number(pit.position_x),
      position_y: Number(pit.position_y),
      alert_threshold: (pit.alert_threshold as '0' | '25' | '50' | '75' | '100') ?? '75',
    });
    setEditingPit(pit);
    setDrawingMode('editing');
    setPosition({ x: Number(pit.position_x), y: Number(pit.position_y) });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Är du säker på att du vill ta bort denna grop?')) {
      await onDelete(id);
    }
  };

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    // World px (after pan/zoom) -> percent of the map image (DB stores 0-100).
    const worldX = (e.clientX - rect.left - offset.x) / scale;
    const worldY = (e.clientY - rect.top - offset.y) / scale;
    const pct = worldToPct(worldX, worldY, rect.width, rect.height);

    if (drawingMode === 'placing') {
      setPosition(pct);
    } else if (drawingMode === 'editing' && editingPit) {
      setPosition(pct);
    } else {
      // Check if clicking on a pit (hit radius in world px)
      let foundPit = null;
      for (const pit of pits) {
        const dx = pctToPx(Number(pit.position_x), rect.width) - worldX;
        const dy = pctToPx(Number(pit.position_y), rect.height) - worldY;
        if (Math.sqrt(dx * dx + dy * dy) < 5 / scale) {
          foundPit = pit;
          break;
        }
      }
      setSelectedPit(foundPit);
    }
  }, [drawingMode, editingPit, pits, offset, scale]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = (e.clientX - dragStart.x) / scale;
    const dy = (e.clientY - dragStart.y) / scale;
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, dragStart, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.min(Math.max(prev * delta, 0.1), 5));
  }, []);

  const handleSubmit = async (data: PitForm) => {
    try {
      const payload: Partial<Pit> = {
        name: data.name,
        material_type: data.material_type,
        capacity_cubic_meters: data.capacity_cubic_meters ?? null,
        position_x: position.x,
        position_y: position.y,
        alert_threshold: data.alert_threshold,
      };
      if (editingPit) {
        await onSave({ ...payload, id: editingPit.id });
      } else {
        await onSave(payload);
      }
      setModalOpen(false);
      setDrawingMode('idle');
      setEditingPit(null);
    } catch (err) {
      console.error('Failed to save pit:', err);
    }
  };

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Apply transform
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Draw background image
    if (backgroundImage) {
      ctx.drawImage(backgroundImage, 0, 0, canvas.width / scale / dpr, canvas.height / scale / dpr);
    }

    // Draw zones as background (polygon points are stored as 0-100 percent)
    for (const zone of zones) {
      const points = zonePoints(zone);
      if (points.length >= 3) {
        const pts = points.map(p => [pctToPx(p[0], rect.width), pctToPx(p[1], rect.height)]);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.closePath();
        ctx.fillStyle = (zone.color_hex ?? '#3b82f6') + '20';
        ctx.fill();
        ctx.strokeStyle = zone.color_hex ?? '#3b82f6';
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }
    }

    // Draw pits — position + fill-level color
    for (const pit of pits) {
      const cx = pctToPx(Number(pit.position_x), rect.width);
      const cy = pctToPx(Number(pit.position_y), rect.height);
      const fill = fillPct(pit.fill_level as string);
      const fillLevelColor = FILL_LEVEL_COLORS[String(fill)] ?? '#6b7280';

      // Outer circle: fill-level color
      ctx.beginPath();
      ctx.arc(cx, cy, 10 / scale, 0, Math.PI * 2);
      ctx.fillStyle = fillLevelColor;
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = selectedPit?.id === pit.id ? 3 / scale : 2 / scale;
      ctx.stroke();

      // Inner circle: amber when this pit is being edited
      ctx.beginPath();
      ctx.arc(cx, cy, 4 / scale, 0, Math.PI * 2);
      ctx.fillStyle = editingPit?.id === pit.id ? '#f59e0b' : '#1f2937';
      ctx.fill();

      // Label
      ctx.fillStyle = '#000';
      ctx.font = `${10 / scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${pit.name} (${fill}%)`, cx, cy - 16 / scale);
    }

    // Draw preview point for placing/editing
    if (drawingMode === 'placing' || drawingMode === 'editing') {
      const px = pctToPx(position.x, rect.width);
      const py = pctToPx(position.y, rect.height);
      ctx.beginPath();
      ctx.arc(px, py, 10 / scale, 0, Math.PI * 2);
      ctx.fillStyle = editingPit ? '#f59e0b' : '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / scale;
      ctx.stroke();
    }

    ctx.restore();
  }, [pits, zones, editingPit, drawingMode, position, offset, scale, backgroundImage, selectedPit]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Gropar</h2>
        <Button onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Ny grop
        </Button>
      </div>

      <div className="relative border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
        <canvas
          ref={canvasRef}
          className="w-full h-[500px] cursor-crosshair"
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
        {!pitsLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-green-500 border-t-transparent" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
        <span>Skala: {Math.round(scale * 100)}%</span>
        <span>Gropar: {pits.length}</span>
        {drawingMode !== 'idle' && (
          <span className="text-green-600">
            {drawingMode === 'placing' ? 'Placerar ny grop' : 'Redigerar grop'}
          </span>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <p>Klicka på kartan för att placera grop. Dra för att flytta kartan. Scrolla för att zooma.</p>
        <p>Cirkelfärgen visar gropens fyllnadsgrad (grön → röd).</p>
      </div>

      {pits.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Namn</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kapacitet (m³)</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fyllnadsgrad</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Larmgräns</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Åtgärder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pits.map((pit) => {
                const fill = fillPct(pit.fill_level as string);
                const alerting = fill >= fillPct(pit.alert_threshold as string);
                return (
                  <tr key={pit.id} className={selectedPit?.id === pit.id ? 'bg-blue-50' : ''}>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">{pit.name}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{pit.material_type}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {pit.capacity_cubic_meters != null ? Number(pit.capacity_cubic_meters) : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-white text-xs font-medium"
                        style={{ backgroundColor: FILL_LEVEL_COLORS[String(fill)] ?? '#6b7280' }}
                      >
                        {fill}%
                      </span>
                      {alerting && (
                        <span className="ml-2 text-xs font-medium text-red-600">Larm</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">{fillPct(pit.alert_threshold as string)}%</td>
                    <td className="px-3 py-2 text-right text-sm">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(pit)} icon={<Edit className="w-4 h-4" />} className="mr-1">
                        Redigera
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(pit.id)} icon={<Trash2 className="w-4 h-4" />}>
                        Ta bort
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setDrawingMode('idle');
          setEditingPit(null);
        }}
        title={editingPit ? 'Redigera grop' : 'Ny grop'}
      >
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
              <Input {...form.register('name')} placeholder="T.ex. Trädgårdsgrop 1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
              <Input {...form.register('material_type')} placeholder="T.ex. Trädgårdsavfall" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kapacitet (m³, valfritt)</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                {...form.register('capacity_cubic_meters', {
                  // valueAsNumber yields NaN for an empty input; map that to undefined instead.
                  setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Larmgräns</label>
              <Select
                {...form.register('alert_threshold')}
                options={[
                  { value: '25', label: '25%' },
                  { value: '50', label: '50%' },
                  { value: '75', label: '75%' },
                  { value: '100', label: '100%' },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">X-position (0-100)</label>
              <Input type="number" step="0.1" min="0" max="100" {...form.register('position_x', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Y-position (0-100)</label>
              <Input type="number" step="0.1" min="0" max="100" {...form.register('position_y', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit" isLoading={false}>
              {editingPit ? 'Uppdatera' : 'Skapa'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
