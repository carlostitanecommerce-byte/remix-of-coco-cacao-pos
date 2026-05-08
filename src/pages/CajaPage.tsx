import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { useCajaSession } from '@/hooks/useCajaSession';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, Unlock } from 'lucide-react';
import { AperturaCajaDialog } from '@/components/pos/AperturaCajaDialog';
import { CierreCajaDialog } from '@/components/pos/CierreCajaDialog';
import { MovimientosCajaPanel } from '@/components/pos/MovimientosCajaPanel';
import { VentasTurnoPanel } from '@/components/pos/VentasTurnoPanel';
import { SolicitudesCancelacionPanel } from '@/components/pos/SolicitudesCancelacionPanel';
import { CoworkingSessionSelector } from '@/components/pos/CoworkingSessionSelector';
import type { CartItem } from '@/components/pos/types';

const CajaPage = () => {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const { cajaAbierta, loading, movimientos, abrirCaja, registrarMovimiento, cerrarCaja } = useCajaSession();
  const [cierreOpen, setCierreOpen] = useState(false);

  const isAdmin = roles.includes('administrador');
  const isSupervisor = roles.includes('supervisor');

  const handleImportSession = (items: CartItem[], sessionId: string, clienteNombre: string) => {
    sessionStorage.setItem('pos_pending_import', JSON.stringify({ items, sessionId, clienteNombre }));
    navigate('/pos');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {cajaAbierta ? <Unlock className="h-5 w-5 text-primary" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
              Control de Caja
            </span>
            {cajaAbierta ? (
              <Badge variant="outline" className="text-primary border-primary">Abierta</Badge>
            ) : (
              <Badge variant="secondary">Cerrada</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cajaAbierta ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Apertura:</span>{' '}
                  {format(new Date(cajaAbierta.fecha_apertura), "d 'de' MMMM, HH:mm", { locale: es })}
                </p>
                <p><span className="text-muted-foreground">Fondo fijo:</span>{' '}
                  <span className="font-semibold">${cajaAbierta.monto_apertura.toFixed(2)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <MovimientosCajaPanel movimientos={movimientos} onRegistrar={registrarMovimiento} />
                <Button variant="destructive" onClick={() => setCierreOpen(true)}>
                  Cerrar Caja
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay caja abierta. Abre la caja para iniciar operaciones.</p>
          )}
        </CardContent>
      </Card>

      {cajaAbierta && (
        <CoworkingSessionSelector onImportSession={handleImportSession} />
      )}

      {(isAdmin || isSupervisor) && <SolicitudesCancelacionPanel />}

      <VentasTurnoPanel isAdmin={isAdmin} />

      <AperturaCajaDialog
        open={!cajaAbierta}
        onAbrirCaja={abrirCaja}
        onClose={() => navigate('/')}
      />

      {cajaAbierta && (
        <CierreCajaDialog
          open={cierreOpen}
          onClose={() => setCierreOpen(false)}
          caja={cajaAbierta}
          movimientos={movimientos}
          onCerrarCaja={cerrarCaja}
        />
      )}
    </div>
  );
};

export default CajaPage;
