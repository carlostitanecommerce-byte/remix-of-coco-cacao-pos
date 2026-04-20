import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Store, Lock, DoorOpen, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { CartPanel } from '@/components/pos/CartPanel';
import { ConfirmVentaDialog } from '@/components/pos/ConfirmVentaDialog';
import { CoworkingSessionSelector } from '@/components/pos/CoworkingSessionSelector';
import { AperturaCajaDialog } from '@/components/pos/AperturaCajaDialog';
import { CierreCajaDialog } from '@/components/pos/CierreCajaDialog';
import { MovimientosCajaPanel } from '@/components/pos/MovimientosCajaPanel';
import { VentasTurnoPanel } from '@/components/pos/VentasTurnoPanel';
import { SolicitudesCancelacionPanel } from '@/components/pos/SolicitudesCancelacionPanel';
import { useVentaConfig } from '@/components/pos/useVentaConfig';
import { useCajaSession } from '@/hooks/useCajaSession';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { verificarStock } from '@/hooks/useValidarStock';
import type { CartItem, VentaSummary, MixedPayment } from '@/components/pos/types';

const PosPage = () => {
  const { config } = useVentaConfig();
  const { cajaAbierta, loading: cajaLoading, movimientos, abrirCaja, registrarMovimiento, cerrarCaja } = useCajaSession();
  const { roles, profile, user } = useAuth();
  const canUseSpecialPrice = roles.includes('administrador') || roles.includes('supervisor');
  const isAdmin = roles.includes('administrador');
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [tipoConsumo, setTipoConsumo] = useState('sitio');
  const [mixedPayment, setMixedPayment] = useState<MixedPayment>({ efectivo: 0, tarjeta: 0, transferencia: 0 });
  const [propina, setPropina] = useState(0);
  const [propinaEnDigital, setPropinaEnDigital] = useState(true);
  const [summary, setSummary] = useState<VentaSummary | null>(null);
  const [key, setKey] = useState(0);
  const [importedSessionId, setImportedSessionId] = useState<string | undefined>();
  const [showCierre, setShowCierre] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [showApertura, setShowApertura] = useState(false);

  // Check for ?session= param for auto-import from coworking checkout
  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (sessionId && cajaAbierta && !cajaLoading) {
      setPendingSessionId(sessionId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, cajaAbierta, cajaLoading, setSearchParams]);

  const addProduct = useCallback((p: { id: string; nombre: string; precio_venta: number; precio_upsell_coworking?: number | null }, tipoPrecio?: 'especial' | 'promocion') => {
    let precio = p.precio_venta;
    let nombreDisplay = p.nombre;

    if (tipoPrecio === 'especial' && p.precio_upsell_coworking != null) {
      precio = p.precio_upsell_coworking;
      nombreDisplay = `⭐ ${p.nombre}`;
    } else if (tipoPrecio === 'promocion') {
      precio = 0;
      nombreDisplay = `🎁 ${p.nombre}`;
    }

    // Audit log for special price or promotion
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
    setItems(prev => [
      ...prev.filter(i => i.tipo_concepto === 'producto'),
      ...sessionItems,
    ]);
    setImportedSessionId(sessionId);
  }, []);

  const updateQty = useCallback((productoId: string, delta: number) => {
    setItems(prev => prev.map(i => {
      if (i.producto_id !== productoId) return i;
      const newQty = Math.max(1, i.cantidad + delta);
      return { ...i, cantidad: newQty, subtotal: newQty * i.precio_unitario };
    }));
  }, []);

  const removeItem = useCallback((productoId: string) => {
    setItems(prev => {
      const item = prev.find(i => i.producto_id === productoId);
      if (item?.coworking_session_id) {
        // Only remove entire session when deleting the main coworking tariff
        if (item.tipo_concepto === 'coworking') {
          setImportedSessionId(undefined);
          return prev.filter(i => i.coworking_session_id !== item.coworking_session_id);
        }
        // Amenity or upsell: remove only that specific item
        return prev.filter(i => i.producto_id !== productoId);
      }
      return prev.filter(i => i.producto_id !== productoId);
    });
  }, []);

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);

  const handleConfirm = () => {
    // Admin trying to sell with caja closed
    if (!cajaAbierta) {
      toast.error('Debes abrir la caja antes de procesar una venta');
      setShowApertura(true);
      return;
    }

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
    setKey(k => k + 1);
  };

  if (cajaLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Cargando estado de caja...</p>
      </div>
    );
  }

  // Operative roles (non-admin): full block when caja closed
  if (!cajaAbierta && !isAdmin) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground flex items-center gap-3">
            <Store className="h-8 w-8 text-primary" />
            Punto de Venta
          </h1>
          <p className="text-muted-foreground mt-1">Registra ventas y descuenta inventario automáticamente</p>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <Badge variant="destructive" className="gap-1 py-1">
            <div className="h-2 w-2 rounded-full bg-destructive-foreground" />
            🔴 Caja Cerrada
          </Badge>
        </div>

        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Lock className="h-16 w-16 text-muted-foreground/50" />
          <h2 className="text-xl font-heading font-semibold text-foreground">Caja Cerrada</h2>
          <p className="text-muted-foreground text-center max-w-md">
            No hay una caja abierta. Para iniciar operaciones debes realizar la apertura de caja ingresando el fondo fijo.
          </p>
        </div>

        <AperturaCajaDialog open={!cajaAbierta} onAbrirCaja={abrirCaja} />
      </div>
    );
  }

  // Admin with caja closed: can browse but not sell
  const cajaCerradaAdmin = !cajaAbierta && isAdmin;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground flex items-center gap-3">
            <Store className="h-8 w-8 text-primary" />
            Punto de Venta
          </h1>
          <p className="text-muted-foreground mt-1">Registra ventas y descuenta inventario automáticamente</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {cajaAbierta ? (
            <Badge variant="outline" className="gap-1 py-1 border-primary text-primary">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              🟢 Caja Abierta
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1 py-1">
              <div className="h-2 w-2 rounded-full bg-destructive-foreground" />
              🔴 Caja Cerrada
            </Badge>
          )}

          {cajaAbierta && (
            <>
              <MovimientosCajaPanel movimientos={movimientos} onRegistrar={registrarMovimiento} />
              <Button variant="outline" size="sm" onClick={() => setShowCierre(true)} className="gap-1">
                <DoorOpen className="h-4 w-4" />
                Cerrar Caja
              </Button>
            </>
          )}

          {cajaCerradaAdmin && (
            <Button size="sm" onClick={() => setShowApertura(true)} className="gap-1">
              <Lock className="h-4 w-4" />
              Abrir Caja
            </Button>
          )}
        </div>
      </div>

      {cajaCerradaAdmin && (
        <div className="flex items-center gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            <strong>Caja Cerrada.</strong> Puedes consultar productos, pero para procesar ventas debes abrir la caja primero.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          {cajaAbierta && (
            <CoworkingSessionSelector
              key={key}
              onImportSession={handleImportSession}
              importedSessionId={importedSessionId}
              pendingSessionId={pendingSessionId}
              onPendingConsumed={() => setPendingSessionId(null)}
            />
          )}
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
            onRemove={removeItem}
            onClear={() => { setItems([]); setImportedSessionId(undefined); setPropina(0); }}
            onConfirm={handleConfirm}
            subtotal={subtotal}
            comisionPct={0}
          />
        </div>
      </div>

      {isAdmin && (
        <div className="space-y-4">
          <SolicitudesCancelacionPanel />
          <VentasTurnoPanel isAdmin={isAdmin} />
        </div>
      )}

      <ConfirmVentaDialog summary={summary} onClose={() => setSummary(null)} onSuccess={handleSuccess} />

      {cajaAbierta && (
        <CierreCajaDialog
          open={showCierre}
          onClose={() => setShowCierre(false)}
          caja={cajaAbierta}
          movimientos={movimientos}
          onCerrarCaja={cerrarCaja}
        />
      )}

      <AperturaCajaDialog open={showApertura && !cajaAbierta} onAbrirCaja={async (monto) => {
        const result = await abrirCaja(monto);
        if (!result.error) setShowApertura(false);
        return result;
      }} />
    </div>
  );
};

export default PosPage;
