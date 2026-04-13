import { supabase } from '@/integrations/supabase/client';

/**
 * Checks if a new/edited reservation conflicts with existing reservations or active sessions.
 * For private areas: any overlap = blocked.
 * For public areas: only blocked if sum of pax would exceed capacity.
 */
export async function checkReservationConflict(params: {
  areaId: string;
  fechaReserva: string;
  horaInicio: string;
  duracionHoras: number;
  paxCount: number;
  esPrivado: boolean;
  capacidadPax: number;
  excludeReservacionId?: string;
}): Promise<{ hasConflict: boolean; message: string }> {
  const { areaId, fechaReserva, horaInicio, duracionHoras, paxCount, esPrivado, capacidadPax, excludeReservacionId } = params;

  const startDate = new Date(`${fechaReserva}T${horaInicio}`);
  const endDate = new Date(startDate.getTime() + duracionHoras * 3600000);

  // Check overlapping reservations
  let query = supabase
    .from('coworking_reservaciones')
    .select('id, cliente_nombre, hora_inicio, duracion_horas, pax_count')
    .eq('area_id', areaId)
    .eq('fecha_reserva', fechaReserva)
    .in('estado', ['pendiente', 'confirmada']);

  if (excludeReservacionId) {
    query = query.neq('id', excludeReservacionId);
  }

  const { data: existingRes } = await query;

  if (existingRes) {
    if (esPrivado) {
      // Private: any overlap = blocked
      for (const r of existingRes) {
        const rStart = new Date(`${fechaReserva}T${r.hora_inicio}`);
        const rEnd = new Date(rStart.getTime() + r.duracion_horas * 3600000);
        if (startDate < rEnd && endDate > rStart) {
          return {
            hasConflict: true,
            message: `El área privada ya está reservada en ese horario (${r.cliente_nombre}: ${r.hora_inicio.slice(0, 5)} - ${rEnd.toTimeString().slice(0, 5)})`,
          };
        }
      }
    } else {
      // Public: check if pax would exceed capacity during overlap
      for (const r of existingRes) {
        const rStart = new Date(`${fechaReserva}T${r.hora_inicio}`);
        const rEnd = new Date(rStart.getTime() + r.duracion_horas * 3600000);
        if (startDate < rEnd && endDate > rStart) {
          // Count all overlapping pax
          const overlappingPax = existingRes
            .filter(or => {
              const oStart = new Date(`${fechaReserva}T${or.hora_inicio}`);
              const oEnd = new Date(oStart.getTime() + or.duracion_horas * 3600000);
              return startDate < oEnd && endDate > oStart;
            })
            .reduce((sum, or) => sum + or.pax_count, 0);

          if (overlappingPax + paxCount > capacidadPax) {
            return {
              hasConflict: true,
              message: `Capacidad insuficiente: hay ${overlappingPax} pax reservados y solo ${capacidadPax - overlappingPax} disponibles.`,
            };
          }
          break;
        }
      }
    }
  }

  // Check overlapping active sessions on the same date
  const dayStart = new Date(`${fechaReserva}T00:00:00`).toISOString();
  const dayEnd = new Date(`${fechaReserva}T23:59:59`).toISOString();

  const { data: activeSessions } = await supabase
    .from('coworking_sessions')
    .select('id, cliente_nombre, fecha_inicio, fecha_fin_estimada, pax_count')
    .eq('area_id', areaId)
    .eq('estado', 'activo')
    .gte('fecha_fin_estimada', dayStart)
    .lte('fecha_inicio', dayEnd);

  if (activeSessions) {
    if (esPrivado) {
      for (const s of activeSessions) {
        const sStart = new Date(s.fecha_inicio);
        const sEnd = new Date(s.fecha_fin_estimada);
        if (startDate < sEnd && endDate > sStart) {
          return {
            hasConflict: true,
            message: `El área privada tiene una sesión activa en ese horario (${s.cliente_nombre})`,
          };
        }
      }
    } else {
      const overlappingSessions = activeSessions.filter(s => {
        const sStart = new Date(s.fecha_inicio);
        const sEnd = new Date(s.fecha_fin_estimada);
        return startDate < sEnd && endDate > sStart;
      });
      const occupiedPax = overlappingSessions.reduce((sum, s) => sum + s.pax_count, 0);
      if (occupiedPax + paxCount > capacidadPax) {
        return {
          hasConflict: true,
          message: `Capacidad insuficiente: hay ${occupiedPax} personas activas y solo ${capacidadPax - occupiedPax} disponibles.`,
        };
      }
    }
  }

  return { hasConflict: false, message: '' };
}
