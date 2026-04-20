import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { verificarStock } from '@/hooks/useValidarStock';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, Plus, Minus, Trash2, Gift, Sparkles, ShoppingBag, Users, Pencil, Check, X } from 'lucide-react';
import type { Area, CoworkingSession } from './types';

interface SnapshotAmenity {
  producto_id: string;
  cantidad_incluida: number;
  nombre?: string;
}

interface PendingAmenityUpdate {
  newPax: number;
  oldPax: number;
}

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio_venta: number;
}

interface SessionItem {
  id: string;
  producto_id: string;
  nombre: string;
  precio_especial: number;
  cantidad: number;
}

interface UpsellSnapshotEntry {
  producto_id: string;
  precio_especial: number;
}

interface Props {
  session: CoworkingSession | null;
  areas: Area[];
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
}

export function ManageSessionAccountDialog({ session, areas, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEditingPax, setIsEditingPax] = useState(false);
  const [tempPax, setTempPax] = useState('');
  const [pendingAmenityUpdate, setPendingAmenityUpdate] = useState<PendingAmenityUpdate | null>(null);

  // Snapshot de upsells disponibles para esta sesión (precio congelado al check-in)
  const upsellsMap = useMemo(() => {
    const map = new Map<string, number>();
    const list = (session?.tarifa_snapshot?.upsells_disponibles ?? []) as UpsellSnapshotEntry[];
    if (Array.isArray(list)) {
      for (const u of list) {
        if (u && typeof u.producto_id === 'string') {
          map.set(u.producto_id, Number(u.precio_especial) || 0);
        }
      }
    }
    return map;
  }, [session]);

  const missingAmenities = useMemo(() => {
    if (!session || !session.tarifa_snapshot?.amenities) return [];
    const snapshotAmenities = session.tarifa_snapshot.amenities as any[];
    const result: any[] = [];

    for (const a of snapshotAmenities) {
      const maxAllowed = (a.cantidad_incluida || 0) * session.pax_count;
      const currentItem = items.find(i => i.producto_id === a.producto_id && i.precio_especial === 0);
      const currentQty = currentItem ? currentItem.cantidad : 0;

      if (maxAllowed > currentQty) {
        result.push({
          ...a,
          disponible: maxAllowed - currentQty,
          currentItemId: currentItem?.id,
        });
      }
    }
    return result;
  }, [session, items]);

  const handleRestoreAmenity = async (amenity: any) => {
    if (!session) return;
    const validacion = await verificarStock(amenity.producto_id, 1);
    if (!validacion.valido) {
      toast({ variant: 'destructive', title: 'Sin stock', description: validacion.error });
      return;
    }

    if (amenity.currentItemId) {
      const item = items.find(i => i.id === amenity.currentItemId);
      if (item) await handleUpdateQuantity(item, 1);
    } else {
      const { data, error } = await supabase
        .from('coworking_session_upsells')
        .insert({
          session_id: session.id,
          producto_id: amenity.producto_id,
          precio_especial: 0,
          cantidad: 1,
        })
        .select('id')
        .single();

      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
        return;
      }
      setItems(prev => [...prev, {
        id: data.id,
        producto_id: amenity.producto_id,
        nombre: amenity.nombre || 'Amenity',
        precio_especial: 0,
        cantidad: 1,
      }]);
      toast({ title: 'Beneficio restaurado' });
    }
  };

  useEffect(() => {
    if (!session) return;
    setSearch('');
    const fetchAll = async () => {
      setLoading(true);
      const [prodRes, itemsRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, nombre, categoria, precio_venta')
          .eq('activo', true)
          .order('nombre'),
        supabase
          .from('coworking_session_upsells')
          .select('id, producto_id, precio_especial, cantidad, productos:producto_id(nombre)')
          .eq('session_id', session.id)
          .order('created_at', { ascending: true }),
      ]);
      setProductos((prodRes.data as Producto[]) ?? []);
      setItems(
        (itemsRes.data ?? []).map((u: any) => ({
          id: u.id,
          producto_id: u.producto_id,
          nombre: u.productos?.nombre ?? 'Producto',
          precio_especial: Number(u.precio_especial) || 0,
          cantidad: u.cantidad,
        })),
      );
      setLoading(false);
    };
    fetchAll();
  }, [session]);

  const resolvePrice = (productoId: string, precioVenta: number) => {
    if (upsellsMap.has(productoId)) {
      return { precio: upsellsMap.get(productoId) ?? 0, isSpecial: true };
    }
    return { precio: precioVenta, isSpecial: false };
  };

  const handleAdd = async (producto: Producto) => {
    if (!session) return;
    const validacion = await verificarStock(producto.id, 1);
    if (!validacion.valido) {
      toast({ variant: 'destructive', title: 'Sin stock', description: validacion.error });
      return;
    }
    const { precio } = resolvePrice(producto.id, producto.precio_venta);

    const { data, error } = await supabase
      .from('coworking_session_upsells')
      .insert({
        session_id: session.id,
        producto_id: producto.id,
        precio_especial: precio,
        cantidad: 1,
      })
      .select('id')
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    setItems(prev => [
      ...prev,
      {
        id: data.id,
        producto_id: producto.id,
        nombre: producto.nombre,
        precio_especial: precio,
        cantidad: 1,
      },
    ]);
    toast({ title: `${producto.nombre} agregado`, description: `$${precio.toFixed(2)}` });
  };

  const handleRemove = async (item: SessionItem) => {
    const { error } = await supabase
      .from('coworking_session_upsells')
      .delete()
      .eq('id', item.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    setItems(prev => prev.filter(i => i.id !== item.id));
    toast({ title: 'Eliminado' });
  };

  const handleUpdateQuantity = async (item: SessionItem, delta: number) => {
    const newQty = item.cantidad + delta;
    if (newQty < 0) return;

    if (delta > 0) {
      const validacion = await verificarStock(item.producto_id, 1);
      if (!validacion.valido) {
        toast({ variant: 'destructive', title: 'Sin stock', description: validacion.error });
        return;
      }
    }

    if (newQty === 0) {
      const { error } = await supabase
        .from('coworking_session_upsells')
        .delete()
        .eq('id', item.id);
      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
        return;
      }
      setItems(prev => prev.filter(i => i.id !== item.id));
      return;
    }

    const { error } = await supabase
      .from('coworking_session_upsells')
      .update({ cantidad: newQty })
      .eq('id', item.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, cantidad: newQty } : i)));
  };

  const sessionArea = session ? areas.find(a => a.id === session.area_id) : undefined;

  const handleSavePax = async () => {
    if (!session) return;
    const pax = parseInt(tempPax, 10);
    if (isNaN(pax) || pax < 1) {
      toast({ variant: 'destructive', title: 'Pax inválido' });
      return;
    }
    if (sessionArea && pax > sessionArea.capacidad_pax) {
      toast({ variant: 'destructive', title: 'Excede capacidad', description: `Máximo ${sessionArea.capacidad_pax} personas.` });
      return;
    }

    const oldPax = session.pax_count;
    const { error } = await supabase
      .from('coworking_sessions')
      .update({ pax_count: pax })
      .eq('id', session.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }

    toast({ title: `Pax actualizado a ${pax}` });
    setIsEditingPax(false);
    session.pax_count = pax;
    await onSuccess?.();

    const amenities = (session.tarifa_snapshot?.amenities ?? []) as SnapshotAmenity[];
    if (pax !== oldPax && Array.isArray(amenities) && amenities.length > 0) {
      setPendingAmenityUpdate({ newPax: pax, oldPax });
    }
  };

  const handleConfirmAmenityRecalc = async () => {
    if (!pendingAmenityUpdate || !session) return;
    const { newPax: pax } = pendingAmenityUpdate;
    const amenities = (session.tarifa_snapshot?.amenities ?? []) as SnapshotAmenity[];

    let okCount = 0;
    let errCount = 0;

    for (const a of amenities) {
      const nuevaCantidad = (a.cantidad_incluida ?? 0) * pax;

      if (nuevaCantidad <= 0) {
        const { error } = await supabase
          .from('coworking_session_upsells')
          .delete()
          .eq('session_id', session.id)
          .eq('producto_id', a.producto_id)
          .eq('precio_especial', 0);
        if (error) errCount++; else okCount++;
        continue;
      }

      const { data: existing } = await supabase
        .from('coworking_session_upsells')
        .select('id')
        .eq('session_id', session.id)
        .eq('producto_id', a.producto_id)
        .eq('precio_especial', 0)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('coworking_session_upsells')
          .update({ cantidad: nuevaCantidad })
          .eq('id', existing.id);
        if (error) errCount++; else okCount++;
      } else {
        const { error } = await supabase
          .from('coworking_session_upsells')
          .insert({
            session_id: session.id,
            producto_id: a.producto_id,
            precio_especial: 0,
            cantidad: nuevaCantidad,
          });
        if (error) errCount++; else okCount++;
      }
    }

    if (errCount === 0) {
      toast({ title: 'Amenities actualizados', description: `${okCount} amenity(s) recalculados a ${pax} pax.` });
    } else {
      toast({ variant: 'destructive', title: 'Actualización parcial', description: `${okCount} ok · ${errCount} con error.` });
    }

    setPendingAmenityUpdate(null);

    const { data: itemsRes } = await supabase
      .from('coworking_session_upsells')
      .select('id, producto_id, precio_especial, cantidad, productos:producto_id(nombre)')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });
    setItems(
      (itemsRes ?? []).map((u: any) => ({
        id: u.id,
        producto_id: u.producto_id,
        nombre: u.productos?.nombre ?? 'Producto',
        precio_especial: Number(u.precio_especial) || 0,
        cantidad: u.cantidad,
      })),
    );
    await onSuccess?.();
  };

  const handleClose = () => {
    setIsEditingPax(false);
    onClose();
    onSuccess?.();
  };

  if (!session) return null;

  const filtered = productos.filter(
    p =>
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.categoria.toLowerCase().includes(search.toLowerCase()),
  );

  const totalCuenta = items.reduce((sum, i) => sum + i.precio_especial * i.cantidad, 0);

  return (
    <Dialog open={!!session} onOpenChange={() => handleClose()}>
      <DialogContent className="sm:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <span>Cuenta de la sesión — {session.cliente_nombre}</span>
            <div className="flex items-center gap-1.5 ml-auto text-sm font-normal">
              <Users className="h-4 w-4 text-muted-foreground" />
              {isEditingPax ? (
                <>
                  <Input
                    type="number"
                    min={1}
                    max={sessionArea?.capacidad_pax ?? 99}
                    value={tempPax}
                    onChange={e => setTempPax(e.target.value)}
                    className="h-7 w-16 text-sm"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSavePax} title="Guardar">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditingPax(false)} title="Cancelar">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="font-medium">{session.pax_count} pax</span>
                  {sessionArea?.es_privado && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => { setTempPax(String(session.pax_count)); setIsEditingPax(true); }}
                      title="Editar pax"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </DialogTitle>
          {sessionArea && (
            <p className="text-xs text-muted-foreground mt-1">
              {sessionArea.nombre_area} · Capacidad máxima: {sessionArea.capacidad_pax}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Estado de la cuenta */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Estado de la Cuenta</h3>
              <span className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? 'concepto' : 'conceptos'}
              </span>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground py-3">Cargando...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center border border-dashed rounded-md">
                Aún no hay productos en la cuenta.
              </p>
            ) : (
              <div className="space-y-1.5">
                {items.map(item => {
                  const isAmenity = item.precio_especial === 0;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 p-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isAmenity ? (
                          <Gift className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <Sparkles className="h-4 w-4 text-accent-foreground shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="font-medium truncate">{item.nombre}</span>
                          {item.cantidad > 1 && (
                            <span className="text-muted-foreground ml-1">×{item.cantidad}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={
                            isAmenity ? 'text-primary font-medium' : 'text-foreground font-medium'
                          }
                        >
                          {isAmenity ? 'Incluido' : `$${item.precio_especial.toFixed(2)}`}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleUpdateQuantity(item, -1)}
                            title="Disminuir"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center font-medium">{item.cantidad}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleUpdateQuantity(item, 1)}
                            title="Aumentar"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemove(item)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground text-right pt-1">
                  Total consumos: <span className="font-medium text-foreground">${totalCuenta.toFixed(2)}</span>
                </p>
              </div>
            )}
          </section>

          {missingAmenities.length > 0 && (
            <section className="space-y-2 pb-2 border-b border-border/50">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Gift className="h-4 w-4" /> Beneficios por reclamar
              </h3>
              <div className="space-y-1.5">
                {missingAmenities.map((ma, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-md p-2 text-sm">
                    <div>
                      <span className="font-medium text-foreground">{ma.nombre || 'Amenity'}</span>
                      <span className="text-xs text-muted-foreground ml-2">Disponibles: {ma.disponible}</span>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 border-primary/30 text-primary hover:bg-primary/10" onClick={() => handleRestoreAmenity(ma)}>
                      <Plus className="h-3 w-3 mr-1" /> Reclamar
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Añadir consumo extra */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Añadir Consumo Extra</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Los productos del paquete de tarifa se cobran a precio especial; el resto, a precio regular.
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar producto por nombre o categoría..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
              ) : (
                filtered.map(p => {
                  const { precio, isSpecial } = resolvePrice(p.id, p.precio_venta);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-md border border-border p-2 text-sm hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{p.nombre}</span>
                          {isSpecial ? (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              Precio Especial
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Precio Regular
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground text-xs">{p.categoria}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-foreground font-medium">${precio.toFixed(2)}</span>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => handleAdd(p)}>
                          <Plus className="h-3 w-3 mr-1" />
                          Agregar
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
          <Button variant="outline" onClick={handleClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
