import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle2, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { VentaSummary } from './types';
import { nowCDMX } from '@/lib/utils';

interface Props {
  summary: VentaSummary | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ConfirmVentaDialog({ summary, onClose, onSuccess }: Props) {
  const { user, profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [ticket, setTicket] = useState<VentaSummary | null>(null);

  if (!summary && !ticket) return null;

  const handleConfirm = async () => {
    if (!user || !summary) return;
    setSaving(true);
    try {
      // 0. Pre-validar inventario unificado vía RPC (considera consumos comprometidos en coworking)
      const qtyByProduct = new Map<string, number>();

      const productoItems = summary.items.filter(
        (item) => item.tipo_concepto === 'producto' && !!item.producto_id && !item.producto_id.startsWith('coworking-')
      );
      for (const item of productoItems) {
        const productId = item.producto_id as string;
        qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + item.cantidad);
      }

      const paqueteItems = summary.items.filter(item => item.tipo_concepto === 'paquete');
      for (const pq of paqueteItems) {
        for (const comp of (pq.componentes ?? [])) {
          const totalQty = comp.cantidad * pq.cantidad;
          qtyByProduct.set(comp.producto_id, (qtyByProduct.get(comp.producto_id) ?? 0) + totalQty);
        }
      }

      if (qtyByProduct.size > 0) {
        const cartItems = Array.from(qtyByProduct.entries()).map(([producto_id, cantidad]) => ({
          producto_id,
          cantidad,
        }));
        const { data: validacion, error: valErr } = await supabase.rpc('validar_stock_carrito' as any, {
          p_items: cartItems as any,
        });
        if (valErr) throw valErr;
        const result = validacion as { valido: boolean; error?: string };
        if (!result?.valido) {
          toast.error(result?.error ?? 'Stock insuficiente para completar la venta');
          return;
        }
      }

      // 0.5. Congelar sesión coworking antes de intentar cobrar
      if (summary.coworking_session_id) {
        await supabase.from('coworking_sessions').update({
          estado: 'pendiente_pago' as any,
          fecha_salida_real: nowCDMX(),
        }).eq('id', summary.coworking_session_id);
      }

      // 1. Insert venta
      // For tarjeta/transferencia: tip is included in the digital payment amount
      // For mixto: depends on propina_en_digital flag
      const propinaAmount = summary.propina || 0;

      let montoEfectivo = summary.mixed_payment?.efectivo ?? (summary.metodo_pago === 'efectivo' ? summary.subtotal : 0);
      let montoTarjeta = summary.mixed_payment?.tarjeta ?? (summary.metodo_pago === 'tarjeta' ? summary.subtotal : 0);
      let montoTransferencia = summary.mixed_payment?.transferencia ?? (summary.metodo_pago === 'transferencia' ? summary.subtotal : 0);

      // Add tip to the correct payment channel
      if (summary.metodo_pago === 'tarjeta') {
        montoTarjeta += propinaAmount;
      } else if (summary.metodo_pago === 'transferencia') {
        montoTransferencia += propinaAmount;
      } else if (summary.metodo_pago === 'efectivo') {
        montoEfectivo += propinaAmount;
      }
      // For mixto: amounts already include tip distribution from user input

      const { data: venta, error: ventaErr } = await supabase.from('ventas').insert({
        usuario_id: user.id,
        total_bruto: summary.subtotal,
        iva: summary.iva,
        comisiones_bancarias: 0,
        monto_propina: propinaAmount,
        total_neto: summary.subtotal,
        metodo_pago: summary.metodo_pago as any,
        tipo_consumo: summary.tipo_consumo as any,
        estado: 'completada' as any,
        fecha: nowCDMX(),
        monto_efectivo: montoEfectivo,
        monto_tarjeta: montoTarjeta,
        monto_transferencia: montoTransferencia,
        coworking_session_id: summary.coworking_session_id ?? null,
      }).select('id, folio').single();

      if (ventaErr || !venta) {
        // Revertir sesión coworking si fue congelada
        if (summary.coworking_session_id) {
          await supabase.from('coworking_sessions').update({
            estado: 'activo' as any,
            fecha_salida_real: null,
          }).eq('id', summary.coworking_session_id);
        }
        throw ventaErr || new Error('No se pudo crear la venta');
      }

      // 2. Build detalle_ventas — expanding packages into component lines
      // Para paquetes: prorrateamos el precio del paquete entre componentes proporcional al costo
      // Para productos simples y coworking/amenity: una línea cada uno
      type DetalleRow = {
        venta_id: string;
        producto_id: string | null;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
        tipo_concepto: any;
        coworking_session_id: string | null;
        descripcion: string | null;
        paquete_id?: string | null;
        paquete_nombre?: string | null;
      };
      const detalles: DetalleRow[] = [];

      // Cargar costos de componentes (para prorrateo) si hay paquetes
      const componentProductIds = new Set<string>();
      for (const pq of paqueteItems) {
        for (const c of (pq.componentes ?? [])) componentProductIds.add(c.producto_id);
      }
      let costoMap = new Map<string, number>();
      if (componentProductIds.size > 0) {
        const { data: prods } = await supabase
          .from('productos')
          .select('id, costo_total')
          .in('id', Array.from(componentProductIds));
        for (const p of prods ?? []) costoMap.set(p.id, Number(p.costo_total) || 0);
      }

      for (const item of summary.items) {
        if (item.tipo_concepto === 'paquete') {
          const pq = item;
          const componentes = pq.componentes ?? [];
          if (componentes.length === 0) continue;

          // Prorrateo proporcional al costo (con fallback a partes iguales si todos los costos = 0)
          const costos = componentes.map(c => (costoMap.get(c.producto_id) ?? 0) * c.cantidad);
          const sumaCostos = costos.reduce((s, c) => s + c, 0);
          const totalPaquete = +(pq.subtotal).toFixed(2);

          let precios: number[];
          if (sumaCostos > 0) {
            precios = costos.map(c => +(totalPaquete * (c / sumaCostos)).toFixed(2));
          } else {
            const equal = +(totalPaquete / componentes.length).toFixed(2);
            precios = componentes.map(() => equal);
          }
          // Ajustar el último componente para cuadrar centavos, evitando negativos
          const sumaPrecios = precios.reduce((s, p) => s + p, 0);
          const diff = +(totalPaquete - sumaPrecios).toFixed(2);
          if (precios.length > 0) {
            const lastIdx = precios.length - 1;
            const adjusted = +(precios[lastIdx] + diff).toFixed(2);
            if (adjusted >= 0) {
              precios[lastIdx] = adjusted;
            } else {
              // Si el ajuste haría negativo el último, distribuir la diferencia entre todos los componentes
              precios[lastIdx] = 0;
              const remainder = +(totalPaquete - precios.reduce((s, p) => s + p, 0)).toFixed(2);
              if (remainder !== 0 && precios.length > 1) {
                // Buscar el componente con mayor precio para absorber el residuo
                let maxIdx = 0;
                for (let i = 1; i < precios.length - 1; i++) if (precios[i] > precios[maxIdx]) maxIdx = i;
                precios[maxIdx] = +Math.max(0, precios[maxIdx] + remainder).toFixed(2);
              }
            }
          }
          // Asegurar que ningún precio quede negativo
          precios = precios.map(v => v < 0 ? 0 : v);

          componentes.forEach((c, idx) => {
            const cantTotal = Math.round(c.cantidad * pq.cantidad);
            const subtotalLinea = precios[idx];
            const precioUnitario = cantTotal > 0 ? +(subtotalLinea / cantTotal).toFixed(4) : 0;
            detalles.push({
              venta_id: venta.id,
              producto_id: c.producto_id,
              cantidad: cantTotal,
              precio_unitario: precioUnitario,
              subtotal: subtotalLinea,
              tipo_concepto: 'producto',
              coworking_session_id: null,
              descripcion: c.nombre,
              paquete_id: pq.paquete_id ?? pq.producto_id,
              paquete_nombre: pq.nombre,
            });
          });
        } else {
          detalles.push({
            venta_id: venta.id,
            producto_id: item.tipo_concepto === 'coworking' ? null : (item.producto_id || null),
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            subtotal: item.subtotal,
            tipo_concepto: item.tipo_concepto as any,
            coworking_session_id: item.coworking_session_id ?? null,
            descripcion: item.descripcion ?? item.nombre,
          });
        }
      }

      // detalle_ventas.producto_id has FK constraint — strip synthetic coworking IDs
      const realDetalles = detalles.map(d => {
        if (d.producto_id && d.producto_id.startsWith('coworking-')) {
          const { producto_id, ...rest } = d;
          return rest;
        }
        return d;
      });

      const { error: detErr } = await supabase.from('detalle_ventas').insert(realDetalles as any);
      if (detErr) {
        // Rollback: cancel the orphan venta since detalle failed (e.g. insufficient stock)
        await supabase.from('ventas').update({
          estado: 'cancelada' as any,
          motivo_cancelacion: `Venta cancelada automáticamente: ${detErr.message}`,
        }).eq('id', venta.id);
        throw detErr;
      }

      // 3. Finalize coworking session if linked
      if (summary.coworking_session_id) {
        try {
          const coworkingTotal = summary.items
            .filter(i => i.tipo_concepto === 'coworking')
            .reduce((s, i) => s + i.subtotal, 0);

          const { error: cwErr } = await supabase.from('coworking_sessions').update({
            estado: 'finalizado' as any,
            fecha_salida_real: nowCDMX(),
            monto_acumulado: coworkingTotal,
          }).eq('id', summary.coworking_session_id);

          if (cwErr) throw cwErr;
        } catch (cwError) {
          console.error('Error finalizando sesión coworking:', cwError);
          toast.error('Venta registrada, pero no se pudo cerrar la sesión de coworking. Ciérrala manualmente desde el panel de Coworking.');
        }
      }

      // 4. Create KDS order for kitchen (productos simples + amenities + componentes de paquetes)
      // - Excluir tiempo de servicio coworking (no preparable).
      // - Incluir amenities (ej. café cortesía coworking) con etiqueta especial.
      // - Filtrar productos marcados como `requiere_preparacion=false` (retail, agua embotellada, etc.).
      type KdsRaw = { producto_id: string | null; nombre_producto: string; cantidad: number; notas: string | null };
      const kdsItemsRaw: KdsRaw[] = [];
      for (const item of summary.items) {
        if (item.tipo_concepto === 'producto') {
          if (item.producto_id?.startsWith('coworking-')) continue;
          kdsItemsRaw.push({
            producto_id: item.producto_id ?? null,
            nombre_producto: item.nombre,
            cantidad: item.cantidad,
            notas: item.notas?.trim() || null,
          });
        } else if (item.tipo_concepto === 'amenity' && item.producto_id && !item.producto_id.startsWith('coworking-')) {
          kdsItemsRaw.push({
            producto_id: item.producto_id,
            nombre_producto: `${item.nombre} ☕ (cortesía coworking)`,
            cantidad: item.cantidad,
            notas: item.notas?.trim() || null,
          });
        } else if (item.tipo_concepto === 'paquete') {
          for (const c of (item.componentes ?? [])) {
            kdsItemsRaw.push({
              producto_id: c.producto_id,
              nombre_producto: `${c.nombre} (📦 ${item.nombre.replace(/^📦\s*/, '')})`,
              cantidad: c.cantidad * item.cantidad,
              notas: item.notas?.trim() || null,
            });
          }
        }
      }

      // Filter out products that don't require kitchen preparation
      const productIds = kdsItemsRaw.map(i => i.producto_id).filter((x): x is string => !!x);
      let preparacionMap = new Map<string, boolean>();
      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from('productos')
          .select('id, requiere_preparacion')
          .in('id', productIds);
        preparacionMap = new Map((prods ?? []).map((p: any) => [p.id, p.requiere_preparacion !== false]));
      }
      const kdsItemsFiltered = kdsItemsRaw.filter(it => {
        if (!it.producto_id) return true;
        return preparacionMap.get(it.producto_id) !== false;
      });

      if (kdsItemsFiltered.length > 0) {
        const { data: kdsOrder } = await supabase.from('kds_orders').insert({
          venta_id: venta.id,
          folio: venta.folio,
          tipo_consumo: summary.tipo_consumo,
          estado: 'pendiente' as any,
        }).select('id').single();

        if (kdsOrder) {
          const kdsItems = kdsItemsFiltered.map(it => ({ kds_order_id: kdsOrder.id, ...it }));
          await supabase.from('kds_order_items').insert(kdsItems as any);
        }
      }

      // 5. Audit log
      const numPaquetes = paqueteItems.length;
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        accion: numPaquetes > 0 ? 'venta_completada_con_paquetes' : 'venta_completada',
        descripcion: `Venta por $${summary.total.toFixed(2)} (${summary.metodo_pago})${summary.coworking_session_id ? ' + Coworking' : ''}${numPaquetes > 0 ? ` + ${numPaquetes} paquete(s)` : ''}${propinaAmount > 0 ? ` + Propina $${propinaAmount.toFixed(2)}` : ''}`,
        metadata: {
          venta_id: venta.id,
          total: summary.total,
          propina: propinaAmount,
          items: summary.items.length,
          paquetes: paqueteItems.map(p => ({ paquete_id: p.paquete_id ?? p.producto_id, nombre: p.nombre, cantidad: p.cantidad, componentes: p.componentes })),
        } as any,
      });

      // Show ticket
      setTicket({
        ...summary,
        folio: venta.folio,
        usuario_nombre: profile?.nombre ?? user.email ?? '',
        fecha: nowCDMX(),
      });

      toast.success('Venta registrada exitosamente');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al procesar la venta');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseTicket = () => {
    setTicket(null);
    onSuccess();
    onClose();
  };

  // Ticket view after successful sale
  if (ticket) {
    const coworkingItems = ticket.items.filter(i => i.tipo_concepto === 'coworking');
    const amenityItems = ticket.items.filter(i => i.tipo_concepto === 'amenity');
    const productoItems = ticket.items.filter(i => i.tipo_concepto === 'producto');

    const metodoPagoLabel: Record<string, string> = {
      efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Mixto'
    };

    return (
      <Dialog open onOpenChange={handleCloseTicket}>
        <DialogContent className="sm:max-w-md overflow-hidden print:shadow-none print:border-0 print:max-w-full">
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #ticket-print-area, #ticket-print-area * { visibility: visible !important; }
              #ticket-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 8px; font-size: 12px; }
              .no-print, .no-print * { display: none !important; }
            }
          `}</style>
          <DialogHeader>
            <DialogTitle className="text-center">🧾 Ticket de Venta</DialogTitle>
            {ticket.folio && (
              <p className="text-center text-sm font-bold text-primary">Folio: #{String(ticket.folio).padStart(4, '0')}</p>
            )}
          </DialogHeader>
          <div id="ticket-print-area" className="space-y-3 text-sm font-mono overflow-hidden">
            <div className="text-center font-bold text-base hidden print:block">
              Coco & Cacao + Kúuchil Meyaj
            </div>
            {ticket.folio && (
              <p className="text-center text-xs hidden print:block">Folio: #{String(ticket.folio).padStart(4, '0')}</p>
            )}
            <div className="text-center text-xs text-muted-foreground space-y-1">
              <p>{new Date(ticket.fecha!).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p>{new Date(ticket.fecha!).toLocaleTimeString('es-MX')}</p>
              <p>Atendió: {ticket.usuario_nombre}</p>
            </div>

            <Separator />

            {coworkingItems.length > 0 && (
              <>
                <p className="font-bold text-xs uppercase text-muted-foreground">Coworking</p>
                {coworkingItems.map(i => (
                  <div key={i.producto_id} className="flex justify-between gap-2">
                    <span className="flex-1 break-words min-w-0">{i.nombre}</span>
                    <span className="shrink-0">${i.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </>
            )}

            {amenityItems.length > 0 && (
              <>
                <p className="font-bold text-xs uppercase text-muted-foreground">Amenities (incluidos)</p>
                {amenityItems.map(i => (
                  <div key={i.producto_id} className="flex justify-between gap-2 text-muted-foreground">
                    <span className="flex-1 break-words min-w-0">{i.cantidad}x {i.nombre}</span>
                    <span className="shrink-0">$0.00</span>
                  </div>
                ))}
              </>
            )}

            {productoItems.length > 0 && (
              <>
                <p className="font-bold text-xs uppercase text-muted-foreground">Productos</p>
                {productoItems.map(i => (
                  <div key={i.producto_id} className="flex justify-between gap-2">
                    <span className="flex-1 break-words min-w-0">{i.cantidad}x {i.nombre}</span>
                    <span className="shrink-0">${i.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </>
            )}

            <Separator />

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Subtotal (sin IVA)</span>
                <span>${(ticket.subtotal - ticket.iva).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA</span>
                <span>${ticket.iva.toFixed(2)}</span>
              </div>
              {ticket.propina > 0 && (
                <div className="flex justify-between">
                  <span>Propina</span>
                  <span>+${ticket.propina.toFixed(2)}</span>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex justify-between font-bold text-base">
              <span>TOTAL</span>
              <span>${ticket.total.toFixed(2)}</span>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              <p>Método: {metodoPagoLabel[ticket.metodo_pago]}</p>
              {ticket.metodo_pago === 'mixto' && ticket.mixed_payment && (
                <p>
                  Efvo: ${ticket.mixed_payment.efectivo.toFixed(2)} |
                  Tarj: ${ticket.mixed_payment.tarjeta.toFixed(2)} |
                  Transf: ${ticket.mixed_payment.transferencia.toFixed(2)}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="no-print gap-2">
            <Button variant="outline" className="flex-1" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
            <Button className="flex-1" onClick={handleCloseTicket}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Confirmation view before sale
  const metodoPagoLabel: Record<string, string> = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Mixto'
  };
  const tipoConsumoLabel: Record<string, string> = {
    sitio: 'En sitio', para_llevar: 'Para llevar', delivery: 'Delivery'
  };

  return (
    <Dialog open={!!summary} onOpenChange={() => !saving && onClose()}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" /> Confirmar Venta
          </DialogTitle>
          <DialogDescription>Revisa el desglose antes de confirmar</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="max-h-40 overflow-y-auto space-y-1">
            {summary!.items.map(item => (
              <div key={item.producto_id} className="flex justify-between gap-2 text-sm">
                <span className="flex-1 break-words min-w-0">{item.cantidad}x {item.nombre}</span>
                <span className="font-medium shrink-0">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal (sin IVA)</span>
              <span>${(summary!.subtotal - summary!.iva).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span>${summary!.iva.toFixed(2)}</span>
            </div>
            {summary!.propina > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Propina</span>
                <span className="text-primary">+${summary!.propina.toFixed(2)}</span>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex justify-between font-bold text-lg">
            <span>Total a cobrar</span>
            <span className="text-primary">${summary!.total.toFixed(2)}</span>
          </div>

          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Pago: {metodoPagoLabel[summary!.metodo_pago]}</span>
            <span>Consumo: {tipoConsumoLabel[summary!.tipo_consumo]}</span>
          </div>

          {summary!.metodo_pago === 'mixto' && summary!.mixed_payment && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
              Efectivo: ${summary!.mixed_payment.efectivo.toFixed(2)} |
              Tarjeta: ${summary!.mixed_payment.tarjeta.toFixed(2)} |
              Transferencia: ${summary!.mixed_payment.transferencia.toFixed(2)}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar Venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
