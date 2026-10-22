// Canvas-based Zone Editor - Visual editor for zones using HTML5 Canvas
import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@avc/ui/components/Card';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Modal } from '@avc/ui/components/Modal';
import { Plus, Edit, Trash2, Map, Save, X, Eye } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Zone } from '@avc/shared-types';
import { pctToPx, worldToPct } from './mapCoords';

const zoneFormSchema = z.object({
  name: z.string().min(1, 'Namn krävs'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Ogiltig färg'),
  boundary: z.any(),
  sort_order: z.number().int().default(0),
});

type ZoneForm = z.infer<typeof zoneFormSchema>;

// Zones are stored as GeoJSON polygons (schema: polygon_geojson/color_hex);
// helpers convert them to/from the canvas' simple point arrays.
const zonePoints = (zone: Zone): number[][] => {
  const geom = zone.polygon_geojson as { coordinates?: number[][][] } | null;
  return geom?.coordinates?.[0] ?? [];
};
const zoneColor = (zone: Zone): string => zone.color_hex ?? '#3b82f6';

interface ZoneEditorCanvasProps {
  siteId: string;
  zones: Zone[];
  onSave: (zone: Partial<Zone> & { polygon_geojson: { type: 'Polygon'; coordinates: number[][][] } }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  zonesLoaded: boolean;
  mapData: any;
}

export function ZoneEditorCanvas({ siteId, zones, onSave, onDelete, zonesLoaded, mapData }: ZoneEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [drawingMode, setDrawingMode] = useState<'idle' | 'drawing' | 'editing'>('idle');
  const [drawingPoints, setDrawingPoints] = useState<number[][]>([]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);

  const form = useForm<ZoneForm>({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: {
      name: '',
      color: '#3b82f6',
      sort_order: 0,
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
  }, [mapData]);

  // Get mapData from parent - we need to pass it as prop
  // For now, we'll get it from the zones editor context

  const handleOpenCreate = () => {
    form.reset({ name: '', color: '#3b82f6', sort_order: 0 });
    setEditingZone(null);
    setDrawingMode('drawing');
    setDrawingPoints([]);
    setModalOpen(true);
  };

  const handleEdit = (zone: Zone) => {
    form.reset({
      name: zone.name,
      color: zoneColor(zone),
      sort_order: zone.sort_order || 0,
    });
    setEditingZone(zone);
    setDrawingMode('editing');
    if (zonePoints(zone).length > 0) {
      setDrawingPoints(zonePoints(zone));
    }
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Är du säker på att du vill ta bort denna zon?')) {
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

    if (drawingMode === 'drawing') {
      setDrawingPoints(prev => [...prev, [pct.x, pct.y]]);
    } else if (drawingMode === 'editing' && editingZone) {
      // Find closest point and move it (hit radius in world px)
      const points = drawingPoints.map((point, i) => {
        const dx = pctToPx(point[0], rect.width) - worldX;
        const dy = pctToPx(point[1], rect.height) - worldY;
        if (Math.sqrt(dx * dx + dy * dy) < 10 / scale) {
          return [pct.x, pct.y];
        }
        return point;
      });
      setDrawingPoints(points);
    } else {
      // Check if clicking on a zone (pointInPolygon works entirely in percent space)
      let foundZone = null;
      for (const zone of zones) {
        if (zonePoints(zone).length > 0 && pointInPolygon(pct, zonePoints(zone))) {
          foundZone = zone;
          break;
        }
      }
      setSelectedZone(foundZone);
    }
  }, [drawingMode, editingZone, zones, offset, scale, drawingPoints]);

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

  const handleSubmit = async (data: ZoneForm) => {
    if (drawingPoints.length < 3) {
      alert('En zon måste ha minst 3 hörn');
      return;
    }

    const boundary = [...drawingPoints, drawingPoints[0]]; // Close the polygon

    try {
      const payload: Partial<Zone> & { polygon_geojson: { type: 'Polygon'; coordinates: number[][][] } } = {
        name: data.name,
        color_hex: data.color,
        sort_order: data.sort_order,
        polygon_geojson: { type: 'Polygon', coordinates: [boundary] },
        ...(editingZone ? { id: editingZone.id } : {}),
      };
      await onSave(payload);
      setModalOpen(false);
      setDrawingMode('idle');
      setDrawingPoints([]);
      setEditingZone(null);
    } catch (err) {
      console.error('Failed to save zone:', err);
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

    // Draw zones (polygon points are stored as 0-100 percent)
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

        // Fill
        ctx.fillStyle = zoneColor(zone) + (selectedZone?.id === zone.id ? '80' : '40');
        ctx.fill();

        // Stroke
        ctx.strokeStyle = selectedZone?.id === zone.id ? '#000' : zoneColor(zone);
        ctx.lineWidth = selectedZone?.id === zone.id ? 3 / scale : 2 / scale;
        ctx.stroke();

        // Label
        const centerX = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
        const centerY = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
        ctx.fillStyle = '#000';
        ctx.font = `${14 / scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(zone.name, centerX, centerY);
      }
    }

    // Draw drawing points
    if (drawingMode === 'drawing' || drawingMode === 'editing') {
      if (drawingPoints.length > 0) {
        const pts = drawingPoints.map(p => [pctToPx(p[0], rect.width), pctToPx(p[1], rect.height)]);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        if (drawingMode === 'drawing' || pts.length > 2) {
          ctx.lineTo(pts[0][0], pts[0][1]);
        }
        ctx.strokeStyle = editingZone ? '#f59e0b' : '#3b82f6';
        ctx.lineWidth = 2 / scale;
        ctx.setLineDash([10 / scale, 10 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw points
        for (const point of pts) {
          ctx.beginPath();
          ctx.arc(point[0], point[1], 6 / scale, 0, Math.PI * 2);
          ctx.fillStyle = editingZone ? '#f59e0b' : '#3b82f6';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / scale;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [zones, editingZone, drawingMode, drawingPoints, offset, scale, backgroundImage, selectedZone]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Zoner</h2>
        <Button onClick={handleOpenCreate} icon={<Plus className="w-4 h-4" />}>
          Ny zon
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
        {!zonesLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
        <span>Skala: {Math.round(scale * 100)}%</span>
        <span>Zoner: {zones.length}</span>
        {drawingMode !== 'idle' && (
          <span className="text-blue-600">
            {drawingMode === 'drawing' ? 'Ritar ny zon' : 'Redigerar zon'} - {drawingPoints.length} punkter
          </span>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <p>Klicka för att lägga till hörn. Klicka på första punkten för att sluta rita.</p>
        <p>Scrolla för att zooma. Dra för att flytta kartan.</p>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setDrawingMode('idle');
          setDrawingPoints([]);
          setEditingZone(null);
        }}
        title={editingZone ? 'Redigera zon' : 'Ny zon'}
        size="lg"
      >
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
            <Input
              {...form.register('name')}
              error={form.formState.errors.name?.message}
              placeholder="Zonens namn"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Färg</label>
            <Input
              type="color"
              {...form.register('color')}
              className="w-12 h-10 p-0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sorteringsordning</label>
            <Input
              type="number"
              {...form.register('sort_order', { valueAsNumber: true })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={drawingPoints.length < 3} isLoading={false}>
              {editingZone ? 'Uppdatera' : 'Skapa'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

// Helper function to check if point is in polygon
function pointInPolygon(point: { x: number; y: number }, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}