import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Building2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCoworkingData } from '@/components/coworking/useCoworkingData';
import { CheckInDialog } from '@/components/coworking/CheckInDialog';
import { CheckoutDialog } from '@/components/coworking/CheckoutDialog';
import { CancelSessionDialog } from '@/components/coworking/CancelSessionDialog';
import { EditUpsellDialog } from '@/components/coworking/EditUpsellDialog';
import { AddConsumoDialog } from '@/components/coworking/AddConsumoDialog';
import { SolicitudesCancelacionSesionesPanel } from '@/components/coworking/SolicitudesCancelacionSesionesPanel';
import { OccupancyGrid } from '@/components/coworking/OccupancyGrid';
import { ActiveSessionsTable } from '@/components/coworking/ActiveSessionsTable';
import { ReservacionesTab } from '@/components/coworking/ReservacionesTab';
import { ConfiguracionTab } from '@/components/coworking/ConfiguracionTab';
import type { CoworkingSession, CheckoutSummary } from '@/components/coworking/types';

const CoworkingPage = () => {
  const { roles } = useAuth();
  const data = useCoworkingData();
  const [checkoutSummary, setCheckoutSummary] = useState<CheckoutSummary | null>(null);
  const [sessionToCancel, setSessionToCancel] = useState<CoworkingSession | null>(null);
  const [sessionToEditUpsell, setSessionToEditUpsell] = useState<CoworkingSession | null>(null);
  const [sessionToAddConsumo, setSessionToAddConsumo] = useState<CoworkingSession | null>(null);
  const [fraccion15, setFraccion15] = useState(true);
  const isAdmin = roles.includes('administrador');

  // Load fraccion config
  useEffect(() => {
    const fetch = async () => {
      const { data: cfg } = await supabase
        .from('configuracion_ventas')
        .select('valor')
        .eq('clave', 'cobro_fraccion_15min')
        .single();
      setFraccion15(cfg?.valor === 1);
    };
    fetch();
  }, []);

  const handleCheckOut = async (session: CoworkingSession) => {
    const area = data.areas.find(a => a.id === session.area_id);
    if (!area) return;

    // Freeze fecha_salida_real in DB if not already set
    if (!session.fecha_salida_real) {
      const ahora = new Date().toISOString();
      await supabase
        .from('coworking_sessions')
        .update({ fecha_salida_real: ahora })
        .eq('id', session.id);
      session = { ...session, fecha_salida_real: ahora };
    }

    const inicio = new Date(session.fecha_inicio);
    const finEstimada = new Date(session.fecha_fin_estimada);
    const salidaReal = new Date(session.fecha_salida_real!);

    const tiempoContratadoMin = (finEstimada.getTime() - inicio.getTime()) / 60000;
    const tiempoRealMin = (salidaReal.getTime() - inicio.getTime()) / 60000;
    const tiempoExcedidoMin = Math.max(0, tiempoRealMin - tiempoContratadoMin);

    let bloquesExtra = 0;
    let cargoExtra = 0;
    const paxMultiplier = area.es_privado ? 1 : session.pax_count;

    if (tiempoExcedidoMin > 0) {
      if (fraccion15) {
        bloquesExtra = Math.ceil(tiempoExcedidoMin / 15);
        cargoExtra = (bloquesExtra * 15 / 60) * area.precio_por_hora * paxMultiplier;
      } else {
        bloquesExtra = 0;
        cargoExtra = (tiempoExcedidoMin / 60) * area.precio_por_hora * paxMultiplier;
      }
    }

    const subtotalContratado = (tiempoContratadoMin / 60) * area.precio_por_hora * paxMultiplier;

    // Fetch all upsells from junction table
    const { data: upsellRows } = await supabase
      .from('coworking_session_upsells')
      .select('id, producto_id, precio_especial, cantidad, productos:producto_id(nombre)')
      .eq('session_id', session.id);

    const upsells = (upsellRows ?? []).map((u: any) => ({
      id: u.id,
      producto_id: u.producto_id,
      nombre: u.productos?.nombre ?? 'Upsell',
      precio_especial: u.precio_especial,
      cantidad: u.cantidad,
    }));

    const upsellsTotal = upsells.reduce((sum: number, u: any) => sum + u.precio_especial * u.cantidad, 0);
    const total = subtotalContratado + cargoExtra + upsellsTotal;

    setCheckoutSummary({
      session, area,
      tiempoContratadoMin, tiempoRealMin, tiempoExcedidoMin,
      bloquesExtra, subtotalContratado, cargoExtra, total,
      upsells,
      useFraccion15: fraccion15,
    });
  };

  if (data.loading) {
    return <div className="text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            Kúuchil Meyaj — Coworking
          </h1>
          <p className="text-muted-foreground mt-1">Ocupación en tiempo real y registro de entradas</p>
        </div>
        <CheckInDialog areas={data.areas} getOccupancy={data.getOccupancy} getAvailablePax={data.getAvailablePax} onSuccess={data.fetchData} />
      </div>

      <Tabs defaultValue="ocupacion">
        <TabsList>
          <TabsTrigger value="ocupacion">Ocupación</TabsTrigger>
          <TabsTrigger value="reservaciones">Reservaciones</TabsTrigger>
          {isAdmin && <TabsTrigger value="configuracion">Configuración</TabsTrigger>}
        </TabsList>

        <TabsContent value="ocupacion" className="space-y-6">
          <OccupancyGrid
            areas={data.areas}
            getOccupancy={data.getOccupancy}
            getAreaSessions={data.getAreaSessions}
            onCheckOut={handleCheckOut}
            onCancel={setSessionToCancel}
          />
          <ActiveSessionsTable
            sessions={data.sessions}
            areas={data.areas}
            onCheckOut={handleCheckOut}
            onCancel={setSessionToCancel}
            onEditUpsell={setSessionToEditUpsell}
            onAddConsumo={setSessionToAddConsumo}
            onPaxUpdated={data.fetchData}
          />
          {isAdmin && <SolicitudesCancelacionSesionesPanel onSessionCancelled={data.fetchData} />}
        </TabsContent>

        <TabsContent value="reservaciones">
          <ReservacionesTab areas={data.areas} reservaciones={data.reservaciones} getOccupancy={data.getOccupancy} getAvailablePax={data.getAvailablePax} onSuccess={data.fetchData} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="configuracion">
            <ConfiguracionTab areas={data.areas} />
          </TabsContent>
        )}
      </Tabs>

      <CheckoutDialog summary={checkoutSummary} onClose={() => setCheckoutSummary(null)} onSuccess={data.fetchData} />
      <CancelSessionDialog session={sessionToCancel} isAdmin={isAdmin} onClose={() => setSessionToCancel(null)} onSuccess={data.fetchData} />
      <EditUpsellDialog session={sessionToEditUpsell} onClose={() => setSessionToEditUpsell(null)} onSuccess={data.fetchData} />
      <AddConsumoDialog session={sessionToAddConsumo} onClose={() => setSessionToAddConsumo(null)} onSuccess={data.fetchData} />
    </div>
  );
};

export default CoworkingPage;
