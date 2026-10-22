// Canvas-based Ramp Editor - Visual editor for ramps using HTML5 Canvas
import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@avc/ui/components/Card';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Modal } from '@avc/ui/components/Modal';
import { Plus, Edit, Trash2, Upload, Save, X } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Ramp, Zone, WasteCategory } from '@avc/shared-types';
import { pctToPx, worldToPct } from './mapCoords';

const rampFormSchema = z.object({
  name: z.string().min(1, 'Namn krävs'),
  position_x: z.number().min(0).max(100),
  position_y: z.number().min(0).max(100),
  waste_category_id: z.string().uuid('Välj avfallskategori'),
});

type RampForm = z.infer<typeof rampFormSchema>;

// Zones are stored as GeoJSON polygons (schema: polygon_geojson/color_hex).
const zonePoints = (zone: Zone): number[][] => {
  const geom = zone.polygon_geojson as { coordinates?: number[][][] } | null;
  return geom?.coordinates?.[0] ?? [];
};

interface RampEditorCanvasProps {
  siteId: string;
  ramps: Ramp[];
  zones: Zone[];
  wasteCategories: WasteCategory[];
  onSave: (ramp: Partial<Ramp>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  rampsLoaded: boolean;
  mapData: any;
}

export function RampEditorCanvas({ siteId, ramps, zones, wasteCategories, onSave, onDelete, rampsLoaded, mapData }: RampEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [editingRamp, setEditingRamp] = useState<Ramp | null>(null);
  const [selectedRamp, setSelectedRamp] = useState<Ramp | null>(null);
  const [drawingMode, setDrawingMode] = useState<'idle' | 'placing' | 'editing'>('idle');
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);

  const form = useForm<RampForm>({
    resolver: zodResolver(rampFormSchema),
    defaultValues: {
      name: '',
      position_x: 50,
      position_y: 50,
      waste_category_id: '',
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
    form.reset({ name: '', position_x: 50, position_y: 50, waste_category_id: '' });
    setEditingRamp(null);
    setDrawingMode('placing');
    setPosition({ x: 50, y: 50 });
    setModalOpen(true);
  };

  const handleEdit = (ramp: Ramp) => {
    form.reset({
      name: ramp.name,
      // DECIMAL columns arrive as strings from the API — coerce before zod sees them.
      position_x: Number(ramp.position_x),
      position_y: Number(ramp.position_y),
      waste_category_id: ramp.waste_category_id,
    });
    setEditingRamp(ramp);
    setDrawingMode('editing');
    setPosition({ x: Number(ramp.position_x), y: Number(ramp.position_y) });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Är du säker på att du vill ta bort denna ramp?')) {
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
    } else if (drawingMode === 'editing' && editingRamp) {
      setPosition(pct);
    } else {
      // Check if clicking on a ramp (hit radius in world px)
      let foundRamp = null;
      for (const ramp of ramps) {
        const dx = pctToPx(ramp.position_x, rect.width) - worldX;
        const dy = pctToPx(ramp.position_y, rect.height) - worldY;
        if (Math.sqrt(dx * dx + dy * dy) < 5 / scale) {
          foundRamp = ramp;
          break;
        }
      }
      setSelectedRamp(foundRamp);
    }
  }, [drawingMode, editingRamp, ramps, offset, scale]);

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

  const handleSubmit = async (data: RampForm) => {
    try {
      if (editingRamp) {
        await onSave({ ...data, id: editingRamp.id, position_x: position.x, position_y: position.y });
      } else {
        await onSave({ ...data, position_x: position.x, position_y: position.y });
      }
      setModalOpen(false);
      setDrawingMode('idle');
      setEditingRamp(null);
    } catch (err) {
      console.error('Failed to save ramp:', err);
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

    // Draw ramps
    for (const ramp of ramps) {
      const cx = pctToPx(ramp.position_x, rect.width);
      const cy = pctToPx(ramp.position_y, rect.height);
      ctx.beginPath();
      ctx.moveTo(cx - 12 / scale, cy);
      ctx.lineTo(cx + 12 / scale, cy);
      ctx.lineTo(cx, cy - 12 / scale);
      ctx.closePath();

      if (selectedRamp?.id === ramp.id) {
        ctx.fillStyle = '#3b82f6';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3 / scale;
      } else if (editingRamp?.id === ramp.id) {
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2 / scale;
      } else {
        ctx.fillStyle = '#8b5cf6';
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2 / scale;
      }
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle = '#000';
      ctx.font = `${10 / scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(ramp.name, cx, cy - 18 / scale);
    }

    // Draw preview point for placing/editing
    if (drawingMode === 'placing' || drawingMode === 'editing') {
      const px = pctToPx(position.x, rect.width);
      const py = pctToPx(position.y, rect.height);
      ctx.beginPath();
      ctx.moveTo(px - 12 / scale, py);
      ctx.lineTo(px + 12 / scale, py);
      ctx.lineTo(px, py - 12 / scale);
      ctx.closePath();
      ctx.fillStyle = editingRamp ? '#f59e0b' : '#8b5cf6';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / scale;
      ctx.stroke();
    }

    ctx.restore();
  }, [ramps, zones, editingRamp, drawingMode, position, offset, scale, backgroundImage, selectedRamp]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Rampar</h2>
        <Button onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Ny ramp
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
        {!rampsLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
        <span>Skala: {Math.round(scale * 100)}%</span>
        <span>Rampar: {ramps.length}</span>
        {drawingMode !== 'idle' && (
          <span className="text-purple-600">
            {drawingMode === 'placing' ? 'Placerar ny ramp' : 'Redigerar ramp'}
          </span>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <p>Klicka på kartan för att placera ramp. Dra för att flytta kartan. Scrolla för att zooma.</p>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setDrawingMode('idle');
          setEditingRamp(null);
        }}
        title={editingRamp ? 'Redigera ramp' : 'Ny ramp'}
      >
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
              <Input {...form.register('name')} placeholder="T.ex. Ramp 1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">X-position (0-100)</label>
              <Input type="number" step="0.1" min="0" max="100" {...form.register('position_x', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Y-position (0-100)</label>
              <Input type="number" step="0.1" min="0" max="100" {...form.register('position_y', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Avfallskategori</label>
              <Select
                {...form.register('waste_category_id')}
                options={wasteCategories.map(c => ({ value: c.id, label: c.name }))}
                placeholder="Välj kategori"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit" isLoading={false}>
              {editingRamp ? 'Uppdatera' : 'Skapa'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}