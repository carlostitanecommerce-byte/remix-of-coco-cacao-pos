import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Ban, PackageCheck, Trash2, Building2, User, Clock as ClockIcon } from 'lucide-react';
import type { KdsItemCancelacion } from './KdsOrderCard';

interface Props {
  cancelaciones: KdsItemCancelacion[];
  onResolve: (cancelId: string, decision: 'retornado_stock' | 'merma', notas?: string | null) => void;
  resolvingCancelId?: string | null;
}

function formatHora(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
}

export function CancelacionesPanel({ cancelaciones, onResolve, resolvingCancelId }: Props) {
  const [dialog, setDialog] = useState<{ cancelId: string; decision: 'retornado_stock' | 'merma'; nombre: string } | null>(null);
  const [notas, setNotas] = useState('');

  if (cancelaciones.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border-2 border-destructive/60 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Ban className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-bold text-destructive">Cancelaciones pendientes</h3>
        <Badge variant="destructive" className="ml-1">{cancelaciones.length}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          Decide: retornar a stock o registrar como merma
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {cancelaciones.map((c) => (
          <Card key={c.id} className="p-3 border-destructive/50 bg-card">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  ×{c.cantidad} {c.nombre_producto}
                </p>
                <p className="text-xs text-muted-foreground italic line-clamp-2 mt-0.5">
                  "{c.motivo}"
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] flex items-center gap-1 shrink-0">
                <ClockIcon className="h-2.5 w-2.5" />
                {formatHora(c.created_at)}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
              {c.cliente_nombre && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {c.cliente_nombre}
                </span>
              )}
              {c.area_nombre && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {c.area_nombre}
                </span>
              )}
            </div>

            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10"
                disabled={resolvingCancelId === c.id}
                onClick={() => { setNotas(''); setDialog({ cancelId: c.id, decision: 'retornado_stock', nombre: c.nombre_producto }); }}
              >
                <PackageCheck className="h-3.5 w-3.5 mr-1" />
                Retornar a stock
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                disabled={resolvingCancelId === c.id}
                onClick={() => { setNotas(''); setDialog({ cancelId: c.id, decision: 'merma', nombre: c.nombre_producto }); }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Registrar merma
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog?.decision === 'retornado_stock' ? 'Retornar insumos a stock' : 'Registrar merma'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.decision === 'retornado_stock'
                ? `Confirmas que los insumos de "${dialog?.nombre}" no se prepararon y vuelven al inventario.`
                : `Se descontará el inventario asociado a "${dialog?.nombre}" como merma.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Notas para auditoría (opcional)"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="min-h-20"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dialog) {
                  onResolve(dialog.cancelId, dialog.decision, notas.trim() || null);
                  setDialog(null);
                }
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
