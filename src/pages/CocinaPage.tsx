import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { KdsBoard } from '@/components/cocina/KdsBoard';
import type { KdsOrder, KdsOrderItem } from '@/components/cocina/KdsOrderCard';
import { toast } from 'sonner';
import { ChefHat, LogOut, Volume2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const READY_RETENTION_MS = 30_000;

// Persistent AudioContext (only one per session, primed by user gesture)
let audioCtx: AudioContext | null = null;
const ensureAudio = () => {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

const playNewOrderSound = () => {
  const ctx = audioCtx;
  if (!ctx || ctx.state !== 'running') return;
  try {
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
  const [audioReady, setAudioReady] = useState(false);
  const knownIds = useRef<Set<string>>(new Set());
  const initialLoad = useRef(true);

  // Clock
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Activate audio on first user gesture
  useEffect(() => {
    const activate = () => {
      const ctx = ensureAudio();
      if (ctx && ctx.state === 'running') {
        setAudioReady(true);
        window.removeEventListener('click', activate);
        window.removeEventListener('keydown', activate);
        window.removeEventListener('touchstart', activate);
      }
    };
    window.addEventListener('click', activate);
    window.addEventListener('keydown', activate);
    window.addEventListener('touchstart', activate);
    return () => {
      window.removeEventListener('click', activate);
      window.removeEventListener('keydown', activate);
      window.removeEventListener('touchstart', activate);
    };
  }, []);

  // Fetch orders: pendientes del día + listos recientes (< 30s desde updated_at)
  const fetchOrders = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const cutoff = new Date(Date.now() - READY_RETENTION_MS).toISOString();

    const { data: rawOrders, error } = await supabase
      .from('kds_orders')
      .select('*')
      .gte('created_at', todayStart.toISOString())
      .or(`estado.eq.pendiente,and(estado.eq.listo,updated_at.gt.${cutoff})`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching kds_orders', error);
      toast.error('Error al cargar órdenes de cocina');
      return;
    }

    if (!rawOrders || rawOrders.length === 0) {
      setOrders([]);
      initialLoad.current = false;
      return;
    }

    const orderIds = rawOrders.map((o: any) => o.id);
    const { data: rawItems, error: itemsError } = await supabase
      .from('kds_order_items')
      .select('*')
      .in('kds_order_id', orderIds);

    if (itemsError) {
      console.error('Error fetching kds_order_items', itemsError);
      toast.error('Error al cargar productos de las órdenes');
    }

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
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // Periodic re-fetch to evict "listo" orders past their 30s window
  useEffect(() => {
    const iv = setInterval(() => {
      // Solo refrescar si hay órdenes "listo" en pantalla
      setOrders((prev) => {
        if (prev.some((o) => o.estado === 'listo')) {
          fetchOrders();
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(iv);
  }, [fetchOrders]);

  const handleMarkReady = async (orderId: string) => {
    setMarkingId(orderId);
    // Idempotencia: solo actualiza si sigue pendiente
    const { error } = await supabase
      .from('kds_orders')
      .update({ estado: 'listo' as any, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('estado', 'pendiente');

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

      {/* Audio activation banner */}
      {!audioReady && (
        <button
          onClick={() => {
            const ctx = ensureAudio();
            if (ctx && ctx.state === 'running') setAudioReady(true);
          }}
          className="flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/40 text-amber-700 dark:text-amber-400 px-4 py-2 text-sm font-medium hover:bg-amber-500/20 transition-colors"
        >
          <Volume2 className="h-4 w-4" />
          Toca aquí para activar las alertas sonoras de nuevas órdenes
        </button>
      )}

      {/* Board */}
      <div className="flex-1 p-4 overflow-hidden">
        <KdsBoard orders={orders} onMarkReady={handleMarkReady} markingId={markingId} />
      </div>
    </div>
  );
}
