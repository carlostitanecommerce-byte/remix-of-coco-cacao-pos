import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Users, Clock, Plus, Ban } from 'lucide-react';
import type { CartItem } from './types';
import { CancelSessionDialog } from '@/components/coworking/CancelSessionDialog';
import type { CoworkingSession } from '@/components/coworking/types';
import { useAuth } from '@/hooks/useAuth';

interface ActiveSession {
  id: string;
  cliente_nombre: string;
  area_id: string;
  area_nombre: string;
  pax_count: number;
  fecha_inicio: string;
  fecha_fin_estimada: string;
  fecha_salida_real: string | null;
  es_privado: boolean;
  upsell_producto_id: string | null;
  upsell_precio: number | null;
  tarifa_id: string | null;
}

interface TarifaMatch {
  id: string;
  nombre: string;
  precio_base: number;
  tipo_cobro: string;
  amenities: { producto_id: string; nombre: string; cantidad_incluida: number }[];
  upsells: { producto_id: string; nombre: string; precio_especial: number; precio_original: number }[];
}

interface Props {
  onImportSession: (items: CartItem[], sessionId: string, clienteNombre: string) => void;
  importedSessionId?: string;
  pendingSessionId?: string | null;
  onPendingConsumed?: () => void;
}

export function CoworkingSessionSelector({ onImportSession, importedSessionId, pendingSessionId, onPendingConsumed }: Props) {
  const { roles } = useAuth();
  const isAdmin = roles.includes('administrador');
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionToCancel, setSessionToCancel] = useState<CoworkingSession | null>(null);
  const [fraccion15, setFraccion15] = useState(true);

  const fetchSessions = async () => {
    const { data: sessData } = await supabase
      .from('coworking_sessions')
      .select('id, cliente_nombre, area_id, pax_count, fecha_inicio, fecha_fin_estimada, upsell_producto_id, upsell_precio, tarifa_id, usuario_id, estado, monto_acumulado, fecha_salida_real')
      .eq('estado', 'pendiente_pago');

    if (!sessData || sessData.length === 0) { setSessions([]); setLoading(false); return; }

    const areaIds = [...new Set(sessData.map(s => s.area_id))];
    const { data: areasData } = await supabase
      .from('areas_coworking')
      .select('id, nombre_area, es_privado')
      .in('id', areaIds);

    const areaMap = new Map(areasData?.map(a => [a.id, a]) ?? []);

    setSessions(sessData.map(s => {
      const area = areaMap.get(s.area_id);
      return {
        ...s,
        area_nombre: area?.nombre_area ?? 'Desconocida',
        es_privado: area?.es_privado ?? false,
        fecha_salida_real: s.fecha_salida_real ?? null,
        upsell_producto_id: s.upsell_producto_id ?? null,
        upsell_precio: s.upsell_precio ?? null,
        tarifa_id: s.tarifa_id ?? null,
      };
    }));
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();
    // Load fraccion config
    supabase
      .from('configuracion_ventas')
      .select('valor')
      .eq('clave', 'cobro_fraccion_15min')
      .single()
      .then(({ data: cfg }) => setFraccion15(cfg?.valor === 1));
  }, []);

  // Auto-import pending session from coworking checkout redirect
  useEffect(() => {
    if (pendingSessionId && !loading && sessions.length > 0) {
      const session = sessions.find(s => s.id === pendingSessionId);
      if (session) {
        handleSelect(session);
        onPendingConsumed?.();
      }
    }
  }, [pendingSessionId, loading, sessions]);

  const handleSelect = async (session: ActiveSession) => {
    // Fetch frozen checkout time from DB to ensure consistency with coworking checkout
    let endRef = session.fecha_salida_real;
    if (!endRef) {
      const { data: fresh } = await supabase
        .from('coworking_sessions')
        .select('fecha_salida_real')
        .eq('id', session.id)
        .single();
      endRef = fresh?.fecha_salida_real ?? new Date().toISOString();
    }

    // Find applicable tarifa for this area
    const { data: tarifas } = await supabase
      .from('tarifas_coworking')
      .select('id, nombre, precio_base, tipo_cobro, areas_aplicables')
      .eq('activo', true);

    const tarifa = tarifas?.find(t =>
      (t.areas_aplicables as string[])?.includes(session.area_id)
    );

    if (!tarifa) {
      // Fallback: just add coworking time with area price
      const { data: area } = await supabase
        .from('areas_coworking')
        .select('precio_por_hora')
        .eq('id', session.area_id)
        .single();

      const mins = calcMinutes(session.fecha_inicio, session.fecha_fin_estimada);
      const extraMins = calcExtraMinutesFrozen(session.fecha_fin_estimada, endRef);
      const hours = mins / 60;
      const pricePerHour = area?.precio_por_hora ?? 0;
      const baseCharge = session.es_privado
        ? pricePerHour * hours
        : pricePerHour * session.pax_count * hours;

      const items: CartItem[] = [{
        producto_id: `coworking-${session.id}`,
        nombre: `Coworking: ${session.area_nombre} (${formatDuration(mins)})`,
        precio_unitario: Math.round(baseCharge * 100) / 100,
        cantidad: 1,
        subtotal: Math.round(baseCharge * 100) / 100,
        tipo_concepto: 'coworking',
        coworking_session_id: session.id,
        descripcion: `${session.cliente_nombre} - ${session.area_nombre}`,
      }];

      if (extraMins > 0) {
        if (fraccion15) {
          const blocks = Math.ceil(extraMins / 15);
          const extraRate = (pricePerHour / 4) * (session.es_privado ? 1 : session.pax_count);
          const extraCharge = blocks * extraRate;
          items.push({
            producto_id: `coworking-extra-${session.id}`,
            nombre: `Tiempo excedido (${blocks} bloques x 15min)`,
            precio_unitario: Math.round(extraCharge * 100) / 100,
            cantidad: 1,
            subtotal: Math.round(extraCharge * 100) / 100,
            tipo_concepto: 'coworking',
            coworking_session_id: session.id,
            descripcion: 'Cargo por tiempo excedido',
          });
        } else {
          const extraRate = (pricePerHour / 60) * (session.es_privado ? 1 : session.pax_count);
          const extraCharge = extraMins * extraRate;
          items.push({
            producto_id: `coworking-extra-${session.id}`,
            nombre: `Tiempo excedido (${extraMins} min prorrateado)`,
            precio_unitario: Math.round(extraCharge * 100) / 100,
            cantidad: 1,
            subtotal: Math.round(extraCharge * 100) / 100,
            tipo_concepto: 'coworking',
            coworking_session_id: session.id,
            descripcion: 'Cargo por tiempo excedido',
          });
        }
      }

      onImportSession(items, session.id, session.cliente_nombre);
      return;
    }

    // Fetch amenities and upsells for this tarifa
    const [amenitiesRes, upsellsRes] = await Promise.all([
      supabase
        .from('tarifa_amenities_incluidos')
        .select('producto_id, cantidad_incluida, productos:producto_id(nombre)')
        .eq('tarifa_id', tarifa.id),
      supabase
        .from('tarifa_upsells')
        .select('producto_id, precio_especial, productos:producto_id(nombre, precio_venta)')
        .eq('tarifa_id', tarifa.id),
    ]);

    // Calculate time — frozen at checkout moment
    const mins = calcMinutes(session.fecha_inicio, session.fecha_fin_estimada);
    const extraMins = calcExtraMinutesFrozen(session.fecha_fin_estimada, endRef);
    const hours = mins / 60;

    // Base charge
    let baseCharge = tarifa.precio_base;
    if (tarifa.tipo_cobro === 'hora') {
      baseCharge = session.es_privado
        ? tarifa.precio_base * hours
        : tarifa.precio_base * session.pax_count * hours;
    } else if (tarifa.tipo_cobro === 'dia' || tarifa.tipo_cobro === 'mes') {
      baseCharge = session.es_privado
        ? tarifa.precio_base
        : tarifa.precio_base * session.pax_count;
    }

    const items: CartItem[] = [{
      producto_id: `coworking-${session.id}`,
      nombre: `${tarifa.nombre}: ${session.area_nombre} (${formatDuration(mins)})`,
      precio_unitario: Math.round(baseCharge * 100) / 100,
      cantidad: 1,
      subtotal: Math.round(baseCharge * 100) / 100,
      tipo_concepto: 'coworking',
      coworking_session_id: session.id,
      descripcion: `${session.cliente_nombre} - Tarifa: ${tarifa.nombre}`,
    }];

    // Extra time
    if (extraMins > 0 && tarifa.tipo_cobro === 'hora') {
      if (fraccion15) {
        const blocks = Math.ceil(extraMins / 15);
        const extraRate = (tarifa.precio_base / 4) * (session.es_privado ? 1 : session.pax_count);
        const extraCharge = blocks * extraRate;
        items.push({
          producto_id: `coworking-extra-${session.id}`,
          nombre: `Tiempo excedido (${blocks} bloques x 15min)`,
          precio_unitario: Math.round(extraCharge * 100) / 100,
          cantidad: 1,
          subtotal: Math.round(extraCharge * 100) / 100,
          tipo_concepto: 'coworking',
          coworking_session_id: session.id,
          descripcion: 'Cargo por tiempo excedido',
        });
      } else {
        const extraRate = (tarifa.precio_base / 60) * (session.es_privado ? 1 : session.pax_count);
        const extraCharge = extraMins * extraRate;
        items.push({
          producto_id: `coworking-extra-${session.id}`,
          nombre: `Tiempo excedido (${extraMins} min prorrateado)`,
          precio_unitario: Math.round(extraCharge * 100) / 100,
          cantidad: 1,
          subtotal: Math.round(extraCharge * 100) / 100,
          tipo_concepto: 'coworking',
          coworking_session_id: session.id,
          descripcion: 'Cargo por tiempo excedido',
        });
      }
    }

    // Fetch all session items (amenities + upsells + consumos) from junction table
    const { data: sessionUpsells } = await supabase
      .from('coworking_session_upsells')
      .select('producto_id, precio_especial, cantidad, productos:producto_id(nombre)')
      .eq('session_id', session.id);

    for (const u of (sessionUpsells ?? [])) {
      const prodName = (u as any).productos?.nombre ?? 'Producto';
      const isAmenity = u.precio_especial === 0;
      items.push({
        producto_id: u.producto_id,
        nombre: isAmenity ? `🎁 ${prodName} (incluido)` : `☕ ${prodName} (precio especial)`,
        precio_unitario: u.precio_especial,
        cantidad: u.cantidad,
        subtotal: u.precio_especial * u.cantidad,
        tipo_concepto: isAmenity ? 'amenity' : 'producto',
        coworking_session_id: session.id,
        descripcion: isAmenity ? `Amenity incluido en ${tarifa.nombre}` : `Upsell/consumo coworking`,
      });
    }

    onImportSession(items, session.id, session.cliente_nombre);
  };

  const filtered = sessions.filter(s =>
    s.cliente_nombre.toLowerCase().includes(search.toLowerCase()) ||
    s.area_nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Sesiones Pendientes de Pago
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar sesión..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin sesiones pendientes de pago</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filtered.map(s => {
              const isImported = importedSessionId === s.id;
              const elapsed = calcMinutes(s.fecha_inicio, s.fecha_salida_real ?? new Date().toISOString());
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between p-2 rounded-md border text-sm ${isImported ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{s.cliente_nombre}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{s.area_nombre}</span>
                      <Badge variant="outline" className="text-[10px] px-1 h-4">
                        {s.pax_count} pax
                      </Badge>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(elapsed)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => setSessionToCancel({
                        id: s.id,
                        cliente_nombre: s.cliente_nombre,
                        area_id: s.area_id,
                        pax_count: s.pax_count,
                        usuario_id: (s as any).usuario_id ?? '',
                        fecha_inicio: s.fecha_inicio,
                        fecha_fin_estimada: s.fecha_fin_estimada,
                        fecha_salida_real: (s as any).fecha_salida_real ?? null,
                        estado: (s as any).estado ?? 'pendiente_pago',
                        monto_acumulado: (s as any).monto_acumulado ?? 0,
                        tarifa_id: s.tarifa_id,
                        upsell_producto_id: s.upsell_producto_id,
                        upsell_precio: s.upsell_precio,
                      })}
                      title="Cancelar sesión"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant={isImported ? 'secondary' : 'default'}
                      className="h-7 text-xs"
                      disabled={isImported}
                      onClick={() => handleSelect(s)}
                    >
                      {isImported ? 'Importado' : <><Plus className="h-3 w-3 mr-1" /> Cobrar</>}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CancelSessionDialog
        session={sessionToCancel}
        isAdmin={isAdmin}
        onClose={() => setSessionToCancel(null)}
        onSuccess={fetchSessions}
      />
    </Card>
  );
}

function calcMinutes(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function calcExtraMinutesFrozen(estimatedEnd: string, actualEnd: string): number {
  const actual = new Date(actualEnd).getTime();
  const end = new Date(estimatedEnd).getTime();
  return actual > end ? Math.round((actual - end) / 60000) : 0;
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
