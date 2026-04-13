import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

/**
 * Shared Caja report utilities — single source of truth for cash reconciliation.
 *
 * Esperado = monto_apertura + ventas_efectivo + entradas - salidas
 */

export interface CajaRow {
  id: string;
  folio: number;
  usuario_id: string;
  monto_apertura: number;
  monto_cierre: number | null;
  estado: 'abierta' | 'cerrada';
  fecha_apertura: string;
  fecha_cierre: string | null;
  diferencia: number | null;
}

export interface MovimientoRow {
  id: string;
  caja_id: string;
  usuario_id: string;
  tipo: string;
  monto: number;
  motivo: string;
  created_at: string;
}

export interface CajaTurnoResumen {
  caja: CajaRow;
  nombreUsuario: string;
  ventasEfectivo: number;
  entradas: number;
  salidas: number;
  esperado: number;
  movimientos: MovimientoRow[];
}

/** CDMX date range for consistent filtering */
export function cdmxRange(desde: Date, hasta: Date) {
  return {
    desdeISO: format(desde, 'yyyy-MM-dd') + 'T00:00:00-06:00',
    hastaISO: format(hasta, 'yyyy-MM-dd') + 'T23:59:59-06:00',
  };
}

/** Fetch all caja data for a date range with computed reconciliation */
export async function fetchCajaResumen(desde: Date, hasta: Date): Promise<CajaTurnoResumen[]> {
  const { desdeISO, hastaISO } = cdmxRange(desde, hasta);

  // Fetch cajas in range
  const { data: cajasRaw } = await supabase
    .from('cajas')
    .select('*')
    .gte('fecha_apertura', desdeISO)
    .lte('fecha_apertura', hastaISO)
    .order('fecha_apertura', { ascending: false });

  const cajas = (cajasRaw ?? []) as unknown as CajaRow[];
  if (cajas.length === 0) return [];

  const cajaIds = cajas.map(c => c.id);
  const userIds = [...new Set(cajas.map(c => c.usuario_id))];

  // Parallel fetches: movimientos, ventas efectivo per caja, profiles
  const [movsRes, profilesRes] = await Promise.all([
    supabase
      .from('movimientos_caja')
      .select('*')
      .in('caja_id', cajaIds)
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('id, nombre').in('id', userIds),
  ]);

  const movimientos = (movsRes.data ?? []) as unknown as MovimientoRow[];
  const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p.nombre]));

  // For each caja, get ventas efectivo during its shift
  const results: CajaTurnoResumen[] = [];

  for (const caja of cajas) {
    const fechaFin = caja.fecha_cierre ?? new Date().toISOString();

    const { data: ventasData } = await supabase
      .from('ventas')
      .select('monto_efectivo')
      .eq('estado', 'completada' as any)
      .gte('fecha', caja.fecha_apertura)
      .lte('fecha', fechaFin);

    const ventasEfectivo = (ventasData ?? []).reduce((s, v) => s + (v.monto_efectivo ?? 0), 0);
    const cajaMovs = movimientos.filter(m => m.caja_id === caja.id);
    const entradas = cajaMovs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.monto, 0);
    const salidas = cajaMovs.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0);
    const esperado = caja.monto_apertura + ventasEfectivo + entradas - salidas;

    // Also fetch mov user profiles
    const movUserIds = [...new Set(cajaMovs.map(m => m.usuario_id))].filter(id => !profileMap.has(id));
    if (movUserIds.length > 0) {
      const { data: extra } = await supabase.from('profiles').select('id, nombre').in('id', movUserIds);
      (extra ?? []).forEach(p => profileMap.set(p.id, p.nombre));
    }

    results.push({
      caja,
      nombreUsuario: profileMap.get(caja.usuario_id) ?? 'Desconocido',
      ventasEfectivo,
      entradas,
      salidas,
      esperado,
      movimientos: cajaMovs,
    });
  }

  // Ensure profile map is populated for movimiento users too
  return results;
}

/** Get profile name from a pre-built map */
export function getProfileName(profileMap: Map<string, string>, userId: string): string {
  return profileMap.get(userId) ?? 'Desconocido';
}
