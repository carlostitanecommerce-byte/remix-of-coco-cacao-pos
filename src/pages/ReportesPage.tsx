import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, ScrollText } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import GeneralTab from '@/components/reportes/GeneralTab';
import VentasTab from '@/components/reportes/VentasTab';
import MenuTab from '@/components/reportes/MenuTab';
import CajaTab from '@/components/reportes/CajaTab';
import InventarioTab from '@/components/reportes/InventarioTab';

interface AuditLog {
  id: string;
  user_id: string;
  accion: string;
  descripcion: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user_nombre?: string;
}

const ReportesPage = () => {
  const { roles } = useAuth();
  const isAdmin = roles.includes('administrador');
  const isSupervisor = roles.includes('supervisor');

  if (!isAdmin && !isSupervisor) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          Reportes
        </h1>
        <p className="text-muted-foreground mt-1">Análisis y registros del sistema</p>
      </div>

      <Tabs defaultValue="ventas">
        <TabsList>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="menu">Menú</TabsTrigger>
          <TabsTrigger value="caja">Caja</TabsTrigger>
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
          {isAdmin && <TabsTrigger value="general">Exportación Contable</TabsTrigger>}
          {isAdmin && <TabsTrigger value="bitacora">Bitácora de Actividad</TabsTrigger>}
        </TabsList>

        <TabsContent value="ventas" className="mt-6">
          <VentasTab />
        </TabsContent>

        <TabsContent value="menu" className="mt-6">
          <MenuTab />
        </TabsContent>

        <TabsContent value="caja" className="mt-6">
          <CajaTab />
        </TabsContent>

        <TabsContent value="inventario" className="mt-6">
          <InventarioTab />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="general" className="mt-6">
            <GeneralTab />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="bitacora" className="mt-6">
            <BitacoraSection />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

const BitacoraSection = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);

      const { data: logsData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (logsData && logsData.length > 0) {
        // Fetch profile names for user_ids
        const userIds = [...new Set(logsData.map((l) => l.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nombre')
          .in('id', userIds);

        const profileMap = new Map(
          (profiles ?? []).map((p) => [p.id, p.nombre])
        );

        setLogs(
          logsData.map((l) => ({
            ...l,
            metadata: l.metadata as Record<string, unknown> | null,
            user_nombre: profileMap.get(l.user_id) || 'Desconocido',
          }))
        );
      } else {
        setLogs([]);
      }

      setLoading(false);
    };

    fetchLogs();
  }, []);

  const accionLabels: Record<string, string> = {
    inicio_sesion: 'Inicio de Sesión',
    creacion_usuario: 'Creación de Usuario',
    ajuste_inventario: 'Ajuste de Inventario',
    apertura_caja: 'Apertura de Caja',
    cierre_caja: 'Cierre de Caja',
  };

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          Bitácora de Actividad
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Cargando...</p>
        ) : logs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay registros de actividad aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha / Hora</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('es-MX', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell className="font-medium">{log.user_nombre}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {accionLabels[log.accion] || log.accion}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {log.descripcion || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportesPage;
