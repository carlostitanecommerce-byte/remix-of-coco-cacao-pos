import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { UserPlus, X, Plus, Search, Sparkles, Gift } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { verificarStock } from '@/hooks/useValidarStock';
import type { Area } from './types';
import { dateToCDMX } from '@/lib/utils';

interface Tarifa {
  id: string;
  nombre: string;
  precio_base: number;
  tipo_cobro: string;
  areas_aplicables: string[];
  metodo_fraccion: string;
  minutos_tolerancia: number;
  activo?: boolean;
  [key: string]: any;
}

interface UpsellOption {
  producto_id: string;
  nombre: string;
  precio_especial: number;
}

interface AmenityOption {
  producto_id: string;
  nombre: string;
  cantidad_incluida: number;
}

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio_venta: number;
}

interface ExtraItem {
  producto_id: string;
  nombre: string;
  precio: number;
  isSpecial: boolean;
}

interface Props {
  areas: Area[];
  getOccupancy: (areaId: string) => number;
  getAvailablePax: (areaId: string) => number;
  onSuccess?: () => void | Promise<void>;
}

export function CheckInDialog({ areas, getOccupancy, getAvailablePax, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clienteNombre, setClienteNombre] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [paxCount, setPaxCount] = useState('1');
  const [horas, setHoras] = useState('1');
  const [creating, setCreating] = useState(false);

  // Tarifa & upsell state
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [selectedTarifaId, setSelectedTarifaId] = useState('');
  const [upsellOptions, setUpsellOptions] = useState<UpsellOption[]>([]);
  const [amenityOptions, setAmenityOptions] = useState<AmenityOption[]>([]);

  // Unified product search for extra consumption at check-in
  const [productos, setProductos] = useState<Producto[]>([]);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [search, setSearch] = useState('');

  const selectedArea = areas.find(a => a.id === selectedAreaId);
  const isPublicArea = selectedArea ? !selectedArea.es_privado : false;

  // Force pax=1 for public areas
  useEffect(() => {
    if (isPublicArea) {
      setPaxCount('1');
    }
  }, [isPublicArea]);

  // Load tarifas + productos on open
  useEffect(() => {
    if (!open) return;
    const fetchOpenData = async () => {
      const [tarifasRes, prodRes] = await Promise.all([
        supabase.from('tarifas_coworking').select('*').eq('activo', true),
        supabase.from('productos').select('id, nombre, categoria, precio_venta').eq('activo', true).order('nombre'),
      ]);
      setTarifas((tarifasRes.data as Tarifa[]) ?? []);
      setProductos((prodRes.data as Producto[]) ?? []);
    };
    fetchOpenData();
  }, [open]);

  // Filter tarifas by selected area
  const applicableTarifas = selectedAreaId
    ? tarifas.filter(t => (t.areas_aplicables as string[])?.includes(selectedAreaId))
    : [];

  // Auto-select tarifa if only one applies
  useEffect(() => {
    if (applicableTarifas.length === 1) {
      setSelectedTarifaId(applicableTarifas[0].id);
    } else if (!applicableTarifas.find(t => t.id === selectedTarifaId)) {
      setSelectedTarifaId('');
    }
  }, [selectedAreaId, applicableTarifas.length]);

  // Load upsell options and amenities when tarifa changes
  useEffect(() => {
    setExtraItems([]);
    setUpsellOptions([]);
    setAmenityOptions([]);
    setAmenityQty({});
    setAmenityDirty({});
    if (!selectedTarifaId) return;

    const fetchData = async () => {
      const [upsellsRes, amenitiesRes] = await Promise.all([
        supabase
          .from('tarifa_upsells')
          .select('producto_id, productos:producto_id(nombre, precio_upsell_coworking)')
          .eq('tarifa_id', selectedTarifaId),
        supabase
          .from('tarifa_amenities_incluidos')
          .select('producto_id, cantidad_incluida, productos:producto_id(nombre)')
          .eq('tarifa_id', selectedTarifaId),
      ]);

      // Use real-time precio_upsell_coworking from productos table
      setUpsellOptions(
        (upsellsRes.data ?? []).map((u: any) => ({
          producto_id: u.producto_id,
          nombre: u.productos?.nombre ?? 'Producto',
          precio_especial: u.productos?.precio_upsell_coworking ?? 0,
        }))
      );

      setAmenityOptions(
        (amenitiesRes.data ?? []).map((a: any) => ({
          producto_id: a.producto_id,
          nombre: a.productos?.nombre ?? 'Amenity',
          cantidad_incluida: a.cantidad_incluida,
        }))
      );
    };
    fetchData();
  }, [selectedTarifaId]);

  // Recalcula cantidad por amenity al cambiar pax/amenities (sin pisar ediciones manuales)
  useEffect(() => {
    const pax = parseInt(paxCount, 10) || 1;
    setAmenityQty(prev => {
      const next: Record<string, number> = {};
      for (const a of amenityOptions) {
        next[a.producto_id] = amenityDirty[a.producto_id]
          ? (prev[a.producto_id] ?? a.cantidad_incluida * pax)
          : a.cantidad_incluida * pax;
      }
      return next;
    });
  }, [amenityOptions, paxCount, amenityDirty]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);

    const pax = parseInt(paxCount, 10);
    const horasNum = parseFloat(horas);
    const available = getAvailablePax(selectedAreaId);

    if (selectedArea?.es_privado && available < selectedArea.capacidad_pax) {
      toast({ variant: 'destructive', title: 'Área privada ocupada', description: 'Este espacio ya tiene una sesión activa.' });
      setCreating(false);
      return;
    }

    if (!selectedArea?.es_privado && pax > available) {
      toast({ variant: 'destructive', title: 'Capacidad excedida', description: `Solo hay ${available} lugar(es) disponible(s).` });
      setCreating(false);
      return;
    }

    const fechaInicio = new Date();
    const fechaFinEstimada = new Date(fechaInicio.getTime() + horasNum * 60 * 60 * 1000);

    const firstUpsell = extraItems.find(i => i.isSpecial) ?? null;

    // Build immutable tarifa snapshot at check-in time
    const selectedTarifa = selectedTarifaId
      ? tarifas.find(t => t.id === selectedTarifaId) ?? null
      : null;
    const tarifaSnapshot = selectedTarifa
      ? {
          ...selectedTarifa,
          amenities: amenityOptions,
          upsells_disponibles: upsellOptions,
          snapshot_at: new Date().toISOString(),
        }
      : null;

    const { data: sessionData, error } = await supabase.from('coworking_sessions').insert({
      cliente_nombre: clienteNombre.trim(),
      area_id: selectedAreaId,
      pax_count: pax,
      usuario_id: user.id,
      fecha_inicio: dateToCDMX(fechaInicio),
      fecha_fin_estimada: dateToCDMX(fechaFinEstimada),
      estado: 'activo',
      monto_acumulado: 0,
      tarifa_id: selectedTarifaId || null,
      tarifa_snapshot: tarifaSnapshot,
      upsell_producto_id: firstUpsell?.producto_id ?? null,
      upsell_precio: firstUpsell?.precio ?? null,
    } as any).select('id').single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      if (sessionData) {
        // Insert extra items (upsells de tarifa o consumos a precio regular)
        for (const it of extraItems) {
          await supabase.from('coworking_session_upsells').insert({
            session_id: sessionData.id,
            producto_id: it.producto_id,
            precio_especial: it.precio,
            cantidad: 1,
          });
        }
        // Insert amenities con la cantidad manual definida por el recepcionista
        for (const a of amenityOptions) {
          const qty = amenityQty[a.producto_id] ?? a.cantidad_incluida * pax;
          if (qty <= 0) continue; // si bajó a 0, no insertamos el amenity
          await supabase.from('coworking_session_upsells').insert({
            session_id: sessionData.id,
            producto_id: a.producto_id,
            precio_especial: 0,
            cantidad: qty,
          });
        }
      }
      await supabase.from('audit_logs').insert({
        user_id: user.id, accion: 'checkin_coworking',
        descripcion: `Check-in: ${clienteNombre.trim()} (${pax} pax)`,
        metadata: {
          area_id: selectedAreaId,
          pax_count: pax,
          horas: horasNum,
          tarifa_id: selectedTarifaId || null,
          extra_items: extraItems.map(i => ({ producto_id: i.producto_id, precio: i.precio, isSpecial: i.isSpecial })),
          tarifa_snapshot_resumen: selectedTarifa
            ? {
                nombre: selectedTarifa.nombre,
                precio_base: selectedTarifa.precio_base,
                tipo_cobro: selectedTarifa.tipo_cobro,
                metodo_fraccion: selectedTarifa.metodo_fraccion,
                minutos_tolerancia: selectedTarifa.minutos_tolerancia,
              }
            : null,
        },
      });
      toast({ title: 'Entrada registrada exitosamente' });
      setClienteNombre(''); setSelectedAreaId(''); setPaxCount('1'); setHoras('1');
      setSelectedTarifaId(''); setExtraItems([]); setSearch('');
      setAmenityOptions([]);
      setAmenityQty({}); setAmenityDirty({});
      setOpen(false);
      await onSuccess?.();
    }
    setCreating(false);
  };

  const paxMax = selectedArea
    ? (selectedArea.es_privado ? selectedArea.capacidad_pax : 1)
    : 10;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" />Registrar Entrada</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Registrar Entrada (Check-in)</DialogTitle></DialogHeader>
        <form onSubmit={handleCheckIn} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="cliente">Nombre del Cliente</Label>
            <Input id="cliente" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} placeholder="Nombre completo" required maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label>Área</Label>
            <Select value={selectedAreaId} onValueChange={setSelectedAreaId} required>
              <SelectTrigger><SelectValue placeholder="Seleccionar área" /></SelectTrigger>
              <SelectContent>
                {areas.map(area => {
                  const avail = getAvailablePax(area.id);
                  const isPrivadoOcupado = area.es_privado && avail < area.capacidad_pax;
                  const isDisabled = area.es_privado ? isPrivadoOcupado : avail <= 0;
                  const label = area.es_privado
                    ? `${area.nombre_area} — ${isPrivadoOcupado ? 'Ocupado' : 'Disponible'} (privado)`
                    : `${area.nombre_area} — ${avail}/${area.capacidad_pax} disponibles`;
                  return (
                    <SelectItem key={area.id} value={area.id} disabled={isDisabled}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Tarifa selector */}
          {selectedAreaId && applicableTarifas.length > 0 && (
            <div className="space-y-2">
              <Label>Tarifa</Label>
              <Select value={selectedTarifaId} onValueChange={setSelectedTarifaId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tarifa" /></SelectTrigger>
                <SelectContent>
                  {applicableTarifas.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre} — ${t.precio_base}/{t.tipo_cobro}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Búsqueda unificada de consumos extra */}
          {selectedAreaId && (
            <div className="space-y-2">
              <Label>
                Añadir Consumo Extra <span className="text-muted-foreground text-xs">— opcional</span>
              </Label>

              {extraItems.length > 0 && (
                <div className="space-y-1">
                  {extraItems.map((it, idx) => (
                    <div key={`${it.producto_id}-${idx}`} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {it.isSpecial ? (
                          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <Gift className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{it.nombre}</span>
                        <span className="text-muted-foreground shrink-0">${it.precio.toFixed(2)}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setExtraItems(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto por nombre o categoría..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {search.trim() !== '' && (
                <div className="space-y-1 max-h-48 overflow-y-auto border border-border/60 rounded-md p-1">
                  {(() => {
                    const filtered = productos.filter(
                      p =>
                        p.nombre.toLowerCase().includes(search.toLowerCase()) ||
                        p.categoria.toLowerCase().includes(search.toLowerCase()),
                    );
                    if (filtered.length === 0) {
                      return <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>;
                    }
                    return filtered.map(p => {
                      const upsell = upsellOptions.find(u => u.producto_id === p.id);
                      const isSpecial = !!upsell;
                      const precio = isSpecial ? upsell!.precio_especial : p.precio_venta;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-md border border-transparent hover:border-border hover:bg-muted/40 p-1.5 text-sm transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{p.nombre}</span>
                              {isSpecial ? (
                                <Badge variant="default" className="text-[10px] px-1.5 py-0">Precio Especial</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Precio Regular</Badge>
                              )}
                            </div>
                            <span className="text-muted-foreground text-xs">{p.categoria}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-medium">${precio.toFixed(2)}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={async () => {
                                const validacion = await verificarStock(p.id, 1);
                                if (!validacion.valido) {
                                  toast({ variant: 'destructive', title: 'Sin stock', description: validacion.error });
                                  return;
                                }
                                setExtraItems(prev => [
                                  ...prev,
                                  { producto_id: p.id, nombre: p.nombre, precio, isSpecial },
                                ]);
                                setSearch('');
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Amenities preview con cantidad editable */}
          {selectedTarifaId && amenityOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Amenities Incluidos</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Sugerido por defecto: cantidad incluida × pax. Puedes ajustar a la baja si el cliente no los quiere todos.
              </p>
              <div className="space-y-1">
                {amenityOptions.map(a => {
                  const pax = parseInt(paxCount, 10) || 1;
                  const sugerido = a.cantidad_incluida * pax;
                  const value = amenityQty[a.producto_id] ?? sugerido;
                  return (
                    <div key={a.producto_id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-1.5 text-sm">
                      <span className="flex-1 min-w-0 truncate">🎁 {a.nombre}</span>
                      <span className="text-xs text-muted-foreground shrink-0">Sug: {sugerido}</span>
                      <Input
                        type="number"
                        min={0}
                        max={sugerido}
                        value={value}
                        onChange={e => {
                          const raw = parseInt(e.target.value, 10);
                          const clamped = Math.max(0, Math.min(sugerido, isNaN(raw) ? 0 : raw));
                          setAmenityQty(prev => ({ ...prev, [a.producto_id]: clamped }));
                          setAmenityDirty(prev => ({ ...prev, [a.producto_id]: true }));
                        }}
                        className="h-7 w-16 text-center"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">(gratis)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pax">Personas (Pax)</Label>
              <Input
                id="pax"
                type="number"
                min={1}
                max={paxMax}
                value={paxCount}
                onChange={e => setPaxCount(e.target.value)}
                required
                disabled={isPublicArea}
              />
              {selectedAreaId && (
                <p className="text-xs text-muted-foreground">
                  {isPublicArea ? 'Tarifa personal (1 pax)' : `Máx: ${paxMax}`}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="horas">Tiempo (horas)</Label>
              <Input id="horas" type="number" min={0.5} step={0.5} value={horas} onChange={e => setHoras(e.target.value)} required />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={creating || !selectedAreaId}>
            {creating ? 'Registrando...' : 'Confirmar Entrada'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
