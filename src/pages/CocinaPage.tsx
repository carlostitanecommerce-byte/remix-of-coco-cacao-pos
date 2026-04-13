import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { KdsBoard } from '@/components/cocina/KdsBoard';
import type { KdsOrder, KdsOrderItem } from '@/components/cocina/KdsOrderCard';
import { toast } from 'sonner';
import { ChefHat, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

// Sound for new orders
const playNewOrderSound = () => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
};

export default function CocinaPage() {
  const { roles, signOut } = useAuth();
  const isBaristaOnly = roles.length === 1 && roles[0] === 'barista';
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const knownIds = useRef<Set<string>>(new Set());
  const initialLoad = useRef(true);

  // Clock
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch orders from today
  const fetchOrders = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: rawOrders, error } = await supabase
      .from('kds_orders')
      .select('*')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching kds_orders', error);
      return;
    }

    if (!rawOrders || rawOrders.length === 0) {
      setOrders([]);
      initialLoad.current = false;
      return;
    }

    const orderIds = rawOrders.map((o: any) => o.id);
    const { data: rawItems } = await supabase
      .from('kds_order_items')
      .select('*')
      .in('kds_order_id', orderIds);

    const itemsByOrder: Record<string, KdsOrderItem[]> = {};
    (rawItems || []).forEach((item: any) => {
      if (!itemsByOrder[item.kds_order_id]) itemsByOrder[item.kds_order_id] = [];
      itemsByOrder[item.kds_order_id].push({
        id: item.id,
        nombre_producto: item.nombre_producto,
        cantidad: item.cantidad,
        notas: item.notas,
      });
    });

    const mapped: KdsOrder[] = rawOrders.map((o: any) => ({
      id: o.id,
      venta_id: o.venta_id,
      folio: o.folio,
      tipo_consumo: o.tipo_consumo,
      estado: o.estado as 'pendiente' | 'listo',
      created_at: o.created_at,
      items: itemsByOrder[o.id] || [],
    }));

    // Sound for new pending orders (skip initial load)
    if (!initialLoad.current) {
      mapped.forEach((o) => {
        if (o.estado === 'pendiente' && !knownIds.current.has(o.id)) {
          playNewOrderSound();
        }
      });
    }

    knownIds.current = new Set(mapped.map((o) => o.id));
    initialLoad.current = false;
    setOrders(mapped);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Realtime subscription (kds + cajas)
  useEffect(() => {
    const channel = supabase
      .channel('kds-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_orders' }, () => {
        fetchOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_order_items' }, () => {
        fetchOrders();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cajas' }, (payload: any) => {
        if (payload.new?.estado === 'cerrada') {
          // Remove all "listo" orders when caja closes
          setOrders((prev) => prev.filter((o) => o.estado !== 'listo'));
          listoTimestamps.current = {};
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // Track when orders become listo to auto-remove after 30s
  const listoTimestamps = useRef<Record<string, number>>({});

  useEffect(() => {
    orders.forEach((o) => {
      if (o.estado === 'listo' && !listoTimestamps.current[o.id]) {
        listoTimestamps.current[o.id] = Date.now();
      }
    });
    const ids = new Set(orders.map((o) => o.id));
    Object.keys(listoTimestamps.current).forEach((k) => {
      if (!ids.has(k)) delete listoTimestamps.current[k];
    });
  }, [orders]);

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      setOrders((prev) =>
        prev.filter((o) => {
          if (o.estado !== 'listo') return true;
          const ts = listoTimestamps.current[o.id];
          if (!ts) return true;
          return now - ts < 30000;
        })
      );
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  const handleMarkReady = async (orderId: string) => {
    setMarkingId(orderId);
    const { error } = await supabase
      .from('kds_orders')
      .update({ estado: 'listo' as any })
      .eq('id', orderId);

    if (error) {
      toast.error('Error al actualizar orden');
      console.error(error);
    }
    setMarkingId(null);
  };

  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <ChefHat className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Cocina</h1>
            <p className="text-xs text-muted-foreground capitalize">{dateStr}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-mono font-bold text-foreground tabular-nums">
            {timeStr}
          </div>
          {isBaristaOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </Button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 p-4 overflow-hidden">
        <KdsBoard orders={orders} onMarkReady={handleMarkReady} markingId={markingId} />
      </div>
    </div>
  );
}
