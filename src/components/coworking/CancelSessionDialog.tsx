import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle } from 'lucide-react';
import type { CoworkingSession } from './types';
import { nowCDMX } from '@/lib/utils';

interface Props {
  session: CoworkingSession | null;
  isAdmin: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
}

export function CancelSessionDialog({ session, isAdmin, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setMotivo('');
    onClose();
  };

  const handleConfirm = async () => {
    if (!user || !session) return;
    if (!motivo.trim()) return;

    setLoading(true);

    if (isAdmin) {
      // Admin: cancel directly
      const { error } = await supabase
        .from('coworking_sessions')
        .update({
          estado: 'cancelado',
          monto_acumulado: 0,
          fecha_salida_real: nowCDMX(),
        })
        .eq('id', session.id);

      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
        setLoading(false);
        return;
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        accion: 'cancelar_sesion_coworking',
        descripcion: `Cancelación directa: ${session.cliente_nombre} — Motivo: ${motivo.trim()}`,
        metadata: {
          session_id: session.id,
          area_id: session.area_id,
          cliente_nombre: session.cliente_nombre,
          pax_count: session.pax_count,
          motivo: motivo.trim(),
          cancelado_por: user.id,
        },
      });

      toast({ title: 'Sesión cancelada', description: `Sesión de ${session.cliente_nombre} cancelada correctamente.` });
    } else {
      // Non-admin: send request
      const { error } = await supabase
        .from('solicitudes_cancelacion_sesiones' as any)
        .insert({
          session_id: session.id,
          solicitante_id: user.id,
          motivo: motivo.trim(),
        });

      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
        setLoading(false);
        return;
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        accion: 'solicitar_cancelacion_sesion',
        descripcion: `Solicitud de cancelación: ${session.cliente_nombre} — Motivo: ${motivo.trim()}`,
        metadata: {
          session_id: session.id,
          area_id: session.area_id,
          cliente_nombre: session.cliente_nombre,
          pax_count: session.pax_count,
          motivo: motivo.trim(),
        },
      });

      toast({ title: 'Solicitud enviada', description: 'Tu solicitud de cancelación fue enviada al administrador.' });
    }

    setMotivo('');
    setLoading(false);
    onClose();
    await onSuccess?.();
  };

  return (
    <AlertDialog open={!!session} onOpenChange={open => !open && handleClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {isAdmin ? 'Cancelar Sesión' : 'Solicitar Cancelación'}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {isAdmin ? (
              <>
                ¿Estás seguro de que deseas cancelar esta sesión?{' '}
                <span className="font-semibold text-foreground">Esta acción no se puede deshacer.</span>
              </>
            ) : (
              <>
                Se enviará una solicitud al administrador para cancelar esta sesión.
              </>
            )}
            {session && (
              <span className="block mt-2 text-foreground/80">
                Cliente: <span className="font-medium">{session.cliente_nombre}</span> · {session.pax_count} pax
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="motivo" className="text-sm font-medium">
            Motivo de la cancelación <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="motivo"
            placeholder="Ej. Falla técnica, Cliente se retiró por urgencia..."
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            className="min-h-[90px] resize-none"
            maxLength={300}
          />
          <p className="text-xs text-muted-foreground text-right">{motivo.length}/300</p>
        </div>

        <AlertDialogFooter className="flex-row gap-2 sm:justify-end">
          <AlertDialogCancel onClick={handleClose} disabled={loading}>
            Regresar
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!motivo.trim() || loading}
          >
            {loading
              ? (isAdmin ? 'Cancelando...' : 'Enviando...')
              : (isAdmin ? 'Confirmar Cancelación' : 'Enviar Solicitud')
            }
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
