import { ScrollArea } from '@/components/ui/scroll-area';
import { KdsOrderCard, type KdsOrder } from './KdsOrderCard';
import { Clock, CheckCircle2 } from 'lucide-react';

interface Props {
  orders: KdsOrder[];
  onMarkReady: (orderId: string) => void;
  markingId: string | null;
}

export function KdsBoard({ orders, onMarkReady, markingId }: Props) {
  const pendientes = orders.filter((o) => o.estado === 'pendiente');
  const listos = orders.filter((o) => o.estado === 'listo');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
      {/* Pendiente column */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-3 px-1">
          <Clock className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-bold text-foreground">
            Pendiente
          </h2>
          <span className="ml-auto text-sm font-mono text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
            {pendientes.length}
          </span>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-3 pr-2 pb-4">
            {pendientes.length === 0 && (
              <p className="text-center text-muted-foreground py-12 text-sm">
                Sin órdenes pendientes 🎉
              </p>
            )}
            {pendientes.map((order) => (
              <KdsOrderCard
                key={order.id}
                order={order}
                onMarkReady={onMarkReady}
                marking={markingId === order.id}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Listo column */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-3 px-1">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">
            Listo
          </h2>
          <span className="ml-auto text-sm font-mono text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
            {listos.length}
          </span>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-3 pr-2 pb-4">
            {listos.length === 0 && (
              <p className="text-center text-muted-foreground py-12 text-sm">
                Sin órdenes listas
              </p>
            )}
            {listos.map((order) => (
              <KdsOrderCard
                key={order.id}
                order={order}
                onMarkReady={onMarkReady}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
