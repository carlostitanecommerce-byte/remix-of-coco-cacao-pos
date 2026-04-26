import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Users, DollarSign, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, format, getDay, getHours, eachDayOfInterval, subWeeks, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HORAS_RETAIL = Array.from({ length: 18 }, (_, i) => i + 6);
const HORAS_COWORK = Array.from({ length: 13 }, (_, i) => i + 8);

interface CellData {
  total: number;
  count: number;
}

interface CoworkCell {
  personas: number;
}

type HeatmapData = Record<string, CellData>;
type CoworkHeatmap = Record<string, CoworkCell>;

export default function VentasTab() {
  const [periodo, setPeriodo] = useState<'semana' | 'mes'>('semana');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingCowork, setLoadingCowork] = useState(false);
  const [heatmap, setHeatmap] = useState<HeatmapData>({});
  const [coworkMap, setCoworkMap] = useState<CoworkHeatmap>({});
  const [totalCapacidad, setTotalCapacidad] = useState(0);
  const [periodoTotal, setPeriodoTotal] = useState(0);
  const [periodoTransacciones, setPeriodoTransacciones] = useState(0);

  const handleSetPeriodo = (p: 'semana' | 'mes') => {
    setPeriodo(p);
    setOffset(0);
  };

  const rango = useMemo(() => {
    const now = new Date();
    const base = periodo === 'semana' ? subWeeks(now, offset) : subMonths(now, offset);
    if (periodo === 'semana') {
      return { desde: startOfWeek(base, { weekStartsOn: 1 }), hasta: endOfWeek(base, { weekStartsOn: 1 }) };
    }
    return { desde: startOfMonth(base), hasta: endOfMonth(base) };
  }, [periodo, offset]);

  useEffect(() => {
    const ac = new AbortController();
    fetchRetailData(ac.signal);
    fetchCoworkData(ac.signal);
    return () => ac.abort();
  }, [rango]);

  // ── Retail Heatmap + KPIs (single source: ventas.total_neto) ──
  const fetchRetailData = async (signal?: AbortSignal) => {
    setLoading(true);
    const desdeISO = format(rango.desde, 'yyyy-MM-dd') + 'T00:00:00-06:00';
    const hastaISO = format(rango.hasta, 'yyyy-MM-dd') + 'T23:59:59-06:00';

    const { data: ventas } = await supabase
      .from('ventas')
      .select('id, fecha, total_neto')
      .eq('estado', 'completada')
      .gte('fecha', desdeISO)
      .lte('fecha', hastaISO);

    if (signal?.aborted) return;

    if (!ventas || ventas.length === 0) {
      setHeatmap({});
      setPeriodoTotal(0);
      setPeriodoTransacciones(0);
      setLoading(false);
      return;
    }

    const map: HeatmapData = {};
    let total = 0;

    ventas.forEach(v => {
      const fecha = new Date(v.fecha);
      const jsDay = getDay(fecha);
      const diaIdx = jsDay === 0 ? 6 : jsDay - 1;
      const hora = getHours(fecha);
      const key = `${diaIdx}-${hora}`;
      if (!map[key]) map[key] = { total: 0, count: 0 };
      map[key].total += Number(v.total_neto);
      map[key].count += 1;
      total += Number(v.total_neto);
    });

    setHeatmap(map);
    setPeriodoTotal(total);
    setPeriodoTransacciones(ventas.length);
    setLoading(false);
  };

  // ── Coworking Occupancy Heatmap ──
  const fetchCoworkData = async () => {
    setLoadingCowork(true);
    const desdeISO = format(rango.desde, 'yyyy-MM-dd') + 'T00:00:00-06:00';
    const hastaISO = format(rango.hasta, 'yyyy-MM-dd') + 'T23:59:59-06:00';

    const [sessionsRes, areasRes] = await Promise.all([
      supabase
        .from('coworking_sessions')
        .select('fecha_inicio, fecha_fin_estimada, fecha_salida_real, estado, pax_count')
        .in('estado', ['activo', 'finalizado', 'pendiente_pago'])
        .lte('fecha_inicio', hastaISO)
        .or(`fecha_salida_real.gte.${desdeISO},fecha_salida_real.is.null`),
      supabase
        .from('areas_coworking')
        .select('capacidad_pax'),
    ]);

    const sessions = sessionsRes.data ?? [];
    const areas = areasRes.data ?? [];
    const cap = areas.reduce((s, a) => s + a.capacidad_pax, 0);
    setTotalCapacidad(cap);

    // For each day-hour slot in range, count pax of overlapping sessions
    const map: CoworkHeatmap = {};
    const days = eachDayOfInterval({ start: rango.desde, end: rango.hasta });

    days.forEach(day => {
      const jsDay = getDay(day);
      const diaIdx = jsDay === 0 ? 6 : jsDay - 1;

      HORAS_COWORK.forEach(hora => {
        const slotStart = new Date(day);
        slotStart.setHours(hora, 0, 0, 0);
        const slotEnd = new Date(day);
        slotEnd.setHours(hora, 59, 59, 999);

        let personas = 0;
        sessions.forEach(s => {
          const inicio = new Date(s.fecha_inicio);
          const fin = s.fecha_salida_real
            ? new Date(s.fecha_salida_real)
            : new Date(s.fecha_fin_estimada);
          // Session overlaps slot if inicio < slotEnd AND fin > slotStart
          if (inicio <= slotEnd && fin >= slotStart) {
            personas += s.pax_count;
          }
        });

        const key = `${diaIdx}-${hora}`;
        if (!map[key]) map[key] = { personas: 0 };
        map[key].personas += personas;
      });
    });

    // If monthly, average by number of occurrences of each weekday
    if (periodo === 'mes') {
      const dayCount: Record<number, number> = {};
      days.forEach(day => {
        const jsDay = getDay(day);
        const diaIdx = jsDay === 0 ? 6 : jsDay - 1;
        dayCount[diaIdx] = (dayCount[diaIdx] || 0) + 1;
      });
      Object.entries(map).forEach(([key, cell]) => {
        const diaIdx = parseInt(key.split('-')[0]);
        const count = dayCount[diaIdx] || 1;
        cell.personas = Math.round(cell.personas / count);
      });
    }

    setCoworkMap(map);
    setLoadingCowork(false);
  };

  // ── Retail color helpers ──
  const maxTotal = useMemo(() => {
    const vals = Object.values(heatmap).map(c => c.total);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [heatmap]);

  const getRetailColor = (total: number) => {
    if (total === 0) return 'hsl(30 20% 95%)';
    const intensity = Math.min(total / maxTotal, 1);
    const l = 90 - intensity * 65;
    const s = 20 + intensity * 45;
    return `hsl(25 ${s}% ${l}%)`;
  };

  const getRetailTextColor = (total: number) => {
    if (total === 0) return 'hsl(25 10% 60%)';
    const intensity = Math.min(total / maxTotal, 1);
    return intensity > 0.5 ? 'hsl(30 25% 95%)' : 'hsl(25 30% 20%)';
  };

  // ── Cowork color helpers (teal/green scale) ──
  const maxPersonas = useMemo(() => {
    const vals = Object.values(coworkMap).map(c => c.personas);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [coworkMap]);

  const getCoworkColor = (personas: number) => {
    if (personas === 0) return 'hsl(160 15% 95%)';
    const intensity = Math.min(personas / maxPersonas, 1);
    // Light teal → Deep forest green
    const l = 90 - intensity * 60;
    const s = 20 + intensity * 50;
    return `hsl(155 ${s}% ${l}%)`;
  };

  const getCoworkTextColor = (personas: number) => {
    if (personas === 0) return 'hsl(155 10% 60%)';
    const intensity = Math.min(personas / maxPersonas, 1);
    return intensity > 0.5 ? 'hsl(160 20% 95%)' : 'hsl(155 30% 20%)';
  };

  const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  const fmtHora = (hora: number) => hora > 12 ? `${hora - 12} PM` : hora === 12 ? '12 PM' : `${hora} AM`;
  const fmtHoraFull = (hora: number) => hora > 12 ? `${hora - 12}:00 PM` : hora === 12 ? '12:00 PM' : `${hora}:00 AM`;

  const periodoLabel = periodo === 'semana'
    ? `${format(rango.desde, 'd MMM', { locale: es })} – ${format(rango.hasta, 'd MMM yyyy', { locale: es })}`
    : format(rango.desde, 'MMMM yyyy', { locale: es });

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="rounded-lg p-2.5 bg-primary/10 text-primary shrink-0">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Ventas del Día</p>
              {loadingKpis ? (
                <Loader2 className="h-4 w-4 animate-spin mt-1 text-muted-foreground" />
              ) : (
                <p className="text-lg font-bold text-primary truncate">{fmt(ventasDia)}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="rounded-lg p-2.5 bg-accent/10 text-accent shrink-0">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Ventas del Mes</p>
              {loadingKpis ? (
                <Loader2 className="h-4 w-4 animate-spin mt-1 text-muted-foreground" />
              ) : (
                <p className="text-lg font-bold text-accent truncate">{fmt(ventasMes)}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-heading font-bold text-foreground">Mapa de Calor — Chocolatería</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <Button
              variant={periodo === 'semana' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none text-xs h-8"
              onClick={() => handleSetPeriodo('semana')}
            >
              Semana
            </Button>
            <Button
              variant={periodo === 'mes' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none text-xs h-8"
              onClick={() => handleSetPeriodo('mes')}
            >
              Mes
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setOffset(o => o + 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground capitalize min-w-[120px] text-center">{periodoLabel}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={offset === 0} onClick={() => setOffset(o => o - 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {offset !== 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setOffset(0)}>
                Hoy
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Retail Heatmap */}
      <Card className="border-border/60">
        <CardContent className="pt-6 pb-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-16">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando datos…
            </div>
          ) : (
            <TooltipProvider delayDuration={100}>
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  <div className="grid gap-1" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                    <div />
                    {DIAS.map(d => (
                      <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  {HORAS_RETAIL.map(hora => (
                    <div key={hora} className="grid gap-1 mt-1" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                      <div className="text-xs text-muted-foreground flex items-center justify-end pr-2 tabular-nums">
                        {fmtHora(hora)}
                      </div>
                      {DIAS.map((dia, diaIdx) => {
                        const key = `${diaIdx}-${hora}`;
                        const cell = heatmap[key] || { total: 0, count: 0 };
                        return (
                          <Tooltip key={key}>
                            <TooltipTrigger asChild>
                              <div
                                className="rounded-sm aspect-[2/1] min-h-[28px] flex items-center justify-center cursor-default transition-all hover:ring-2 hover:ring-ring/30"
                                style={{ backgroundColor: getRetailColor(cell.total), color: getRetailTextColor(cell.total) }}
                              >
                                {cell.total > 0 && (
                                  <span className="text-[10px] font-medium leading-none">
                                    {cell.total >= 1000 ? `$${(cell.total / 1000).toFixed(1)}k` : `$${Math.round(cell.total)}`}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <p className="font-semibold">{dia}, {fmtHoraFull(hora)}</p>
                              <p>Ventas Totales: {fmt(cell.total)}</p>
                              <p># Transacciones: {cell.count}</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ))}
                  <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border/40">
                    <span className="text-[10px] text-muted-foreground">Menos</span>
                    {[0, 0.2, 0.4, 0.6, 0.8, 1].map(i => (
                      <div key={i} className="w-5 h-3 rounded-sm" style={{ backgroundColor: getRetailColor(i * (maxTotal || 1)) }} />
                    ))}
                    <span className="text-[10px] text-muted-foreground">Más</span>
                  </div>
                </div>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* ── Coworking Occupancy Heatmap ── */}
      <div className="pt-4">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-heading font-bold text-foreground">Ocupación de Coworking (Flujo de Personas)</h2>
            <p className="text-sm text-muted-foreground">
              {periodo === 'mes' ? 'Promedio diario del mes' : 'Personas simultáneas por hora'}
              {totalCapacidad > 0 && ` · Capacidad total: ${totalCapacidad} pax`}
            </p>
          </div>
        </div>

        <Card className="border-border/60">
          <CardContent className="pt-6 pb-4">
            {loadingCowork ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-16">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando datos…
              </div>
            ) : (
              <TooltipProvider delayDuration={100}>
                <div className="overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid gap-1" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                      <div />
                      {DIAS.map(d => (
                        <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                      ))}
                    </div>
                    {HORAS_COWORK.map(hora => (
                      <div key={hora} className="grid gap-1 mt-1" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                        <div className="text-xs text-muted-foreground flex items-center justify-end pr-2 tabular-nums">
                          {fmtHora(hora)}
                        </div>
                        {DIAS.map((dia, diaIdx) => {
                          const key = `${diaIdx}-${hora}`;
                          const cell = coworkMap[key] || { personas: 0 };
                          const pct = totalCapacidad > 0 ? Math.round((cell.personas / totalCapacidad) * 100) : 0;
                          return (
                            <Tooltip key={key}>
                              <TooltipTrigger asChild>
                                <div
                                  className="rounded-sm aspect-[2/1] min-h-[28px] flex items-center justify-center cursor-default transition-all hover:ring-2 hover:ring-ring/30"
                                  style={{ backgroundColor: getCoworkColor(cell.personas), color: getCoworkTextColor(cell.personas) }}
                                >
                                  {cell.personas > 0 && (
                                    <span className="text-[10px] font-medium leading-none">
                                      {cell.personas}
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-semibold">{dia}, {fmtHoraFull(hora)}</p>
                                <p>Personas en sitio: {cell.personas}</p>
                                <p>% Ocupación: {pct}%</p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    ))}
                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border/40">
                      <span className="text-[10px] text-muted-foreground">Vacío</span>
                      {[0, 0.2, 0.4, 0.6, 0.8, 1].map(i => (
                        <div key={i} className="w-5 h-3 rounded-sm" style={{ backgroundColor: getCoworkColor(i * (maxPersonas || 1)) }} />
                      ))}
                      <span className="text-[10px] text-muted-foreground">Lleno</span>
                    </div>
                  </div>
                </div>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
