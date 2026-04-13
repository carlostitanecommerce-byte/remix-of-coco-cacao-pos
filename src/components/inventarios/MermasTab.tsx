import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface MermaRow {
  id: string;
  cantidad: number;
  motivo: string;
  fecha: string;
  usuario_id: string;
  insumos: { nombre: string; unidad_medida: string } | null;
  usuario_nombre?: string;
}

interface Props { isAdmin: boolean }

const MermasTab = ({ isAdmin }: Props) => {
  const [mermas, setMermas] = useState<MermaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data: rawMermas } = await supabase
        .from('mermas')
        .select('id, cantidad, motivo, fecha, usuario_id, insumos(nombre, unidad_medida)')
        .order('fecha', { ascending: false })
        .limit(200);

      const rows = (rawMermas ?? []) as MermaRow[];

      // Fetch profile names
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
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-foreground">Historial de Mermas</h2>
      <Card>
        <CardContent className="p-0">
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
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : mermas.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin mermas registradas</TableCell></TableRow>
              ) : mermas.map(m => (
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
        </CardContent>
      </Card>
    </div>
  );
};

export default MermasTab;
