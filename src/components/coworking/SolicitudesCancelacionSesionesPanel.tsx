import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { nowCDMX } from '@/lib/utils';

interface Solicitud {
  id: string;
  session_id: string;
  solicitante_id: string;
  motivo: string;
  estado: string;
  created_at: string;
  solicitante_nombre?: string;
  cliente_nombre?: string;
  area_nombre?: string;
  pax_count?: number;
}

interface Props {
  onSessionCancelled?: () => void | Promise<void>;
}

export function SolicitudesCancelacionSesionesPanel({ onSessionCancelled }: Props) {
  const { user, profile } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejecting, setRejecting] = useState<Solicitud | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchSolicitudes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('solicitudes_cancelacion_sesiones' as any)
      .select('*')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) {
      setSolicitudes([]);
      setLoading(false);
      return;
    }

    const items = data as any[];
    const sessionIds = [...new Set(items.map(s => s.session_id))];
    const solicitanteIds = [...new Set(items.map(s => s.solicitante_id))];

    const [sessionsRes, profilesRes] = await Promise.all([
      supabase.from('coworking_sessions').select('id, cliente_nombre, area_id, pax_count').in('id', sessionIds),
      supabase.from('profiles').select('id, nombre').in('id', solicitanteIds),
    ]);

    const sessionMap = new Map((sessionsRes.data ?? []).map(s => [s.id, s]));
    const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p.nombre]));

    // Fetch area names
    const areaIds = [...new Set((sessionsRes.data ?? []).map(s => s.area_id))];
    let areaMap = new Map<string, string>();
    if (areaIds.length > 0) {
      const { data: areasData } = await supabase.from('areas_coworking').select('id, nombre_area').in('id', areaIds);
      areaMap = new Map((areasData ?? []).map(a => [a.id, a.nombre_area]));
    }

    setSolicitudes(items.map(s => {
      const session = sessionMap.get(s.session_id);
      return {
        ...s,
        solicitante_nombre: profileMap.get(s.solicitante_id) ?? 'Desconocido',
        cliente_nombre: session?.cliente_nombre ?? 'Desconocido',
        area_nombre: session ? (areaMap.get(session.area_id) ?? 'Desconocida') : 'Desconocida',
        pax_count: session?.pax_count ?? 0,
      };
    }));
    setLoading(false);
  };

  useEffect(() => {
    fetchSolicitudes();

    const channel = supabase
      .channel('solicitudes_cancelacion_sesiones_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_cancelacion_sesiones' }, () => {
        fetchSolicitudes();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleApprove = async (solicitud: Solicitud) => {
    if (!user) return;
    setProcessing(true);
    try {
      // 1. Cancel the session
      const { error } = await supabase.from('coworking_sessions').update({
        estado: 'cancelado' as any,
        monto_acumulado: 0,
        fecha_salida_real: nowCDMX(),
      }).eq('id', solicitud.session_id);
      if (error) throw error;

      // 2. Update solicitud
      await supabase.from('solicitudes_cancelacion_sesiones' as any).update({
        estado: 'aprobada',
        revisado_por: user.id,
      }).eq('id', solicitud.id);

      // 3. Audit log
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        accion: 'aprobar_cancelacion_sesion',
        descripcion: `Cancelación de sesión aprobada por ${profile?.nombre ?? 'Admin'}. Cliente: ${solicitud.cliente_nombre}. Solicitante: ${solicitud.solicitante_nombre}`,
        metadata: {
          solicitud_id: solicitud.id,
          session_id: solicitud.session_id,
          motivo: solicitud.motivo,
        },
      });

      toast.success('Cancelación de sesión aprobada');
      fetchSolicitudes();
      await onSessionCancelled?.();
    } catch (err: any) {
      toast.error(err.message || 'Error al aprobar');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!user || !rejecting) return;
    setProcessing(true);
    try {
      await supabase.from('solicitudes_cancelacion_sesiones' as any).update({
        estado: 'rechazada',
        revisado_por: user.id,
        motivo_rechazo: motivoRechazo.trim() || null,
      }).eq('id', rejecting.id);

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        accion: 'rechazar_cancelacion_sesion',
        descripcion: `Cancelación de sesión rechazada por ${profile?.nombre ?? 'Admin'}. Cliente: ${rejecting.cliente_nombre}`,
        metadata: {
          solicitud_id: rejecting.id,
          session_id: rejecting.session_id,
          motivo_rechazo: motivoRechazo.trim(),
        },
      });

      toast.success('Solicitud rechazada');
      setRejecting(null);
      setMotivoRechazo('');
      fetchSolicitudes();
    } catch (err: any) {
      toast.error(err.message || 'Error al rechazar');
    } finally {
      setProcessing(false);
    }
  };

  if (solicitudes.length === 0 && !loading) return null;

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-destructive" />
            Solicitudes de Cancelación de Sesiones
            <Badge variant="destructive" className="ml-auto">{solicitudes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-2">Cargando...</p>
          ) : (
            solicitudes.map(s => (
              <div key={s.id} className="border rounded-md p-3 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1 text-sm flex-1">
                    <p className="font-medium">{s.cliente_nombre} · {s.pax_count} pax</p>
                    <p className="text-xs text-muted-foreground">Área: {s.area_nombre}</p>
                    <p className="text-xs text-muted-foreground">Solicitó: <span className="font-medium text-foreground">{s.solicitante_nombre}</span></p>
                    <p className="text-xs">Motivo: {s.motivo}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="text-primary border-primary/30" onClick={() => handleApprove(s)} disabled={processing}>
                      <CheckCircle2 className="h-4 w-4" />
                      Aprobar
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => setRejecting(s)} disabled={processing}>
                      <XCircle className="h-4 w-4" />
                      Rechazar
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejecting} onOpenChange={() => { if (!processing) { setRejecting(null); setMotivoRechazo(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rechazar Solicitud</DialogTitle>
            <DialogDescription>Opcionalmente indica el motivo del rechazo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo de rechazo (opcional)</Label>
            <Textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Motivo..." rows={2} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRejecting(null); setMotivoRechazo(''); }} disabled={processing}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing}>
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
