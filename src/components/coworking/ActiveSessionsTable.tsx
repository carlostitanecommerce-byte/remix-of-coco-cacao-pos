import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock, Users, LogOut as LogOutIcon, XCircle, Pencil, ShoppingBag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Area, CoworkingSession } from './types';

interface Props {
  sessions: CoworkingSession[];
  areas: Area[];
  onCheckOut: (session: CoworkingSession) => void;
  onCancel: (session: CoworkingSession) => void;
  onManageAccount?: (session: CoworkingSession) => void;
  onPaxUpdated?: () => void | Promise<void>;
}

export function ActiveSessionsTable({ sessions, areas, onCheckOut, onCancel, onManageAccount, onPaxUpdated }: Props) {
  const { toast } = useToast();
  const [editingPaxId, setEditingPaxId] = useState<string | null>(null);
  const [newPax, setNewPax] = useState('');

  if (sessions.length === 0) return null;

  const handleSavePax = async (session: CoworkingSession, area: Area) => {
    const pax = parseInt(newPax, 10);
    if (isNaN(pax) || pax < 1) {
      toast({ variant: 'destructive', title: 'Pax inválido' });
      return;
    }
    if (pax > area.capacidad_pax) {
      toast({ variant: 'destructive', title: 'Excede capacidad', description: `Máximo ${area.capacidad_pax} personas.` });
      return;
    }

    const { error } = await supabase
      .from('coworking_sessions')
      .update({ pax_count: pax })
      .eq('id', session.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: `Pax actualizado a ${pax}` });
      setEditingPaxId(null);
      await onPaxUpdated?.();
    }
  };

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
                        {area?.es_privado && (
                          <Popover open={editingPaxId === s.id} onOpenChange={(open) => {
                            if (open) { setEditingPaxId(s.id); setNewPax(String(s.pax_count)); }
                            else setEditingPaxId(null);
                          }}>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-1 text-muted-foreground hover:text-foreground">
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-3" align="start">
                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">Máx: {area.capacidad_pax}</p>
                                <Input
                                  type="number"
                                  min={1}
                                  max={area.capacidad_pax}
                                  value={newPax}
                                  onChange={e => setNewPax(e.target.value)}
                                  className="h-8"
                                />
                                <Button size="sm" className="w-full h-7" onClick={() => handleSavePax(s, area)}>
                                  Guardar
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
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
