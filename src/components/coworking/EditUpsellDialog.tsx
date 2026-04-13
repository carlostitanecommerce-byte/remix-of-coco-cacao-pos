import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';
import type { CoworkingSession } from './types';

interface UpsellOption {
  producto_id: string;
  nombre: string;
  precio_especial: number;
}

interface AmenityOption {
  producto_id: string;
  nombre: string;
}

interface CurrentItem {
  id: string;
  producto_id: string;
  nombre: string;
  precio_especial: number;
  cantidad: number;
}

interface Props {
  session: CoworkingSession | null;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
}

export function EditUpsellDialog({ session, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [upsellOptions, setUpsellOptions] = useState<UpsellOption[]>([]);
  const [amenityOptions, setAmenityOptions] = useState<AmenityOption[]>([]);
  const [currentUpsells, setCurrentUpsells] = useState<CurrentItem[]>([]);
  const [currentAmenities, setCurrentAmenities] = useState<CurrentItem[]>([]);
  const [selectedAddId, setSelectedAddId] = useState('');
  const [selectedAmenityId, setSelectedAmenityId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session) return;
    setSelectedAddId('');
    setSelectedAmenityId('');

    const fetchData = async () => {
      setLoading(true);

      // Fetch all current session items
      const { data: existing } = await supabase
        .from('coworking_session_upsells')
        .select('id, producto_id, precio_especial, cantidad, productos:producto_id(nombre)')
        .eq('session_id', session.id);

      const allItems = (existing ?? []).map((u: any) => ({
        id: u.id,
        producto_id: u.producto_id,
        nombre: u.productos?.nombre ?? 'Producto',
        precio_especial: u.precio_especial,
        cantidad: u.cantidad,
      }));

      // Split into amenities ($0) and upsells (>$0)
      setCurrentAmenities(allItems.filter(i => i.precio_especial === 0));
      setCurrentUpsells(allItems.filter(i => i.precio_especial > 0));

      // Fetch available upsell options from tarifa using real-time prices
      let tarifaId = session.tarifa_id;
      if (!tarifaId) {
        const { data: tarifas } = await supabase
          .from('tarifas_coworking')
          .select('id, areas_aplicables')
          .eq('activo', true);
        const tarifa = tarifas?.find(t => (t.areas_aplicables as string[])?.includes(session.area_id));
        tarifaId = tarifa?.id ?? null;
      }

      if (tarifaId) {
        const [upsellsRes, amenitiesRes] = await Promise.all([
          supabase
            .from('tarifa_upsells')
            .select('producto_id, productos:producto_id(nombre, precio_upsell_coworking)')
            .eq('tarifa_id', tarifaId),
          supabase
            .from('tarifa_amenities_incluidos')
            .select('producto_id, productos:producto_id(nombre)')
            .eq('tarifa_id', tarifaId),
        ]);

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
          }))
        );
      } else {
        setUpsellOptions([]);
        setAmenityOptions([]);
      }

      setLoading(false);
    };
    fetchData();
  }, [session]);

  const handleAddUpsell = async () => {
    if (!session || !selectedAddId) return;
    const option = upsellOptions.find(u => u.producto_id === selectedAddId);
    if (!option) return;

    const { data, error } = await supabase
      .from('coworking_session_upsells')
      .insert({
        session_id: session.id,
        producto_id: option.producto_id,
        precio_especial: option.precio_especial,
        cantidad: 1,
      })
      .select('id')
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }

    setCurrentUpsells(prev => [...prev, {
      id: data.id,
      producto_id: option.producto_id,
      nombre: option.nombre,
      precio_especial: option.precio_especial,
      cantidad: 1,
    }]);
    setSelectedAddId('');
    toast({ title: `Upsell agregado: ${option.nombre}` });
  };

  const handleAddAmenity = async () => {
    if (!session || !selectedAmenityId) return;
    const option = amenityOptions.find(a => a.producto_id === selectedAmenityId);
    if (!option) return;

    const { data, error } = await supabase
      .from('coworking_session_upsells')
      .insert({
        session_id: session.id,
        producto_id: option.producto_id,
        precio_especial: 0,
        cantidad: 1,
      })
      .select('id')
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }

    setCurrentAmenities(prev => [...prev, {
      id: data.id,
      producto_id: option.producto_id,
      nombre: option.nombre,
      precio_especial: 0,
      cantidad: 1,
    }]);
    setSelectedAmenityId('');
    toast({ title: `Amenity agregado: ${option.nombre}` });
  };

  const handleRemove = async (itemId: string, isAmenity: boolean) => {
    const { error } = await supabase
      .from('coworking_session_upsells')
      .delete()
      .eq('id', itemId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }

    if (isAmenity) {
      setCurrentAmenities(prev => prev.filter(u => u.id !== itemId));
    } else {
      setCurrentUpsells(prev => prev.filter(u => u.id !== itemId));
    }
    toast({ title: 'Eliminado' });
  };

  const handleClose = () => {
    onClose();
    onSuccess?.();
  };

  if (!session) return null;

  const totalUpsells = currentUpsells.reduce((sum, u) => sum + u.precio_especial * u.cantidad, 0);

  return (
    <Dialog open={!!session} onOpenChange={() => handleClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upsells & Amenities — {session.cliente_nombre}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : (
            <>
              {/* Amenities section */}
              <div className="space-y-2">
                <Label>🎁 Amenities (gratis)</Label>
                {currentAmenities.length > 0 ? (
                  <div className="space-y-1.5">
                    {currentAmenities.map(a => (
                      <div key={a.id} className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-2 text-sm">
                        <div>
                          <span className="font-medium">{a.nombre}</span>
                          <span className="text-muted-foreground ml-2">×{a.cantidad}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleRemove(a.id, true)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin amenities.</p>
                )}
                {amenityOptions.length > 0 && (
                  <div className="flex gap-2">
                    <Select value={selectedAmenityId} onValueChange={setSelectedAmenityId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Agregar amenity..." /></SelectTrigger>
                      <SelectContent>
                        {amenityOptions.map(a => (
                          <SelectItem key={a.producto_id} value={a.producto_id}>
                            {a.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleAddAmenity} disabled={!selectedAmenityId}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Upsells section */}
              <div className="space-y-2">
                <Label>☕ Upsells (precio especial)</Label>
                {currentUpsells.length > 0 ? (
                  <div className="space-y-1.5">
                    {currentUpsells.map(u => (
                      <div key={u.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                        <div>
                          <span className="font-medium">{u.nombre}</span>
                          <span className="text-muted-foreground ml-2">${u.precio_especial.toFixed(2)}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleRemove(u.id, false)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground text-right">Total upsells: ${totalUpsells.toFixed(2)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin upsells agregados.</p>
                )}

                {upsellOptions.length > 0 && (
                  <div className="flex gap-2">
                    <Select value={selectedAddId} onValueChange={setSelectedAddId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Agregar upsell..." /></SelectTrigger>
                      <SelectContent>
                        {upsellOptions.map(u => (
                          <SelectItem key={u.producto_id} value={u.producto_id}>
                            {u.nombre} — ${u.precio_especial.toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleAddUpsell} disabled={!selectedAddId}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {upsellOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No hay productos upsell configurados para la tarifa de esta sesión.</p>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
