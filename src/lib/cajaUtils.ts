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

export interface CajaResumenResult {
  turnos: CajaTurnoResumen[];
  truncated: boolean;
}

// Límites explícitos para evitar el tope implícito de 1000 de PostgREST
// y para detectar volúmenes anómalos en el reporte.
const CAJAS_LIMIT = 500;
const MOVS_LIMIT = 5000;
const VENTAS_LIMIT = 5000;

/** CDMX date range for consistent filtering */
export function cdmxRange(desde: Date, hasta: Date) {
  return {
    desdeISO: format(desde, 'yyyy-MM-dd') + 'T00:00:00-06:00',
    hastaISO: format(hasta, 'yyyy-MM-dd') + 'T23:59:59-06:00',
  };
}

/**
 * Fetch all caja data for a date range with computed reconciliation.
 *
 * Filtra turnos por SOLAPE con [desde, hasta] (no solo por fecha_apertura),
 * para incluir turnos que cruzan el límite del rango (p.ej. abiertos el último
 * día del mes anterior y cerrados el primer día del rango).
 */
export async function fetchCajaResumen(
  desde: Date,
  hasta: Date,
  signal?: AbortSignal,
): Promise<CajaResumenResult> {
  const { desdeISO, hastaISO } = cdmxRange(desde, hasta);
  let truncated = false;

  // Solape: el turno aparece si abrió antes del fin del rango AND
  // (sigue abierto OR cerró después del inicio del rango).
  let cajasQuery = supabase
    .from('cajas')
    .select('*')
    .lte('fecha_apertura', hastaISO)
    .or(`fecha_cierre.gte.${desdeISO},fecha_cierre.is.null`)
    .order('fecha_apertura', { ascending: false })
    .limit(CAJAS_LIMIT);
  if (signal) cajasQuery = cajasQuery.abortSignal(signal);

  const { data: cajasRaw, error: cajasErr } = await cajasQuery;
  if (signal?.aborted) return { turnos: [], truncated: false };
  if (cajasErr) throw cajasErr;

  const cajas = (cajasRaw ?? []) as unknown as CajaRow[];
  if (cajas.length >= CAJAS_LIMIT) truncated = true;
  if (cajas.length === 0) return { turnos: [], truncated };

  const cajaIds = cajas.map(c => c.id);
  const userIds = [...new Set(cajas.map(c => c.usuario_id))];

  // Parallel fetches: movimientos, profiles
  let movsQ = supabase
    .from('movimientos_caja')
    .select('*')
    .in('caja_id', cajaIds)
    .order('created_at', { ascending: true })
    .limit(MOVS_LIMIT);
  let profilesQ = supabase.from('profiles').select('id, nombre').in('id', userIds);
  if (signal) {
    movsQ = movsQ.abortSignal(signal);
    profilesQ = profilesQ.abortSignal(signal);
  }

  const [movsRes, profilesRes] = await Promise.all([movsQ, profilesQ]);
  if (signal?.aborted) return { turnos: [], truncated };
  if (movsRes.error) throw movsRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const movimientos = (movsRes.data ?? []) as unknown as MovimientoRow[];
  if (movimientos.length >= MOVS_LIMIT) truncated = true;

  const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p.nombre]));

  // For each caja, get ventas efectivo during its shift.
  // (N+1 conocido — pendiente refactor con query agregada única.)
  const results: CajaTurnoResumen[] = [];

  for (const caja of cajas) {
    if (signal?.aborted) return { turnos: [], truncated };
    const fechaFin = caja.fecha_cierre ?? new Date().toISOString();

    let ventasQ = supabase
      .from('ventas')
      .select('monto_efectivo')
      .eq('estado', 'completada' as any)
      .gte('fecha', caja.fecha_apertura)
      .lte('fecha', fechaFin)
      .limit(VENTAS_LIMIT);
    if (signal) ventasQ = ventasQ.abortSignal(signal);

    const { data: ventasData, error: ventasErr } = await ventasQ;
    if (signal?.aborted) return { turnos: [], truncated };
    if (ventasErr) throw ventasErr;

    if ((ventasData?.length ?? 0) >= VENTAS_LIMIT) truncated = true;

    const ventasEfectivo = (ventasData ?? []).reduce((s, v) => s + (v.monto_efectivo ?? 0), 0);
    const cajaMovs = movimientos.filter(m => m.caja_id === caja.id);
    const entradas = cajaMovs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.monto, 0);
    const salidas = cajaMovs.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0);
    const esperado = caja.monto_apertura + ventasEfectivo + entradas - salidas;

    // Profiles de usuarios que aparecen solo en movimientos
    const movUserIds = [...new Set(cajaMovs.map(m => m.usuario_id))].filter(id => !profileMap.has(id));
    if (movUserIds.length > 0) {
      let extraQ = supabase.from('profiles').select('id, nombre').in('id', movUserIds);
      if (signal) extraQ = extraQ.abortSignal(signal);
      const { data: extra } = await extraQ;
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

  return { turnos: results, truncated };
}

/** Get profile name from a pre-built map */
export function getProfileName(profileMap: Map<string, string>, userId: string): string {
  return profileMap.get(userId) ?? 'Desconocido';
}
