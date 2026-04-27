import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Download, Package, Loader2, ClipboardCheck } from 'lucide-react';
import { format, endOfDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useAuth } from '@/hooks/useAuth';

interface InsumoRow {
  id: string;
  nombre: string;
  unidad_medida: string;
  stock_actual: number;
  costo_unitario: number;
  presentacion: string;
  cantidad_por_presentacion: number;
  costo_presentacion: number;
  categoria: string;
}

interface InsumoValuado {
  nombre: string;
  categoria: string;
  stockUnidades: number;
  stockPresentacion: number;
  presentacion: string;
  unidad_medida: string;
  costoUnitario: number;
  valuacion: number;
}

interface MermaRow {
  id: string;
  cantidad: number;
  motivo: string;
  fecha: string;
  usuario_id: string;
  insumos: { nombre: string; unidad_medida: string } | null;
  usuario_nombre?: string;
}

export default function InventarioTab() {
  const { user } = useAuth();
  const [fecha, setFecha] = useState<Date>(new Date());
  const [insumos, setInsumos] = useState<InsumoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [ajustes, setAjustes] = useState<Map<string, number>>(new Map());

  // Audit state
  const [stockFisico, setStockFisico] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Mermas state
  const [mermas, setMermas] = useState<MermaRow[]>([]);
  const [mermasLoading, setMermasLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [fecha]);

  useEffect(() => {
    fetchMermas();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: insumosData } = await supabase.from('insumos')
      .select('id, nombre, unidad_medida, stock_actual, costo_unitario, presentacion, cantidad_por_presentacion, costo_presentacion, categoria')
      .order('nombre');

    setInsumos(insumosData ?? []);

    if (isToday(fecha)) {
      setAjustes(new Map());
      setLoading(false);
      return;
    }

    const desde = format(endOfDay(fecha), 'yyyy-MM-dd') + 'T23:59:59-06:00';
    const ajusteMap = new Map<string, number>();
    // Convención: ajuste positivo = SUMAR al stock actual para reconstruir el pasado
    // (es decir, consumos/salidas posteriores a la fecha). Ajuste negativo = ingresos posteriores.

    // 1) VENTAS completadas posteriores → consumos según receta (SUMAR)
    const { data: ventasIds } = await supabase
      .from('ventas')
      .select('id')
      .eq('estado', 'completada')
      .gt('fecha', desde);

    const productoCantidad = new Map<string, number>(); // producto_id → cantidad total consumida

    if (ventasIds && ventasIds.length > 0) {
      const ids = ventasIds.map(v => v.id);
      const allDetalles: { producto_id: string | null; paquete_id: string | null; cantidad: number }[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const { data } = await supabase
          .from('detalle_ventas')
          .select('producto_id, paquete_id, cantidad')
          .in('venta_id', batch);
        if (data) allDetalles.push(...data);
      }

      // Productos directos
      for (const d of allDetalles) {
        if (d.producto_id) {
          productoCantidad.set(d.producto_id, (productoCantidad.get(d.producto_id) ?? 0) + d.cantidad);
        }
      }

      // Expandir paquetes → componentes
      const paqueteIds = [...new Set(allDetalles.filter(d => d.paquete_id).map(d => d.paquete_id!))];
      if (paqueteIds.length > 0) {
        const { data: componentes } = await supabase
          .from('paquete_componentes')
          .select('paquete_id, producto_id, cantidad')
          .in('paquete_id', paqueteIds);
        if (componentes) {
          for (const d of allDetalles) {
            if (!d.paquete_id) continue;
            const comps = componentes.filter(c => c.paquete_id === d.paquete_id);
            for (const c of comps) {
              productoCantidad.set(c.producto_id, (productoCantidad.get(c.producto_id) ?? 0) + c.cantidad * d.cantidad);
            }
          }
        }
      }
    }

    // 2) UPSELLS de coworking posteriores → consumos por producto (SUMAR)
    const { data: upsellsData } = await supabase
      .from('coworking_session_upsells')
      .select('producto_id, cantidad, created_at')
      .gt('created_at', desde);

    if (upsellsData) {
      for (const u of upsellsData) {
        if (!u.producto_id) continue;
        productoCantidad.set(u.producto_id, (productoCantidad.get(u.producto_id) ?? 0) + (u.cantidad ?? 0));
      }
    }

    // 3) Resolver recetas para todos los productos consumidos (ventas + upsells)
    const productoIdsAll = [...productoCantidad.keys()];
    if (productoIdsAll.length > 0) {
      const { data: recetas } = await supabase
        .from('recetas')
        .select('producto_id, insumo_id, cantidad_necesaria')
        .in('producto_id', productoIdsAll);

      if (recetas) {
        for (const r of recetas) {
          const cantProd = productoCantidad.get(r.producto_id) ?? 0;
          const consumed = r.cantidad_necesaria * cantProd;
          if (consumed > 0) {
            ajusteMap.set(r.insumo_id, (ajusteMap.get(r.insumo_id) ?? 0) + consumed);
          }
        }
      }
    }

    // 4) MERMAS posteriores → salidas (SUMAR)
    const { data: mermasData } = await supabase
      .from('mermas')
      .select('insumo_id, cantidad')
      .gt('fecha', desde);

    if (mermasData) {
      for (const m of mermasData) {
        ajusteMap.set(m.insumo_id, (ajusteMap.get(m.insumo_id) ?? 0) + m.cantidad);
      }
    }

    // 5) COMPRAS posteriores → ingresos (RESTAR). cantidad_unidades ya viene en unidad base.
    const { data: comprasData } = await supabase
      .from('compras_insumos')
      .select('insumo_id, cantidad_unidades')
      .gt('fecha', desde);

    if (comprasData) {
      for (const c of comprasData) {
        ajusteMap.set(c.insumo_id, (ajusteMap.get(c.insumo_id) ?? 0) - (c.cantidad_unidades ?? 0));
      }
    }

    // 6) AJUSTES de auditoría posteriores → revertir según signo
    //    diferencia_stock > 0: ingresó stock → RESTAR (para regresar al pasado, quitarlo)
    //    diferencia_stock < 0: salió stock → SUMAR (la merma asociada ya se contó en (4),
    //                          así que NO sumamos otra vez para evitar doble conteo)
    const { data: auditEntries } = await supabase
      .from('audit_logs')
      .select('metadata')
      .eq('accion', 'ajuste_inventario')
      .gt('created_at', desde);

    if (auditEntries) {
      for (const entry of auditEntries) {
        const meta = entry.metadata as Record<string, unknown> | null;
        if (meta && meta.insumo_id && typeof meta.diferencia_stock === 'number') {
          const insumoId = meta.insumo_id as string;
          const diff = meta.diferencia_stock as number;
          if (diff > 0) {
            // ingreso por auditoría → revertir restando
            ajusteMap.set(insumoId, (ajusteMap.get(insumoId) ?? 0) - diff);
          }
          // diff < 0 ya cubierto por la merma generada automáticamente
        }
      }
    }

    setAjustes(ajusteMap);
    setLoading(false);
  };

  const fetchMermas = async () => {
    setMermasLoading(true);
    const { data: rawMermas } = await supabase
      .from('mermas')
      .select('id, cantidad, motivo, fecha, usuario_id, insumos(nombre, unidad_medida)')
      .order('fecha', { ascending: false })
      .limit(200);

    const rows = (rawMermas ?? []) as MermaRow[];
    const userIds = [...new Set(rows.map(r => r.usuario_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nombre')
        .in('id', userIds);
      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.nombre]));
      rows.forEach(r => { r.usuario_nombre = profileMap[r.usuario_id] ?? '—'; });
    }
    setMermas(rows);
    setMermasLoading(false);
  };

  const rows = useMemo<InsumoValuado[]>(() => {
    return insumos.map(ins => {
      const ajuste = ajustes.get(ins.id) ?? 0;
      const stockUnidades = Math.max(0, ins.stock_actual + ajuste);
      const stockPres = ins.cantidad_por_presentacion > 0
        ? stockUnidades / ins.cantidad_por_presentacion
        : stockUnidades;

      return {
        nombre: ins.nombre,
        categoria: ins.categoria,
        stockUnidades,
        stockPresentacion: Math.round(stockPres * 100) / 100,
        presentacion: ins.presentacion,
        unidad_medida: ins.unidad_medida,
        costoUnitario: ins.costo_unitario,
        valuacion: Math.round(stockUnidades * ins.costo_unitario * 100) / 100,
      };
    });
  }, [insumos, ajustes]);

  const totalValuacion = useMemo(() => rows.reduce((s, r) => s + r.valuacion, 0), [rows]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const fechaStr = format(fecha, 'dd_MMM_yyyy', { locale: es });

      // Sheet 1: Inventario
      const wsData = rows.map(r => ({
        'Insumo': r.nombre,
        'Categoría': r.categoria,
        'Existencia (Presentación)': r.stockPresentacion,
        'Presentación': r.presentacion,
        'Stock (Unidades)': Math.round(r.stockUnidades * 100) / 100,
        'Unidad': r.unidad_medida,
        'Costo Unitario': r.costoUnitario,
        'Valuación Total': r.valuacion,
      }));

      wsData.push({
        'Insumo': 'TOTAL',
        'Categoría': '',
        'Existencia (Presentación)': 0,
        'Presentación': '',
        'Stock (Unidades)': 0,
        'Unidad': '',
        'Costo Unitario': 0,
        'Valuación Total': totalValuacion,
      });

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Inventario');
      XLSX.writeFile(wb, `Inventario_CocoCacao_${fechaStr}.xlsx`);
      toast.success('Archivo Excel exportado');
    } catch {
      toast.error('Error al exportar');
    }
    setExporting(false);
  };

  const handleSaveAudit = async () => {
    if (!user) return;
    const entries = insumos
      .filter(ins => {
        const val = stockFisico[ins.id];
        if (val === undefined || val === '') return false;
        const fisico = parseFloat(val);
        return !isNaN(fisico) && fisico !== ins.stock_actual;
      })
      .map(ins => ({
        insumo: ins,
        fisico: parseFloat(stockFisico[ins.id]),
        diferencia: parseFloat(stockFisico[ins.id]) - ins.stock_actual,
      }));

    if (entries.length === 0) {
      toast.info('No hay diferencias para guardar');
      return;
    }

    setSaving(true);
    let errores = 0;

    for (const e of entries) {
      // If negative difference, create merma
      if (e.diferencia < 0) {
        const { error: mermaErr } = await supabase.from('mermas').insert({
          insumo_id: e.insumo.id,
          cantidad: Math.abs(e.diferencia),
          motivo: 'Ajuste por auditoría física',
          usuario_id: user.id,
        });
        if (mermaErr) { errores++; continue; }
      }

      // Log the adjustment
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        accion: 'ajuste_inventario',
        descripcion: `Auditoría física: ${e.insumo.nombre} de ${e.insumo.stock_actual} a ${e.fisico} (dif: ${e.diferencia > 0 ? '+' : ''}${Math.round(e.diferencia * 100) / 100})`,
        metadata: {
          insumo_id: e.insumo.id,
          stock_anterior: e.insumo.stock_actual,
          stock_nuevo: e.fisico,
          diferencia_stock: e.diferencia,
        },
      });

      // Update stock
      const { error: updateErr } = await supabase
        .from('insumos')
        .update({ stock_actual: e.fisico })
        .eq('id', e.insumo.id);
      if (updateErr) errores++;
    }

    setSaving(false);
    setStockFisico({});

    if (errores > 0) {
      toast.error(`Auditoría guardada con ${errores} error(es). Verifica permisos.`);
    } else {
      toast.success(`Auditoría guardada: ${entries.length} insumo(s) ajustados`);
    }

    fetchData();
    fetchMermas();
  };

  const fmtMoney = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const hasAuditChanges = insumos.some(ins => {
    const val = stockFisico[ins.id];
    if (val === undefined || val === '') return false;
    const fisico = parseFloat(val);
    return !isNaN(fisico) && fisico !== ins.stock_actual;
  });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">Ver inventario a la fecha:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !fecha && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(fecha, 'PPP', { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fecha}
                onSelect={(d) => d && setFecha(d)}
                disabled={(d) => d > new Date()}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <Button onClick={handleExport} disabled={exporting || loading} variant="outline" className="gap-2">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar Inventario a Excel
        </Button>
      </div>

      {/* KPI */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center gap-4 py-5">
          <div className="p-3 rounded-lg bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Valuación Total del Inventario</p>
            <p className="text-2xl font-bold text-foreground">
              {loading ? '...' : fmtMoney(totalValuacion)}
            </p>
            {!isToday(fecha) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Estimación al {format(fecha, 'PPP', { locale: es })}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audit Tool */}
      <Card className="border-border/60">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Auditoría de Inventario (Teórico vs. Físico)
          </CardTitle>
          <Button
            onClick={handleSaveAudit}
            disabled={saving || loading || !hasAuditChanges}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Guardar Auditoría
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Cargando insumos…</span>
            </div>
          ) : insumos.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No hay insumos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Stock Teórico</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right w-[140px]">Stock Físico</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insumos.map(ins => {
                    const val = stockFisico[ins.id] ?? '';
                    const fisico = val !== '' ? parseFloat(val) : null;
                    const diff = fisico !== null && !isNaN(fisico) ? fisico - ins.stock_actual : null;

                    return (
                      <TableRow key={ins.id}>
                        <TableCell className="font-medium">{ins.nombre}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(ins.stock_actual * 100) / 100}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{ins.unidad_medida}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="—"
                            className="w-[120px] text-right ml-auto"
                            value={val}
                            onChange={(e) =>
                              setStockFisico(prev => ({ ...prev, [ins.id]: e.target.value }))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {diff !== null && diff !== 0 ? (
                            <span className={diff < 0 ? 'text-destructive' : 'text-green-600'}>
                              {diff > 0 ? '+' : ''}{Math.round(diff * 100) / 100}
                            </span>
                          ) : diff === 0 ? (
                            <span className="text-muted-foreground">0</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mermas History */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Historial de Mermas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {mermasLoading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Cargando mermas…</span>
            </div>
          ) : mermas.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sin mermas registradas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Registrado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mermas.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                    </TableCell>
                    <TableCell className="font-medium">{m.insumos?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      -{m.cantidad} {m.insumos?.unidad_medida}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{m.motivo}</TableCell>
                    <TableCell className="text-muted-foreground">{m.usuario_nombre ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
