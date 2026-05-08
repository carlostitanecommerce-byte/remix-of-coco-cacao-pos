import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { CartPanel } from '@/components/pos/CartPanel';
import { ConfirmVentaDialog } from '@/components/pos/ConfirmVentaDialog';
import { CoworkingSessionSelector } from '@/components/pos/CoworkingSessionSelector';
import { SolicitudesCancelacionPanel } from '@/components/pos/SolicitudesCancelacionPanel';
import { useVentaConfig } from '@/components/pos/useVentaConfig';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { verificarStock } from '@/hooks/useValidarStock';
import type { CartItem, VentaSummary, MixedPayment } from '@/components/pos/types';

const PosPage = () => {
  const { config } = useVentaConfig();
  const { roles, profile, user } = useAuth();
  const canUseSpecialPrice = roles.includes('administrador') || roles.includes('supervisor');
  const isAdmin = roles.includes('administrador');
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<CartItem[]>([]);
  const [originalSessionItems, setOriginalSessionItems] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [tipoConsumo, setTipoConsumo] = useState('sitio');
  const [mixedPayment, setMixedPayment] = useState<MixedPayment>({ efectivo: 0, tarjeta: 0, transferencia: 0 });
  const [propina, setPropina] = useState(0);
  const [propinaEnDigital, setPropinaEnDigital] = useState(true);
  const [summary, setSummary] = useState<VentaSummary | null>(null);
  const [key, setKey] = useState(0);
  const [importedSessionId, setImportedSessionId] = useState<string | undefined>();
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (sessionId) {
      setPendingSessionId(sessionId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const addProduct = useCallback(async (p: { id: string; nombre: string; precio_venta: number; precio_upsell_coworking?: number | null; tipo?: 'simple' | 'paquete' }, tipoPrecio?: 'especial' | 'promocion') => {
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
        toast.error('Este paquete no tiene componentes configurados. Contacta al administrador.');
        return;
      }
      const invalid = (comps as any[]).filter(c => !c.productos || c.productos.activo === false);
      if (invalid.length > 0) {
        toast.error('Paquete con componentes inválidos o inactivos. Contacta al administrador.');
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

    let precio = p.precio_venta;
    let nombreDisplay = p.nombre;

    if (tipoPrecio === 'especial' && p.precio_upsell_coworking != null) {
      precio = p.precio_upsell_coworking;
      nombreDisplay = `⭐ ${p.nombre}`;
    } else if (tipoPrecio === 'promocion') {
      precio = 0;
      nombreDisplay = `🎁 ${p.nombre}`;
    }

    if (tipoPrecio && user) {
      const accion = tipoPrecio === 'especial' ? 'precio_especial_manual' : 'promocion_producto';
      const descripcion = tipoPrecio === 'especial'
        ? `Precio especial aplicado manualmente por ${profile?.nombre ?? 'Usuario'}`
        : `Promoción (gratis) aplicada por ${profile?.nombre ?? 'Usuario'}`;
      supabase.from('audit_logs').insert({
        user_id: user.id,
        accion,
        descripcion,
        metadata: { producto_id: p.id, producto_nombre: p.nombre, precio_normal: p.precio_venta, precio_aplicado: precio },
      }).then(() => {});
    }

    setItems(prev => {
      const existing = prev.find(i => i.producto_id === p.id && i.tipo_concepto === 'producto' && i.precio_unitario === precio);
      if (existing) {
        return prev.map(i => i.producto_id === p.id && i.tipo_concepto === 'producto' && i.precio_unitario === precio
          ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unitario }
          : i
        );
      }
      return [...prev, {
        producto_id: p.id,
        nombre: nombreDisplay,
        precio_unitario: precio,
        cantidad: 1,
        subtotal: precio,
        tipo_concepto: 'producto' as const,
      }];
    });
  }, [user, profile]);

  const handleImportSession = useCallback((sessionItems: CartItem[], sessionId: string, _clienteNombre: string) => {
    setOriginalSessionItems(JSON.parse(JSON.stringify(sessionItems.filter(i => i.tipo_concepto !== 'coworking'))));
    setItems(prev => [
      ...prev.filter(i => i.tipo_concepto === 'producto' && !i.coworking_session_id),
      ...sessionItems,
    ]);
    setImportedSessionId(sessionId);
  }, []);

  const handleClearCart = async () => {
    if (importedSessionId && originalSessionItems.length > 0) {
      try {
        for (const original of originalSessionItems) {
          const current = items.find(i => i.producto_id === original.producto_id && i.coworking_session_id === importedSessionId);
          const currentQty = current ? current.cantidad : 0;
          if (currentQty < original.cantidad) {
            if (currentQty === 0) {
              await supabase.from('coworking_session_upsells').insert({
                session_id: importedSessionId,
                producto_id: original.producto_id,
                precio_especial: original.precio_unitario,
                cantidad: original.cantidad,
              });
            } else {
              await supabase.from('coworking_session_upsells')
                .update({ cantidad: original.cantidad })
                .eq('session_id', importedSessionId)
                .eq('producto_id', original.producto_id);
            }
          }
        }
      } catch (err) {
        console.error('Error restaurando sesión al limpiar:', err);
        toast.error('Hubo un problema al restaurar la sesión original');
      }
    }
    setItems([]);
    setImportedSessionId(undefined);
    setOriginalSessionItems([]);
    setPropina(0);
    setKey(k => k + 1);
  };

  const updateQty = useCallback(async (productoId: string, delta: number) => {
    const current = items.find(i => i.producto_id === productoId);
    if (!current) return;

    const isCoworkingLinked =
      (current.tipo_concepto === 'amenity' || current.tipo_concepto === 'producto') &&
      !!current.coworking_session_id;

    if (delta > 0) {
      const validacion = await verificarStock(productoId, 1);
      if (!validacion.valido) { toast.error(validacion.error); return; }
    }

    if (isCoworkingLinked) {
      const newQty = current.cantidad + delta;
      if (newQty <= 0) {
        const { error } = await supabase
          .from('coworking_session_upsells')
          .delete()
          .eq('session_id', current.coworking_session_id!)
          .eq('producto_id', productoId);
        if (error) { toast.error('No se pudo eliminar el consumo de la sesión'); return; }
        setItems(prev => prev.filter(i => i.producto_id !== productoId));
        return;
      }
      const { error } = await supabase
        .from('coworking_session_upsells')
        .update({ cantidad: newQty })
        .eq('session_id', current.coworking_session_id!)
        .eq('producto_id', productoId);
      if (error) { toast.error('No se pudo actualizar la cantidad en la sesión'); return; }
      setItems(prev => prev.map(i =>
        i.producto_id === productoId
          ? { ...i, cantidad: newQty, subtotal: newQty * i.precio_unitario }
          : i
      ));
      return;
    }

    setItems(prev => prev.map(i => {
      if (i.producto_id !== productoId) return i;
      const newQty = Math.max(1, i.cantidad + delta);
      return { ...i, cantidad: newQty, subtotal: newQty * i.precio_unitario };
    }));
  }, [items]);

  const removeItem = useCallback(async (productoId: string) => {
    const item = items.find(i => i.producto_id === productoId);
    if (!item) return;
    if (item.coworking_session_id) {
      if (item.tipo_concepto === 'coworking') {
        setImportedSessionId(undefined);
        setOriginalSessionItems([]);
        setItems(prev => prev.filter(i => i.coworking_session_id !== item.coworking_session_id));
        return;
      }
      const { error } = await supabase.from('coworking_session_upsells')
        .delete()
        .eq('session_id', item.coworking_session_id)
        .eq('producto_id', productoId);
      if (error) toast.error('Error al desvincular consumo de la BD');
    }
    setItems(prev => prev.filter(i => i.producto_id !== productoId));
  }, [items]);

  const updateNotas = useCallback((productoId: string, notas: string) => {
    setItems(prev => prev.map(i =>
      i.producto_id === productoId ? { ...i, notas: notas.trim() || undefined } : i
    ));
  }, []);

  const missingImportedItems = useMemo(() => {
    if (!importedSessionId || originalSessionItems.length === 0) return [];
    const result: (CartItem & { cantidad_faltante: number })[] = [];
    for (const orig of originalSessionItems) {
      const current = items.find(i => i.producto_id === orig.producto_id && i.coworking_session_id === orig.coworking_session_id);
      const currentQty = current ? current.cantidad : 0;
      if (orig.cantidad > currentQty) {
        result.push({ ...orig, cantidad_faltante: orig.cantidad - currentQty });
      }
    }
    return result;
  }, [items, originalSessionItems, importedSessionId]);

  const handleRestoreItem = useCallback(async (item: CartItem) => {
    const current = items.find(i => i.producto_id === item.producto_id && i.coworking_session_id === item.coworking_session_id);
    if (current) {
      await updateQty(item.producto_id, 1);
    } else {
      const validacion = await verificarStock(item.producto_id, 1);
      if (!validacion.valido) { toast.error(validacion.error); return; }
      const { error } = await supabase.from('coworking_session_upsells').insert({
        session_id: item.coworking_session_id!,
        producto_id: item.producto_id,
        precio_especial: item.precio_unitario,
        cantidad: 1,
      });
      if (error) { toast.error('Error al restaurar en BD'); return; }
      setItems(prev => [...prev, { ...item, cantidad: 1, subtotal: item.precio_unitario }]);
    }
  }, [items, updateQty]);

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);

  const handleConfirm = () => {
    const ivaPct = config.iva_porcentaje / 100;
    const iva = subtotal - (subtotal / (1 + ivaPct));
    const total = subtotal + propina;

    setSummary({
      items,
      subtotal,
      iva: Math.round(iva * 100) / 100,
      comision: 0,
      propina: Math.round(propina * 100) / 100,
      total: Math.round(total * 100) / 100,
      metodo_pago: metodoPago as VentaSummary['metodo_pago'],
      tipo_consumo: tipoConsumo as VentaSummary['tipo_consumo'],
      mixed_payment: metodoPago === 'mixto' ? mixedPayment : undefined,
      propina_en_digital: metodoPago === 'mixto' ? propinaEnDigital : undefined,
      coworking_session_id: importedSessionId,
    });
  };

  const handleSuccess = () => {
    setItems([]);
    setMetodoPago('efectivo');
    setTipoConsumo('sitio');
    setMixedPayment({ efectivo: 0, tarjeta: 0, transferencia: 0 });
    setPropina(0);
    setPropinaEnDigital(true);
    setImportedSessionId(undefined);
    setOriginalSessionItems([]);
    setKey(k => k + 1);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <CoworkingSessionSelector
            key={key}
            onImportSession={handleImportSession}
            importedSessionId={importedSessionId}
            pendingSessionId={pendingSessionId}
            onPendingConsumed={() => setPendingSessionId(null)}
          />
          <ProductGrid key={`products-${key}`} onAdd={addProduct} canUseSpecialPrice={canUseSpecialPrice} />
        </div>
        <div className="lg:col-span-2 border border-border rounded-lg p-4 bg-card">
          <CartPanel
            items={items}
            metodoPago={metodoPago}
            tipoConsumo={tipoConsumo}
            mixedPayment={mixedPayment}
            propina={propina}
            propinaEnDigital={propinaEnDigital}
            onSetMetodoPago={setMetodoPago}
            onSetTipoConsumo={setTipoConsumo}
            onSetMixedPayment={setMixedPayment}
            onSetPropina={setPropina}
            onSetPropinaEnDigital={setPropinaEnDigital}
            onUpdateQty={updateQty}
            onUpdateNotas={updateNotas}
            onRemove={removeItem}
            onClear={handleClearCart}
            onConfirm={handleConfirm}
            subtotal={subtotal}
            comisionPct={0}
            missingImportedItems={missingImportedItems}
            onRestoreItem={handleRestoreItem}
          />
        </div>
      </div>

      {isAdmin && <SolicitudesCancelacionPanel />}

      <ConfirmVentaDialog summary={summary} onClose={() => setSummary(null)} onSuccess={handleSuccess} />
    </div>
  );
};

export default PosPage;
