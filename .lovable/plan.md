## Diagnóstico

Auditando el flujo completo encontré que la lógica del cliente está bien escrita (suscripción a INSERT/UPDATE/DELETE en `kds_orders` y `kds_order_items` con debounce + refetch), las tablas están en la publicación `supabase_realtime`, y tienen `REPLICA IDENTITY FULL`. Sin embargo el barista no recibe la nueva orden hasta refrescar. Hay tres causas que actúan en conjunto:

1. **El canal Realtime se suscribe sin verificar el resultado.** Hoy se usa `.subscribe()` sin callback. Si la conexión falla (token expirado, tenant en frío, error de RLS) el barista nunca se entera y nunca reintenta. El log de Realtime muestra eventos del tipo "Stop tenant ... because of no connected users", confirmando que el canal no se mantiene conectado de forma confiable.

2. **El token JWT del cliente Realtime no se refresca automáticamente.** Cuando el barista deja la pestaña abierta mucho tiempo, `supabase.auth` rota el access token, pero el socket Realtime sigue usando el anterior. Resultado: la conexión queda "viva" pero los eventos `postgres_changes` dejan de entregarse porque la autorización RLS los rechaza silenciosamente. Se arregla llamando `supabase.realtime.setAuth(token)` cuando cambia la sesión.

3. **No hay red de seguridad ante caídas de conexión.** Si la pestaña se queda en segundo plano, el navegador suspende el WebSocket; al volver al primer plano la lista queda obsoleta hasta el próximo evento.

## Plan de implementación

Edito únicamente `src/pages/CocinaPage.tsx` (no se tocan migraciones; el lado del servidor ya está bien configurado).

### 1. Suscripción robusta con estado del canal
- Cambiar `.subscribe()` por `.subscribe((status, err) => { ... })`.
- En estado `SUBSCRIBED`: hacer un `fetchOrders()` para reconciliar lo que pudo haberse perdido durante la conexión.
- En estados `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`: mostrar un toast discreto y programar reconexión exponencial (1s, 2s, 5s, máx 10s) recreando el canal.

### 2. Sincronización del JWT con Realtime
- Suscribirse a `supabase.auth.onAuthStateChange`. Cada vez que llega un nuevo `session.access_token`, llamar `supabase.realtime.setAuth(session.access_token)` para que los eventos sigan autorizados.
- Hacer una pasada inicial con la sesión actual al montar el componente.

### 3. Recuperación al volver al primer plano y heartbeat
- Listener `document.visibilitychange`: cuando la pestaña vuelve a ser visible, ejecutar `fetchOrders()` para reconciliar.
- Listener `window.online`: reconciliar al recuperar conexión.
- Polling defensivo cada 30 segundos como red de seguridad (muy ligero, sólo trae filas del día con `ACTIVE_STATES`). Esto garantiza que aunque Realtime falle por completo, el barista verá la orden en máximo 30s sin tocar nada.

### 4. Indicador visual de conexión
- Agregar un punto de estado (verde "En vivo" / ámbar "Reconectando…") junto al reloj del header. Permite al barista saber de un vistazo si el realtime está activo, evitando la duda de "¿se me cayó?".

## Detalles técnicos

- El debounce existente de 250ms para `INSERT` se mantiene; sólo añadimos resiliencia alrededor.
- El polling de 30s NO reemplaza al realtime; es un fallback. Cuando realtime funciona, el refresco sigue siendo instantáneo (≈250ms).
- No se requieren cambios SQL: las tablas ya tienen `REPLICA IDENTITY FULL` y están en `supabase_realtime`.
- No se rompe ningún flujo existente del POS ni del KDS.

## Resultado esperado

- Al procesar una venta desde Caja/Admin, la orden aparece en la pantalla de Cocina del barista en menos de 1 segundo, sin recargar.
- Si la conexión Realtime falla por cualquier motivo, el polling de 30s + el refetch al recuperar visibilidad garantizan que la orden aparezca de todos modos.
- El barista ve un indicador claro de si la conexión en vivo está activa.