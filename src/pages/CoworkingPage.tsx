import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Building2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCoworkingData } from '@/components/coworking/useCoworkingData';
import { CheckInDialog } from '@/components/coworking/CheckInDialog';
import { CheckoutDialog } from '@/components/coworking/CheckoutDialog';
import { CancelSessionDialog } from '@/components/coworking/CancelSessionDialog';
import { ManageSessionAccountDialog } from '@/components/coworking/ManageSessionAccountDialog';
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
  const [sessionToManageAccount, setSessionToManageAccount] = useState<CoworkingSession | null>(null);
  const isAdmin = roles.includes('administrador');

  const METODO_LABELS: Record<string, string> = {
    hora_cerrada: 'Hora cerrada',
    '30_min': 'Bloques de 30 min',
    '15_min': 'Bloques de 15 min',
    minuto_exacto: 'Minuto exacto',
  };

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

    const paxMultiplier = area.es_privado ? 1 : session.pax_count;

    // Snapshot inmutable: reglas congeladas al check-in
    const snapshot = session.tarifa_snapshot ?? null;
    const tolerancia = snapshot?.minutos_tolerancia ?? 0;
    const metodo = snapshot?.metodo_fraccion ?? '15_min';
    const precioBase = snapshot?.precio_base ?? area.precio_por_hora;
    const metodoLabel = METODO_LABELS[metodo] ?? metodo;

    const minCobrar = tiempoExcedidoMin - tolerancia;

    let bloquesExtra = 0;
    let cargoExtraUnidad = 0; // antes de paxMultiplier

    if (minCobrar > 0) {
      switch (metodo) {
        case '15_min':
          bloquesExtra = Math.ceil(minCobrar / 15);
          cargoExtraUnidad = bloquesExtra * (precioBase / 4);
          break;
        case '30_min':
          bloquesExtra = Math.ceil(minCobrar / 30);
          cargoExtraUnidad = bloquesExtra * (precioBase / 2);
          break;
        case 'hora_cerrada':
          bloquesExtra = Math.ceil(minCobrar / 60);
          cargoExtraUnidad = bloquesExtra * precioBase;
          break;
        case 'minuto_exacto':
          bloquesExtra = Math.ceil(minCobrar);
          cargoExtraUnidad = minCobrar * (precioBase / 60);
          break;
        default:
          bloquesExtra = Math.ceil(minCobrar / 15);
          cargoExtraUnidad = bloquesExtra * (precioBase / 4);
      }
    }

    const cargoExtra = cargoExtraUnidad * paxMultiplier;
    const subtotalContratado = (tiempoContratadoMin / 60) * precioBase * paxMultiplier;

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
      metodoFraccion: metodo,
      metodoFraccionLabel: metodoLabel,
      toleranciaMin: tolerancia,
      minCobrar: Math.max(0, minCobrar),
      precioBaseSnapshot: precioBase,
      paxMultiplier,
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
            onManageAccount={setSessionToManageAccount}
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
      <ManageSessionAccountDialog session={sessionToManageAccount} onClose={() => setSessionToManageAccount(null)} onSuccess={data.fetchData} />
    </div>
  );
};

export default CoworkingPage;
