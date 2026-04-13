import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, Trash2 } from 'lucide-react';
import type { CoworkingSession } from './types';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio_venta: number;
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

export function AddConsumoDialog({ session, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [currentItems, setCurrentItems] = useState<CurrentItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

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
          .eq('session_id', session.id),
      ]);
      setProductos((prodRes.data as Producto[]) ?? []);
      setCurrentItems(
        (itemsRes.data ?? [])
          .filter((u: any) => u.precio_especial > 0)
          .map((u: any) => ({
            id: u.id,
            producto_id: u.producto_id,
            nombre: u.productos?.nombre ?? 'Producto',
            precio_especial: u.precio_especial,
            cantidad: u.cantidad,
          }))
      );
      setLoading(false);
    };
    fetchAll();
  }, [session]);

  const handleAdd = async (producto: Producto) => {
    if (!session) return;
    const { data, error } = await supabase.from('coworking_session_upsells').insert({
      session_id: session.id,
      producto_id: producto.id,
      precio_especial: producto.precio_venta,
      cantidad: 1,
    }).select('id').single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    setCurrentItems(prev => [...prev, {
      id: data.id,
      producto_id: producto.id,
      nombre: producto.nombre,
      precio_especial: producto.precio_venta,
      cantidad: 1,
    }]);
    toast({ title: `${producto.nombre} agregado a $${producto.precio_venta.toFixed(2)}` });
  };

  const handleRemove = async (itemId: string) => {
    const { error } = await supabase
      .from('coworking_session_upsells')
      .delete()
      .eq('id', itemId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    setCurrentItems(prev => prev.filter(i => i.id !== itemId));
    toast({ title: 'Eliminado' });
  };

  const handleClose = () => {
    onClose();
    onSuccess?.();
  };

  if (!session) return null;

  const filtered = productos.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.categoria.toLowerCase().includes(search.toLowerCase())
  );

  const totalConsumos = currentItems.reduce((sum, i) => sum + i.precio_especial * i.cantidad, 0);

  return (
    <Dialog open={!!session} onOpenChange={() => handleClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Consumos — {session.cliente_nombre}</DialogTitle>
        </DialogHeader>

        {/* Current items */}
        {!loading && currentItems.length > 0 && (
          <div className="space-y-2">
            <Label>Productos agregados</Label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {currentItems.map(item => (
                <div key={item.id} className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-2 text-sm">
                  <div>
                    <span className="font-medium">{item.nombre}</span>
                    <span className="text-muted-foreground ml-2">
                      {item.precio_especial === 0 ? 'Gratis' : `$${item.precio_especial.toFixed(2)}`}
                    </span>
                    {item.cantidad > 1 && (
                      <span className="text-muted-foreground ml-1">×{item.cantidad}</span>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleRemove(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-right">Total: ${totalConsumos.toFixed(2)}</p>
          </div>
        )}

        {/* Search & add */}
        <p className="text-xs text-muted-foreground">Agregar producto a precio de venta al público</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
          ) : (
            filtered.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                <div>
                  <span className="font-medium">{p.nombre}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{p.categoria}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">${p.precio_venta.toFixed(2)}</span>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => handleAdd(p)}>
                    <Plus className="h-3 w-3 mr-1" />Agregar
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
