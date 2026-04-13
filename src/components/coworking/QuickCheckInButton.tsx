import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Reservacion, Area } from './types';
import { dateToCDMX } from '@/lib/utils';

interface Props {
  reservacion: Reservacion;
  area: Area | undefined;
  getAvailablePax: (areaId: string) => number;
  onSuccess?: () => void | Promise<void>;
}

export function QuickCheckInButton({ reservacion, area, getAvailablePax, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleQuickCheckIn = async () => {
    if (!user || !area) return;
    setLoading(true);

    const available = getAvailablePax(reservacion.area_id);

    if (area.es_privado && available < area.capacidad_pax) {
      toast({ variant: 'destructive', title: 'Área privada ocupada', description: 'Este espacio ya tiene una sesión activa.' });
      setLoading(false);
      return;
    }

    if (!area.es_privado && reservacion.pax_count > available) {
      toast({ variant: 'destructive', title: 'Capacidad excedida', description: `Solo hay ${available} lugar(es) disponible(s).` });
      setLoading(false);
      return;
    }

    const fechaInicio = new Date();
    const fechaFinEstimada = new Date(fechaInicio.getTime() + reservacion.duracion_horas * 3600000);

    const { error: sessionError } = await supabase.from('coworking_sessions').insert({
      cliente_nombre: reservacion.cliente_nombre,
      area_id: reservacion.area_id,
      pax_count: reservacion.pax_count,
      usuario_id: user.id,
      fecha_inicio: dateToCDMX(fechaInicio),
      fecha_fin_estimada: dateToCDMX(fechaFinEstimada),
      estado: 'activo',
      monto_acumulado: 0,
    });

    if (sessionError) {
      toast({ variant: 'destructive', title: 'Error', description: sessionError.message });
      setLoading(false);
      return;
    }

    // Update reservation status
    await supabase.from('coworking_reservaciones')
      .update({ estado: 'confirmada' })
      .eq('id', reservacion.id);

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      accion: 'checkin_desde_reservacion',
      descripcion: `Check-in rápido desde reservación: ${reservacion.cliente_nombre} (${reservacion.pax_count} pax)`,
      metadata: { reservacion_id: reservacion.id, area_id: reservacion.area_id },
    });

    toast({ title: 'Check-in realizado desde reservación' });
    await onSuccess?.();
    setLoading(false);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleQuickCheckIn} disabled={loading} title="Check-in rápido">
      <Play className="h-3 w-3" />
    </Button>
  );
}
