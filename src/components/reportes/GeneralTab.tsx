import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Download, FileSpreadsheet, Loader2, Receipt, CreditCard, TrendingUp, Wallet } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { fetchCajaResumen } from '@/lib/cajaUtils';

interface VentaRow {
  id: string;
  folio: number;
  fecha: string;
  total_bruto: number;
  total_neto: number;
  iva: number;
  comisiones_bancarias: number;
  metodo_pago: string;
  estado: string;
  coworking_session_id: string | null;
  monto_propina: number;
  monto_tarjeta: number;
  monto_efectivo: number;
  monto_transferencia: number;
}

interface DetalleRow {
  id: string;
  venta_id: string;
  producto_id: string | null;
  descripcion: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  tipo_concepto: string;
  coworking_session_id: string | null;
}

interface ProductoMap {
  [id: string]: { nombre: string; categoria: string };
}

interface RecetaRow {
  producto_id: string;
  insumo_id: string;
  cantidad_necesaria: number;
}

interface InsumoMap {
  [id: string]: { nombre: string; categoria: string; unidad_medida: string; costo_unitario: number };
}

interface ProductoFull {
  id: string;
  nombre: string;
  categoria: string;
  tipo: string;
}

interface PaqueteComponente {
  paquete_id: string;
  producto_id: string;
  cantidad: number;
}

interface ConfigVentas {
  ivaPorcentaje: number;        // ej. 16
  comisionPorcentaje: number;   // ej. 3.5
}

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const metodoPagoLabel: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

export default function GeneralTab() {
  const [desde, setDesde] = useState<Date>(startOfMonth(new Date()));
  const [hasta, setHasta] = useState<Date>(endOfMonth(new Date()));
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [detalles, setDetalles] = useState<DetalleRow[]>([]);
  const [productos, setProductos] = useState<ProductoMap>({});
  const [recetas, setRecetas] = useState<RecetaRow[]>([]);
  const [insumos, setInsumos] = useState<InsumoMap>({});
  const [loading, setLoading] = useState(false);
  const [exportingSales, setExportingSales] = useState(false);
  const [exportingCOGS, setExportingCOGS] = useState(false);
  const [exportingCaja, setExportingCaja] = useState(false);

  const [paqueteComponentes, setPaqueteComponentes] = useState<PaqueteComponente[]>([]);
  const [config, setConfig] = useState<ConfigVentas>({ ivaPorcentaje: 16, comisionPorcentaje: 0 });

  useEffect(() => {
    fetchData();
  }, [desde, hasta]);

  const fetchData = async () => {
    setLoading(true);
    const desdeISO = format(desde, 'yyyy-MM-dd') + 'T00:00:00-06:00';
    const hastaISO = format(hasta, 'yyyy-MM-dd') + 'T23:59:59-06:00';

    const [ventasRes, productosRes, recetasRes, insumosRes, paqueteRes, configRes] = await Promise.all([
      supabase
        .from('ventas')
        .select('id, folio, fecha, total_bruto, total_neto, iva, comisiones_bancarias, metodo_pago, estado, coworking_session_id, monto_propina, monto_tarjeta, monto_efectivo, monto_transferencia')
        .gte('fecha', desdeISO)
        .lte('fecha', hastaISO)
        .eq('estado', 'completada'),
      // L1: incluir paquetes también, para no perder su nombre/categoría en exportación
      supabase.from('productos').select('id, nombre, categoria, tipo'),
      supabase.from('recetas').select('producto_id, insumo_id, cantidad_necesaria'),
      supabase.from('insumos').select('id, nombre, categoria, unidad_medida, costo_unitario'),
      supabase.from('paquete_componentes').select('paquete_id, producto_id, cantidad'),
      supabase.from('configuracion_ventas').select('clave, valor'),
    ]);

    const ventasData = ventasRes.data ?? [];
    setVentas(ventasData);

    const pMap: ProductoMap = {};
    (productosRes.data ?? []).forEach((p: ProductoFull) => {
      pMap[p.id] = { nombre: p.nombre, categoria: p.categoria };
    });
    setProductos(pMap);
    setRecetas(recetasRes.data ?? []);
    setPaqueteComponentes(paqueteRes.data ?? []);

    const iMap: InsumoMap = {};
    (insumosRes.data ?? []).forEach(i => { iMap[i.id] = { nombre: i.nombre, categoria: i.categoria, unidad_medida: i.unidad_medida, costo_unitario: i.costo_unitario }; });
    setInsumos(iMap);

    // L1: cargar IVA y comisión dinámicas desde configuracion_ventas
    const cfgRows = configRes.data ?? [];
    const ivaRow = cfgRows.find(r => r.clave === 'iva_porcentaje');
    const comRow = cfgRows.find(r => r.clave === 'comision_bancaria_porcentaje');
    setConfig({
      ivaPorcentaje: ivaRow ? Number(ivaRow.valor) : 16,
      comisionPorcentaje: comRow ? Number(comRow.valor) : 0,
    });

    if (ventasData.length > 0) {
      const ventaIds = ventasData.map(v => v.id);
      const allDetalles: DetalleRow[] = [];
      for (let i = 0; i < ventaIds.length; i += 100) {
        const batch = ventaIds.slice(i, i + 100);
        const { data } = await supabase
          .from('detalle_ventas')
          .select('id, venta_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, tipo_concepto, coworking_session_id, paquete_id')
          .in('venta_id', batch);
        if (data) allDetalles.push(...data);
      }
      setDetalles(allDetalles as DetalleRow[]);
    } else {
      setDetalles([]);
    }

    setLoading(false);
  };

  // L1: índice O(1) de recetas por producto (también usado para expansión de paquetes)
  const recetasPorProducto = useMemo(() => {
    const map: Record<string, RecetaRow[]> = {};
    recetas.forEach(r => {
      (map[r.producto_id] ||= []).push(r);
    });
    return map;
  }, [recetas]);

  // L1: índice de componentes por paquete
  const componentesPorPaquete = useMemo(() => {
    const map: Record<string, PaqueteComponente[]> = {};
    paqueteComponentes.forEach(c => {
      (map[c.paquete_id] ||= []).push(c);
    });
    return map;
  }, [paqueteComponentes]);

  // L1: dado un detalle (producto simple o paquete) devuelve costo total real de insumos
  const costoInsumosDeDetalle = (d: DetalleRow): number => {
    let costo = 0;
    const acumulaProducto = (productoId: string, factor: number) => {
      const recs = recetasPorProducto[productoId] || [];
      recs.forEach(r => {
        const ins = insumos[r.insumo_id];
        if (ins) costo += r.cantidad_necesaria * factor * ins.costo_unitario;
      });
    };
    if (d.paquete_id) {
      const comps = componentesPorPaquete[d.paquete_id] || [];
      comps.forEach(c => acumulaProducto(c.producto_id, c.cantidad * d.cantidad));
    } else if (d.producto_id) {
      acumulaProducto(d.producto_id, d.cantidad);
    }
    return costo;
  };

    // Utilidad = ingreso gravable - IVA - comisiones - COGS (propinas are non-taxable pass-through)
    const utilidad = ingresoGravable - ivaTotal - comisionesTotal - costoInsumos;
    return { ingresoGravable, totalPropinas, ivaTotal, comisionesTotal, costoInsumos, utilidad };
  }, [ventas, detalles, recetas, insumos]);

  const fileNameSuffix = () => {
    const m1 = MESES[desde.getMonth()];
    const y1 = desde.getFullYear();
    const m2 = MESES[hasta.getMonth()];
    const y2 = hasta.getFullYear();
    return m1 === m2 && y1 === y2 ? `${m1}_${y1}` : `${m1}${y1}_${m2}${y2}`;
  };

  const exportVentas = async () => {
    setExportingSales(true);
    try {
      const ventasPropinaMostrada = new Set<string>();

      const rows = detalles.map(d => {
        const venta = ventas.find(v => v.id === d.venta_id);
        if (!venta) return null;

        const totalLinea = d.subtotal;
        const subtSinIVA = +(totalLinea / 1.16).toFixed(2);
        const ivaLinea = +(totalLinea - subtSinIVA).toFixed(2);

        let concepto = d.descripcion || '';
        let categoria = '';
        if (d.producto_id && productos[d.producto_id]) {
          concepto = productos[d.producto_id].nombre;
          categoria = productos[d.producto_id].categoria;
        } else if (d.tipo_concepto === 'coworking') {
          concepto = d.descripcion || 'Servicio Coworking';
          categoria = 'Coworking';
        } else if (d.tipo_concepto === 'amenity') {
          concepto = d.descripcion || 'Amenidad';
          categoria = 'Amenidades';
        }

        // Comisión bancaria: 3.5% sobre porción tarjeta
        let comisionLinea = 0;
        if (venta.metodo_pago === 'tarjeta') {
          comisionLinea = +(totalLinea * 0.035).toFixed(2);
        } else if (venta.metodo_pago === 'mixto' && venta.total_neto > 0) {
          const ratioTarjeta = venta.monto_tarjeta / venta.total_neto;
          comisionLinea = +(totalLinea * ratioTarjeta * 0.035).toFixed(2);
        }

        // Propina: solo en la primera línea de cada venta
        let propina = 0;
        if (!ventasPropinaMostrada.has(venta.id)) {
          propina = venta.monto_propina || 0;
          ventasPropinaMostrada.add(venta.id);
        }

        return {
          'Fecha y Hora': format(new Date(venta.fecha), 'dd/MM/yyyy HH:mm', { locale: es }),
          'Folio del Ticket': `#${String(venta.folio).padStart(4, '0')}`,
          'Concepto': concepto,
          'Categoría': categoria,
          'Cantidad': d.cantidad,
          'Precio Unitario': d.precio_unitario,
          'Subtotal': subtSinIVA,
          'IVA (16%)': ivaLinea,
          'Comisión Bancaria': comisionLinea,
          'Total': totalLinea,
          'Propina': propina,
          'Método de Pago': metodoPagoLabel[venta.metodo_pago] || venta.metodo_pago,
          'Monto Efectivo': venta.monto_efectivo,
          'Monto Tarjeta': venta.monto_tarjeta,
          'Monto Transferencia': venta.monto_transferencia,
        };
      }).filter(Boolean);

      const ws = XLSX.utils.json_to_sheet(rows);
      // Column widths
      ws['!cols'] = [
        { wch: 18 }, { wch: 12 }, { wch: 30 }, { wch: 16 },
        { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
        { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
      XLSX.writeFile(wb, `Ventas_CocoCacao_${fileNameSuffix()}.xlsx`);
      toast.success('Archivo de ventas exportado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar ventas');
    }
    setExportingSales(false);
  };

  const exportCOGS = async () => {
    setExportingCOGS(true);
    try {
      // Aggregate consumed quantities per insumo from sold products
      const consumoMap: Record<string, number> = {};

      detalles.forEach(d => {
        if (!d.producto_id) return;
        const recetasProducto = recetas.filter(r => r.producto_id === d.producto_id);
        recetasProducto.forEach(r => {
          consumoMap[r.insumo_id] = (consumoMap[r.insumo_id] || 0) + r.cantidad_necesaria * d.cantidad;
        });
      });

      const rows = Object.entries(consumoMap).map(([insumoId, cantidadGastada]) => {
        const ins = insumos[insumoId];
        if (!ins) return null;
        const costoTotal = +(cantidadGastada * ins.costo_unitario).toFixed(2);
        return {
          'Insumo': ins.nombre,
          'Categoría': ins.categoria,
          'Cantidad Gastada': +cantidadGastada.toFixed(4),
          'Unidad de Medida': ins.unidad_medida,
          'Costo Unitario': ins.costo_unitario,
          'Costo Total': costoTotal,
        };
      }).filter(Boolean);

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'COGS');
      XLSX.writeFile(wb, `COGS_CocoCacao_${fileNameSuffix()}.xlsx`);
      toast.success('Archivo COGS exportado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar COGS');
    }
    setExportingCOGS(false);
  };

  const exportCajaGlobal = async () => {
    setExportingCaja(true);
    try {
      const { turnos: turnosData } = await fetchCajaResumen(desde, hasta);
      if (turnosData.length === 0) {
        toast.warning('No hay turnos de caja en el periodo seleccionado');
        setExportingCaja(false);
        return;
      }

      const rows = turnosData.map(t => ({
        'Fecha Apertura': format(new Date(t.caja.fecha_apertura), 'dd/MM/yyyy HH:mm', { locale: es }),
        'Fecha Cierre': t.caja.fecha_cierre ? format(new Date(t.caja.fecha_cierre), 'dd/MM/yyyy HH:mm', { locale: es }) : 'Abierto',
        'Folio Turno': `#${String(t.caja.folio).padStart(4, '0')}`,
        'Usuario': t.nombreUsuario,
        'Estado': t.caja.estado === 'abierta' ? 'Activo' : 'Cerrado',
        'Apertura': t.caja.monto_apertura,
        'Ventas Efectivo': t.ventasEfectivo,
        'Entradas': t.entradas,
        'Salidas': t.salidas,
        'Esperado': t.esperado,
        'Real': t.caja.monto_cierre ?? '',
        'Diferencia': t.caja.diferencia ?? '',
        'Notas de Cierre': (t.caja as any).notas_cierre ?? '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 20 }, { wch: 10 },
        { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte Caja');
      XLSX.writeFile(wb, `ReporteCaja_CocoCacao_${fileNameSuffix()}.xlsx`);
      toast.success('Reporte de caja exportado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar reporte de caja');
    }
    setExportingCaja(false);
  };

  const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  return (
    <div className="space-y-6">
      {/* Date Range */}
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <DatePicker label="Desde" date={desde} onChange={setDesde} />
            <DatePicker label="Hasta" date={hasta} onChange={setHasta} />
            <Badge variant="outline" className="h-9 px-3 text-xs">
              {ventas.length} ventas en periodo
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando datos…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard icon={Receipt} label="Ingreso Gravable" value={fmt(kpis.ingresoGravable)} />
          <KPICard icon={Receipt} label="Ingreso Bruto Total" value={fmt(kpis.ingresoGravable + kpis.totalPropinas)} />
          <KPICard icon={Receipt} label="IVA Acumulado" value={fmt(kpis.ivaTotal)} />
          <KPICard icon={CreditCard} label="Propinas (No Gravable)" value={fmt(kpis.totalPropinas)} />
          <KPICard icon={TrendingUp} label="Utilidad Estimada" value={fmt(kpis.utilidad)} accent />
        </div>
      )}

      {/* Export Buttons */}
      <div className="flex flex-wrap gap-4">
        <Button onClick={exportVentas} disabled={exportingSales || ventas.length === 0} className="gap-2">
          {exportingSales ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Exportar Ventas para Contabilidad
        </Button>
        <Button variant="outline" onClick={exportCOGS} disabled={exportingCOGS || ventas.length === 0} className="gap-2">
          {exportingCOGS ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar Movimientos de Inventario (COGS)
        </Button>
        <Button variant="outline" onClick={exportCajaGlobal} disabled={exportingCaja} className="gap-2">
          {exportingCaja ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Exportar Reporte de Caja Global
        </Button>
      </div>
    </div>
  );
}

function DatePicker({ label, date, onChange }: { label: string; date: Date; onChange: (d: Date) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('w-[180px] justify-start text-left font-normal', !date && 'text-muted-foreground')}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(date, 'dd MMM yyyy', { locale: es })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={d => d && onChange(d)}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: boolean }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="pt-5 pb-4 flex items-center gap-4">
        <div className={cn('rounded-lg p-2.5 shrink-0', accent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn('text-lg font-bold truncate', accent && 'text-primary')}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
