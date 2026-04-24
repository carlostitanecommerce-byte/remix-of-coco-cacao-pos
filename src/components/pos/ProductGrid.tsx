import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCategorias } from '@/hooks/useCategorias';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Plus, Star, Gift } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio_venta: number;
  precio_upsell_coworking: number | null;
  activo: boolean;
  tipo: 'simple' | 'paquete';
}

interface Props {
  onAdd: (producto: Producto, tipoPrecio?: 'especial' | 'promocion') => void;
  canUseSpecialPrice?: boolean;
}

export function ProductGrid({ onAdd, canUseSpecialPrice = false }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const { categorias: categoriasDB } = useCategorias();
  const [filtro, setFiltro] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');
  

  useEffect(() => {
    supabase.from('productos').select('id, nombre, categoria, precio_venta, precio_upsell_coworking, activo, tipo')
      .eq('activo', true)
      .then(({ data }) => {
        if (data) {
          setProductos(data as Producto[]);
        }
      });
  }, []);

  // Only show categories that have at least one active product
  const categoriasConProductos = categoriasDB.filter(cat =>
    productos.some(p => p.categoria === cat)
  );

  const allTabs = ['Todos', ...categoriasConProductos];

  const filtered = productos.filter(p => {
    const matchCat = categoriaActiva === 'Todos' || p.categoria === categoriaActiva;
    const matchSearch = p.nombre.toLowerCase().includes(filtro.toLowerCase());
    return matchCat && matchSearch;
  });


  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar producto..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          className="pl-9"
        />
      </div>

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

      <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="w-[100px]">Categoría</TableHead>
              <TableHead className="w-[120px] text-right">Precio</TableHead>
              <TableHead className="w-[90px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
          {filtered.map(p => {
              const isPaquete = p.tipo === 'paquete';
              const hasSpecial = canUseSpecialPrice && !isPaquete;

              return (
                <TableRow key={p.id} className="h-[60px]">
                  <TableCell className="font-medium py-2">
                    <div className="flex items-center gap-1.5">
                      {isPaquete && <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">📦 Paquete</Badge>}
                      <span className="line-clamp-2 leading-tight">{p.nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline" className="text-xs whitespace-nowrap">{p.categoria}</Badge>
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <span className="font-bold text-foreground">${p.precio_venta.toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1 justify-end">
                      {hasSpecial && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-yellow-500"
                              title="Precio especial / Promoción"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onAdd(p, 'especial')}
                              disabled={p.precio_upsell_coworking == null}
                            >
                              <Star className="h-4 w-4 mr-2 text-yellow-500" />
                              {p.precio_upsell_coworking != null
                                ? `Precio Especial ($${p.precio_upsell_coworking.toFixed(2)})`
                                : 'Precio Especial (no configurado)'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onAdd(p, 'promocion')}>
                              <Gift className="h-4 w-4 mr-2 text-primary" />
                              Promoción (Gratis)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => onAdd(p)}
                        title="Agregar al carrito"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No se encontraron productos
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
