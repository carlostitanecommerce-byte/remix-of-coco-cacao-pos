import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Users, LogOut as LogOutIcon, XCircle, ShoppingBag } from 'lucide-react';
import type { Area, CoworkingSession } from './types';

interface Props {
  sessions: CoworkingSession[];
  areas: Area[];
  onCheckOut: (session: CoworkingSession) => void;
  onCancel: (session: CoworkingSession) => void;
  onManageAccount?: (session: CoworkingSession) => void;
  onPaxUpdated?: () => void | Promise<void>;
}

export function ActiveSessionsTable({ sessions, areas, onCheckOut, onCancel, onManageAccount }: Props) {
  if (sessions.length === 0) return null;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />Sesiones Activas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Pax</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida Est.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map(s => {
                const area = areas.find(a => a.id === s.area_id);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.cliente_nombre}</TableCell>
                    <TableCell>{area?.nombre_area ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />{s.pax_count}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(s.fecha_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(s.fecha_fin_estimada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {onManageAccount && (
                          <Button variant="default" size="sm" onClick={() => onManageAccount(s)} title="Gestionar cuenta de la sesión">
                            <ShoppingBag className="h-3 w-3 mr-1" />Gestionar Cuenta
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => onCheckOut(s)}>
                          <LogOutIcon className="h-3 w-3 mr-1" />Registrar Salida
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onCancel(s)}>
                          <XCircle className="h-3 w-3 mr-1" />Cancelar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
