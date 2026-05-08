import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCategorias } from '@/hooks/useCategorias';
import { Badge } from '@/components/ui/badge';

import { ImageIcon } from 'lucide-react';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio_venta: number;
  precio_upsell_coworking: number | null;
  activo: boolean;
  tipo: 'simple' | 'paquete';
  imagen_url: string | null;
}

interface Props {
  onAdd: (producto: Producto) => void;
}

export function ProductGrid({ onAdd }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const { categorias: categoriasDB } = useCategorias();
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');

  useEffect(() => {
    const fetchProductos = async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, nombre, categoria, precio_venta, precio_upsell_coworking, activo, tipo, imagen_url')
        .eq('activo', true)
        .order('nombre');
      if (data) setProductos(data as Producto[]);
    };
    fetchProductos();

    const channel = supabase
      .channel('pos-productos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => fetchProductos())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const categoriasConProductos = categoriasDB.filter(cat =>
    productos.some(p => p.categoria === cat)
  );
  const allTabs = ['Todos', ...categoriasConProductos];

  const filtered = productos.filter(p =>
    categoriaActiva === 'Todos' || p.categoria === categoriaActiva
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {allTabs.map(cat => (
          <Badge
            key={cat}
            variant={categoriaActiva === cat ? 'default' : 'outline'}
            className="cursor-pointer select-none"
            onClick={() => setCategoriaActiva(cat)}
          >
            {cat}
          </Badge>
        ))}
      </div>

      <div className="max-h-[75vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(p => {
            const isPaquete = p.tipo === 'paquete';
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onAdd(p)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(p); } }}
                className="group relative flex flex-col rounded-lg border border-border bg-card overflow-hidden cursor-pointer transition hover:border-primary hover:shadow-md active:scale-[0.98]"
              >
                <div className="relative aspect-square w-full bg-muted">
                  {p.imagen_url ? (
                    <img
                      src={p.imagen_url}
                      alt={p.nombre}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 opacity-40" />
                    </div>
                  )}
                  {isPaquete && (
                    <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-primary/90 text-primary-foreground border-0">
                      📦 Paquete
                    </Badge>
                  )}
                </div>
                <div className="p-2 flex flex-col gap-1">
                  <span className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]">
                    {p.nombre}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    ${p.precio_venta.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-12">
              No hay productos en esta categoría
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
