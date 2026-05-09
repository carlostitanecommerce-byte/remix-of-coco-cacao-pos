import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { CartPanel } from '@/components/pos/CartPanel';
import { StickyCheckoutBar } from '@/components/pos/StickyCheckoutBar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { verificarStock } from '@/hooks/useValidarStock';
import { useCartStore } from '@/stores/cartStore';
import { useAuth } from '@/hooks/useAuth';
import { useIsDesktop } from '@/hooks/use-mobile';

const PosPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDesktop = useIsDesktop();
  const [ticketOpen, setTicketOpen] = useState(false);

  const items = useCartStore((s) => s.items);
  const ensureOwner = useCartStore((s) => s.ensureOwner);
  const addOrIncrementProduct = useCartStore((s) => s.addOrIncrementProduct);
  const addOrIncrementPaquete = useCartStore((s) => s.addOrIncrementPaquete);
  const updateQty = useCartStore((s) => s.updateQty);
  const updateNotas = useCartStore((s) => s.updateNotas);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);

  useEffect(() => {
    ensureOwner(user?.id ?? null);
  }, [user?.id, ensureOwner]);

  const addProduct = useCallback(async (p: { id: string; nombre: string; precio_venta: number; tipo?: 'simple' | 'paquete' }) => {
    if (p.tipo === 'paquete') {
      const { data: validacionPaquete, error: rpcErr } = await supabase.rpc(
        'validar_stock_paquete',
        { p_paquete_id: p.id, p_cantidad: 1 }
      );
      if (rpcErr) { toast.error('Error al validar stock del paquete'); return; }
      const resultado = validacionPaquete as unknown as { valido: boolean; error?: string };
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

      addOrIncrementPaquete({
        producto_id: p.id,
        nombre: `📦 ${p.nombre}`,
        precio_unitario: p.precio_venta,
        cantidad: 1,
        subtotal: p.precio_venta,
        tipo_concepto: 'paquete',
        paquete_id: p.id,
        componentes,
      });
      return;
    }

    const validacion = await verificarStock(p.id, 1);
    if (!validacion.valido) { toast.error(validacion.error); return; }

    addOrIncrementProduct({
      producto_id: p.id,
      nombre: p.nombre,
      precio_unitario: p.precio_venta,
      cantidad: 1,
      subtotal: p.precio_venta,
      tipo_concepto: 'producto',
    });
  }, [addOrIncrementProduct, addOrIncrementPaquete]);

  const handleUpdateQty = useCallback(async (productoId: string, delta: number) => {
    if (delta > 0) {
      const validacion = await verificarStock(productoId, 1);
      if (!validacion.valido) { toast.error(validacion.error); return; }
    }
    updateQty(productoId, delta);
  }, [updateQty]);

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const itemCount = items.reduce((s, i) => s + i.cantidad, 0);

  const goToCheckout = () => {
    setTicketOpen(false);
    navigate('/caja');
  };

  if (isDesktop) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4 h-[calc(100vh-7rem)]">
        <div className="lg:col-span-5 min-h-0">
          <ProductGrid onAdd={addProduct} />
        </div>
        <div className="lg:col-span-2 border border-border rounded-lg p-3 bg-card flex flex-col min-h-0">
          <CartPanel
            items={items}
            onUpdateQty={handleUpdateQty}
            onUpdateNotas={updateNotas}
            onRemove={removeItem}
            onClear={clear}
            subtotal={subtotal}
          />
          <Button
            className="mt-3 w-full"
            size="lg"
            disabled={items.length === 0}
            onClick={goToCheckout}
          >
            Procesar pago en Caja
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Tablet / mobile layout: products full-width + bottom bar + ticket Sheet
  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] -mx-6 -my-6">
      <div className="flex-1 min-h-0 overflow-hidden px-4 pt-4">
        <ProductGrid onAdd={addProduct} />
      </div>

      <StickyCheckoutBar
        itemCount={itemCount}
        total={subtotal}
        onViewTicket={() => setTicketOpen(true)}
        onCheckout={goToCheckout}
      />

      <Sheet open={ticketOpen} onOpenChange={setTicketOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-4 flex flex-col">
          <SheetHeader className="mb-2">
            <SheetTitle>Ticket actual</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 flex flex-col">
            <CartPanel
              items={items}
              onUpdateQty={handleUpdateQty}
              onUpdateNotas={updateNotas}
              onRemove={removeItem}
              onClear={clear}
              subtotal={subtotal}
            />
          </div>
          <Button
            className="mt-3 w-full"
            size="lg"
            disabled={items.length === 0}
            onClick={goToCheckout}
          >
            Cobrar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PosPage;
