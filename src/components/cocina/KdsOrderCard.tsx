import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Clock, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KdsOrderItem {
  id: string;
  nombre_producto: string;
  cantidad: number;
  notas: string | null;
}

export interface KdsOrder {
  id: string;
  venta_id: string;
  folio: number;
  tipo_consumo: string;
  estado: 'pendiente' | 'listo';
  created_at: string;
  items: KdsOrderItem[];
}

interface Props {
  order: KdsOrder;
  onMarkReady: (orderId: string) => void;
  marking?: boolean;
}

const tipoLabel: Record<string, string> = {
  sitio: 'En sitio',
  para_llevar: 'Para llevar',
  delivery: 'Delivery',
};

export function KdsOrderCard({ order, onMarkReady, marking }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(order.created_at).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [order.created_at]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  const urgency =
    minutes >= 10 ? 'urgent' : minutes >= 5 ? 'warning' : 'normal';

  const urgencyStyles = {
    normal: 'border-emerald-500/40 bg-emerald-500/5',
    warning: 'border-amber-500/60 bg-amber-500/5',
    urgent: 'border-red-500/70 bg-red-500/10 animate-pulse',
  };

  const timerColor = {
    normal: 'text-emerald-600',
    warning: 'text-amber-600',
    urgent: 'text-red-600 font-bold',
  };

  const isReady = order.estado === 'listo';

  return (
    <Card
      className={cn(
        'border-2 transition-all duration-300',
        isReady
          ? 'border-primary/30 bg-primary/5 opacity-80'
          : urgencyStyles[urgency]
      )}
    >
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold font-mono text-foreground">
              #{String(order.folio).padStart(4, '0')}
            </span>
            <Badge
              variant="outline"
              className="text-xs font-normal"
            >
              {tipoLabel[order.tipo_consumo] || order.tipo_consumo}
            </Badge>
          </div>
          {!isReady && (
            <div className={cn('flex items-center gap-1 text-sm', timerColor[urgency])}>
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">
                {minutes}:{String(seconds).padStart(2, '0')}
              </span>
            </div>
          )}
          {isReady && (
            <Badge className="bg-primary text-primary-foreground">
              <Check className="h-3 w-3 mr-1" /> Listo
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-2">
        <div className="space-y-1.5">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-start gap-2">
              <span className="text-sm font-semibold text-foreground min-w-[24px]">
                {item.cantidad}x
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground">{item.nombre_producto}</span>
                {item.notas && (
                  <p className="text-xs text-muted-foreground italic mt-0.5">
                    {item.notas}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {!isReady && (
          <Button
            size="lg"
            className="w-full mt-2 h-12 text-base font-semibold"
            onClick={() => onMarkReady(order.id)}
            disabled={marking}
          >
            <UtensilsCrossed className="h-5 w-5 mr-2" />
            Marcar Listo
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
