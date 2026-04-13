import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Clock, DollarSign } from 'lucide-react';
import type { CheckoutSummary } from './types';
import { nowCDMX } from '@/lib/utils';

interface Props {
  summary: CheckoutSummary | null;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
}

export function CheckoutDialog({ summary, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  if (!summary) return null;

  const formatMin = (min: number) => {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };

  const useFraccion15 = summary.useFraccion15 ?? true;

  const handleConfirm = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('coworking_sessions')
      .update({
        estado: 'pendiente_pago' as any,
        fecha_salida_real: nowCDMX(),
        monto_acumulado: summary.total,
      })
      .eq('id', summary.session.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        accion: 'checkout_coworking',
        descripcion: `Check-out: ${summary.session.cliente_nombre} (${summary.session.pax_count} pax) — $${summary.total.toFixed(2)}`,
        metadata: {
          session_id: summary.session.id,
          area_id: summary.session.area_id,
          tiempo_real_min: summary.tiempoRealMin,
          tiempo_excedido_min: summary.tiempoExcedidoMin,
          total: summary.total,
        },
      });
      toast({ title: 'Sesión lista para cobro', description: 'Redirigiendo al Punto de Venta...' });
      onClose();
      await onSuccess?.();
      navigate(`/pos?session=${summary.session.id}`);
    }
  };

  const upsellsTotal = summary.upsells.reduce((sum, u) => sum + u.precio_especial * u.cantidad, 0);

  return (
    <Dialog open={!!summary} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Resumen de Check-out
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-lg border border-border p-4 space-y-2">
            <p className="font-medium text-foreground">{summary.session.cliente_nombre}</p>
            <p className="text-sm text-muted-foreground">{summary.area.nombre_area} · {summary.session.pax_count} pax</p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> Tiempo contratado</span>
              <span>{formatMin(summary.tiempoContratadoMin)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tiempo real</span>
              <span>{formatMin(summary.tiempoRealMin)}</span>
            </div>
            {summary.tiempoExcedidoMin > 0 && (
              <div className="flex justify-between text-sm text-amber-600 dark:text-amber-400">
                <span>
                  {useFraccion15
                    ? `Tiempo excedido (${summary.bloquesExtra} bloques de 15 min)`
                    : `Tiempo excedido (${formatMin(summary.tiempoExcedidoMin)} prorrateado)`}
                </span>
                <span>
                  {useFraccion15
                    ? `+${formatMin(summary.bloquesExtra * 15)}`
                    : `+${formatMin(summary.tiempoExcedidoMin)}`}
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal contratado</span>
              <span>${summary.subtotalContratado.toFixed(2)}</span>
            </div>
            {summary.cargoExtra > 0 && (
              <div className="flex justify-between text-sm text-amber-600 dark:text-amber-400">
                <span>Cargo por excedente</span>
                <span>+${summary.cargoExtra.toFixed(2)}</span>
              </div>
            )}
            {summary.upsells.map((u, i) => (
              <div key={i} className="flex justify-between text-sm text-primary">
                <span>{u.precio_especial === 0 ? '🎁' : '☕'} {u.nombre} {u.cantidad > 1 ? `x${u.cantidad}` : ''}</span>
                <span>{u.precio_especial === 0 ? 'Incluido' : `+$${(u.precio_especial * u.cantidad).toFixed(2)}`}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-lg pt-1 border-t border-border">
              <span>Total a pagar</span>
              <span className="text-primary">${summary.total.toFixed(2)}</span>
            </div>
          </div>

          <Button onClick={handleConfirm} className="w-full">Finalizar Estancia y Pasar a Caja</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
