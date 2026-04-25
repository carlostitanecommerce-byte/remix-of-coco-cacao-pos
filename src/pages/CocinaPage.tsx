import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { KdsBoard } from '@/components/cocina/KdsBoard';
import { Clock as KdsClock } from '@/components/cocina/Clock';
import { StartShiftDialog } from '@/components/cocina/StartShiftDialog';
import type { KdsOrder, KdsOrderItem, KdsEstado } from '@/components/cocina/KdsOrderCard';
import { toast } from 'sonner';
import { ChefHat, Wifi, WifiOff, Timer } from 'lucide-react';

const ACTIVE_STATES: KdsEstado[] = ['pendiente', 'en_preparacion', 'listo'];
const POLL_FALLBACK_MS = 30000;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000];
const LISTO_TIMEOUT_MS = 90000; // 90s — estándar de KDS profesional
const URGENT_THRESHOLD_MIN = 10; // órdenes con >10 min se consideran urgentes
const URGENT_REPEAT_MS = 30000; // re-toca timbre cada 30s mientras haya urgentes

export default function CocinaPage() {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<'live' | 'reconnecting'>('reconnecting');
  const [avgPrepMin, setAvgPrepMin] = useState<number | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const initialLoad = useRef(true);
  const listoTimestamps = useRef<Record<string, number>>({});
  // Mide cuánto tarda cada orden en pasar de creada → listo (calculado en cliente)
  const prepDurations = useRef<number[]>([]);
  const startedAt = useRef<Record<string, number>>({});

  // ------- Inicio de turno + desbloqueo de audio -------
  // El navegador requiere un gesto del usuario para reproducir audio. El
  // diálogo "Iniciar turno" captura ese gesto de forma profesional y
  // garantiza que las alertas suenen desde la primera orden.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [shiftStarted, setShiftStarted] = useState(false);

  const startShift = useCallback(() => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx();
      audioCtxRef.current?.resume?.();
    } catch (e) {
      console.error('No se pudo activar audio', e);
    }
    setShiftStarted(true);
    toast.success('Turno iniciado — alertas activas');
  }, []);

  const playNewOrderSound = useCallback(() => {
    const ctx = audioCtxRef.current;
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
    } catch {
      /* ignore */
    }
  }, []);

  // ------- Fetch helpers -------
  // Inicio del día en zona horaria del negocio (CDMX, UTC-6 fijo) — consistente
  // con el resto del sistema. Evita que en la madrugada o desde otra zona
  // horaria se calcule mal la ventana "de hoy".
  const todayStartIso = useCallback(() => {
    const now = new Date();
    // Convertir "ahora" a CDMX, truncar a 00:00:00 CDMX y devolver como UTC ISO
    const cdmxOffsetHours = -6;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
    const cdmxNow = new Date(utcMs + cdmxOffsetHours * 3_600_000);
    const cdmxMidnight = new Date(
      cdmxNow.getFullYear(),
      cdmxNow.getMonth(),
      cdmxNow.getDate(),
      0, 0, 0, 0,
    );
    // cdmxMidnight es 00:00 CDMX expresado como Date local del navegador;
    // restamos el offset para obtener el equivalente UTC real.
    const utcMidnight = new Date(
      cdmxMidnight.getTime() - cdmxOffsetHours * 3_600_000 - now.getTimezoneOffset() * 60_000,
    );
    return utcMidnight.toISOString();
  }, []);

  const fetchOrders = useCallback(async () => {
    const { data: rawOrders, error } = await supabase
      .from('kds_orders')
      .select('*')
      .gte('created_at', todayStartIso())
      .in('estado', ACTIVE_STATES as any)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching kds_orders', error);
      return;
    }

    if (!rawOrders || rawOrders.length === 0) {
      setOrders([]);
      knownIds.current = new Set();
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
      estado: o.estado as KdsEstado,
      created_at: o.created_at,
      items: itemsByOrder[o.id] || [],
    }));

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
  }, [playNewOrderSound, todayStartIso]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ------- Sync Realtime auth token whenever the session changes -------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ------- Realtime: subscription with reconnection + status tracking -------
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchOrders(), 250);
    };

    const setupChannel = () => {
      if (cancelled) return;
      // Clean up previous channel if any
      if (currentChannel) {
        supabase.removeChannel(currentChannel);
        currentChannel = null;
      }

      const channel = supabase
        .channel(`kds-realtime-${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kds_orders' }, () => {
          scheduleRefetch();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kds_orders' }, (payload: any) => {
          const next = payload.new;
          if (!next) return;
          if (!ACTIVE_STATES.includes(next.estado)) {
            setOrders((prev) => prev.filter((o) => o.id !== next.id));
            return;
          }
          setOrders((prev) =>
            prev.map((o) => (o.id === next.id ? { ...o, estado: next.estado as KdsEstado } : o))
          );
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'kds_orders' }, (payload: any) => {
          const old = payload.old;
          if (old?.id) {
            setOrders((prev) => prev.filter((o) => o.id !== old.id));
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_order_items' }, () => {
          scheduleRefetch();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ventas' }, (payload: any) => {
          if (payload.new?.estado === 'cancelada') {
            setOrders((prev) => prev.filter((o) => o.venta_id !== payload.new.id));
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cajas' }, (payload: any) => {
          if (payload.new?.estado === 'cerrada') {
            setOrders((prev) => prev.filter((o) => o.estado !== 'listo'));
            listoTimestamps.current = {};
          }
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            reconnectAttempt = 0;
            setLiveStatus('live');
            // Reconcile anything that may have happened while we were disconnected
            fetchOrders();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setLiveStatus('reconnecting');
            const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
            reconnectAttempt++;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(setupChannel, delay);
          }
        });

      currentChannel = channel;
    };

    setupChannel();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (currentChannel) supabase.removeChannel(currentChannel);
    };
  }, [fetchOrders]);

  // ------- Safety net: refetch on visibility change, online event, and 30s polling -------
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchOrders();
      }
    };
    const handleOnline = () => {
      fetchOrders();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchOrders();
      }
    }, POLL_FALLBACK_MS);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      clearInterval(pollInterval);
    };
  }, [fetchOrders]);

  // ------- Auto-remove "listo" after 30s -------
  useEffect(() => {
    orders.forEach((o) => {
      if (o.estado === 'listo' && !listoTimestamps.current[o.id]) {
        listoTimestamps.current[o.id] = Date.now();
      }
      if (o.estado !== 'listo' && listoTimestamps.current[o.id]) {
        delete listoTimestamps.current[o.id];
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
          return now - ts < LISTO_TIMEOUT_MS;
        })
      );
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  // ------- Timbre repetitivo para órdenes urgentes (>10 min sin atender) -------
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      const hasUrgent = orders.some((o) => {
        if (o.estado === 'listo') return false;
        const ageMin = (now - new Date(o.created_at).getTime()) / 60000;
        return ageMin >= URGENT_THRESHOLD_MIN;
      });
      if (hasUrgent) playNewOrderSound();
    }, URGENT_REPEAT_MS);
    return () => clearInterval(iv);
  }, [orders, playNewOrderSound]);

  // ------- Actions -------
  const updateEstado = async (orderId: string, estado: KdsEstado) => {
    setBusyId(orderId);
    const { error } = await supabase
      .from('kds_orders')
      .update({ estado: estado as any, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) {
      toast.error('Error al actualizar orden');
      console.error(error);
    } else {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, estado } : o)));
      if (estado === 'en_preparacion') {
        // Marca el inicio de preparación para medir el tiempo total
        if (!startedAt.current[orderId]) startedAt.current[orderId] = Date.now();
      }
      if (estado === 'listo') {
        listoTimestamps.current[orderId] = Date.now();
        // Calcula duración desde la creación de la orden (no desde "iniciar")
        const order = orders.find((o) => o.id === orderId);
        if (order) {
          const durationMin = (Date.now() - new Date(order.created_at).getTime()) / 60000;
          if (durationMin > 0 && durationMin < 120) {
            // Filtra valores absurdos (>2h) que distorsionarían el promedio
            prepDurations.current.push(durationMin);
            const sum = prepDurations.current.reduce((a, b) => a + b, 0);
            setAvgPrepMin(sum / prepDurations.current.length);
          }
        }
      } else if (listoTimestamps.current[orderId]) {
        delete listoTimestamps.current[orderId];
      }
    }
    setBusyId(null);
  };

  const handleStart = (orderId: string) => updateEstado(orderId, 'en_preparacion');
  const handleMarkReady = (orderId: string) => updateEstado(orderId, 'listo');
  const handleRevert = (orderId: string) => updateEstado(orderId, 'en_preparacion');

  const activeCount = orders.filter((o) => o.estado !== 'listo').length;

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
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{activeCount} {activeCount === 1 ? 'orden activa' : 'órdenes activas'}</span>
              {avgPrepMin !== null && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Prom. {avgPrepMin.toFixed(1)} min
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md ${
              liveStatus === 'live'
                ? 'text-emerald-600 bg-emerald-500/10'
                : 'text-amber-600 bg-amber-500/10'
            }`}
            title={liveStatus === 'live' ? 'Conectado en tiempo real' : 'Reintentando conexión…'}
          >
            {liveStatus === 'live' ? (
              <>
                <Wifi className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">En vivo</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reconectando…</span>
              </>
            )}
          </div>
          <SoundEnabler enabled={soundEnabled} onEnable={enableSound} />
          <KdsClock />
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
        <KdsBoard
          orders={orders}
          onStart={handleStart}
          onMarkReady={handleMarkReady}
          onRevert={handleRevert}
          busyId={busyId}
        />
      </div>
    </div>
  );
}
