import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { CartPanel } from '@/components/pos/CartPanel';
import { toast } from 'sonner';
import { verificarStock } from '@/hooks/useValidarStock';
import type { CartItem } from '@/components/pos/types';

const PosPage = () => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [key, setKey] = useState(0);

  const addProduct = useCallback(async (p: { id: string; nombre: string; precio_venta: number; precio_upsell_coworking?: number | null; tipo?: 'simple' | 'paquete' }) => {
    if (p.tipo === 'paquete') {
      const { data: validacionPaquete, error: rpcErr } = await supabase.rpc(
        'validar_stock_paquete' as any,
        { p_paquete_id: p.id, p_cantidad: 1 }
      );
      if (rpcErr) { toast.error('Error al validar stock del paquete'); return; }
      const resultado = validacionPaquete as { valido: boolean; error?: string };
      if (!resultado?.valido) { toast.error(resultado?.error || 'Stock insuficiente para este paquete'); return; }

      const { data: comps } = await supabase
        .from('paquete_componentes')
        .select('producto_id, cantidad, productos:producto_id(nombre, activo)')
        .eq('paquete_id', p.id);

      if (!comps || comps.length === 0) {
        toast.error('Este paquete no tiene componentes configurados.');
        return;
      }
      const invalid = (comps as any[]).filter(c => !c.productos || c.productos.activo === false);
      if (invalid.length > 0) {
        toast.error('Paquete con componentes inválidos o inactivos.');
        return;
      }

      const componentes = (comps ?? []).map((c: any) => ({
        producto_id: c.producto_id,
        nombre: c.productos?.nombre ?? '—',
        cantidad: Number(c.cantidad),
      }));

      setItems(prev => {
        const existing = prev.find(i => i.producto_id === p.id && i.tipo_concepto === 'paquete');
        if (existing) {
          return prev.map(i => i.producto_id === p.id && i.tipo_concepto === 'paquete'
            ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unitario }
            : i
          );
        }
        return [...prev, {
          producto_id: p.id,
          nombre: `📦 ${p.nombre}`,
          precio_unitario: p.precio_venta,
          cantidad: 1,
          subtotal: p.precio_venta,
          tipo_concepto: 'paquete' as const,
          paquete_id: p.id,
          componentes,
        }];
      });
      return;
    }

    const validacion = await verificarStock(p.id, 1);
    if (!validacion.valido) { toast.error(validacion.error); return; }

    setItems(prev => {
      const existing = prev.find(i => i.producto_id === p.id && i.tipo_concepto === 'producto');
      if (existing) {
        return prev.map(i => i.producto_id === p.id && i.tipo_concepto === 'producto'
          ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unitario }
          : i
        );
      }
      return [...prev, {
        producto_id: p.id,
        nombre: p.nombre,
        precio_unitario: p.precio_venta,
        cantidad: 1,
        subtotal: p.precio_venta,
        tipo_concepto: 'producto' as const,
      }];
    });
  }, []);

  const updateQty = useCallback(async (productoId: string, delta: number) => {
    if (delta > 0) {
      const validacion = await verificarStock(productoId, 1);
      if (!validacion.valido) { toast.error(validacion.error); return; }
    }
    setItems(prev => prev.map(i => {
      if (i.producto_id !== productoId) return i;
      const newQty = Math.max(1, i.cantidad + delta);
      return { ...i, cantidad: newQty, subtotal: newQty * i.precio_unitario };
    }));
  }, []);

  const removeItem = useCallback((productoId: string) => {
    setItems(prev => prev.filter(i => i.producto_id !== productoId));
  }, []);

  const updateNotas = useCallback((productoId: string, notas: string) => {
    setItems(prev => prev.map(i =>
      i.producto_id === productoId ? { ...i, notas: notas.trim() || undefined } : i
    ));
  }, []);

  const handleClearCart = () => {
    setItems([]);
    setKey(k => k + 1);
  };

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3">
        <ProductGrid key={`products-${key}`} onAdd={addProduct} />
      </div>
      <div className="lg:col-span-2 border border-border rounded-lg p-4 bg-card">
        <CartPanel
          items={items}
          onUpdateQty={updateQty}
          onUpdateNotas={updateNotas}
          onRemove={removeItem}
          onClear={handleClearCart}
          subtotal={subtotal}
        />
      </div>
    </div>
  );
};

export default PosPage;
