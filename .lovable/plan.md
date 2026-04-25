
# Auditoría End-to-End — Módulo Cocina (KDS)

## Veredicto general
El módulo es **funcional pero NO profesional**. La arquitectura es sólida (Kanban, temporizadores, prioridad por colores, integración POS→KDS, filtrado por turno de caja), pero hay **1 bug crítico que rompe el "tiempo real"** prometido y varias deficiencias de robustez, accesibilidad y seguridad. Necesita correcciones antes de ir a producción.

---

## Flujo verificado

1. **POS → KDS** (`ConfirmVentaDialog.tsx` L286–322): al confirmar venta se insertan `kds_orders` + `kds_order_items`, expandiendo correctamente paquetes a componentes con prefijo `📦 [Combo] Componente`. Ítems coworking (`producto_id` con prefijo `coworking-`) se mapean a `null` (correcto).
2. **CocinaPage**: carga órdenes del día, suscripción Realtime a `kds_orders`, `kds_order_items` y `cajas`, sonido en órdenes nuevas, tablero Kanban Pendiente/Listo, auto-ocultar `listo` tras 30 s o al cerrar caja.
3. **KdsOrderCard**: temporizador con código de colores (verde <5m, ámbar 5–10m, rojo pulsante >10m), botón "Marcar Listo".

---

## 🔴 Bugs críticos

### C1 — Realtime NO funciona (las tablas KDS no están en la publicación)
Verificado en BD: `kds_orders` y `kds_order_items` **no aparecen en `supabase_realtime`**. El canal `kds-realtime` se suscribe pero **nunca recibe eventos** de inserción/actualización. Resultado: las órdenes nuevas **no aparecen automáticamente** en cocina hasta que la página se recarga, y el sonido de alerta nunca se dispara para órdenes nuevas (el `initialLoad.current` ya está en `false`, pero `fetchOrders` jamás se vuelve a llamar). Esto rompe el propósito principal del KDS.
**Fix:** migración SQL `ALTER PUBLICATION supabase_realtime ADD TABLE public.kds_orders, public.kds_order_items;` y `ALTER TABLE ... REPLICA IDENTITY FULL;` para recibir payload completo en updates.

### C2 — Órdenes "pendiente" antiguas se acumulan indefinidamente
En BD hay órdenes en `pendiente` desde hace días/semanas (folio 624 del 2026-04-10). El query `gte('created_at', todayStart)` las oculta hoy, pero **no hay limpieza ni mecanismo de auto-cancelación**. Si se marca venta como `cancelada`, la orden KDS sigue activa "para siempre". Tampoco se cancela cuando una venta se cancela vía `CancelVentaDialog`.
**Fix:** trigger en `ventas` que al pasar a `cancelada` borre o marque `kds_orders` correspondiente; opcionalmente rutina diaria (o filtro UI) para descartar pendientes >24 h con badge "obsoleta".

---

## 🟠 Bugs funcionales

### B1 — Ventas canceladas siguen apareciendo en cocina
No existe sincronización entre `ventas.estado='cancelada'` y `kds_orders`. Cocina puede preparar y entregar productos cuya venta fue revertida.
**Fix:** además de C2, en el handler de cancelación de venta hacer `DELETE FROM kds_orders WHERE venta_id = X` (o marcar estado `cancelada` agregando valor al enum).

### B2 — Race condition en `setOrders` con timer de auto-eliminación
El `useEffect` con interval de 2s reasigna `prev.filter(...)` mientras `fetchOrders` también escribe. Si una orden marcada `listo` se vuelve a cargar antes de los 30 s, su timestamp se reinicia (porque `listoTimestamps.current[o.id]` no se establece si ya se borró tras `fetchOrders`). Resultado: órdenes "listo" pueden quedarse visibles más de 30 s o desaparecer/reaparecer.
**Fix:** usar el `updated_at` de la orden como referencia, no `Date.now()` local; o consolidar la lógica en `fetchOrders` filtrando server-side `WHERE estado='pendiente' OR (estado='listo' AND updated_at > now()-interval '30 seconds')`.

### B3 — `handleMarkReady` sin lock por timestamp
Si dos pantallas marcan listo casi a la vez, se hacen dos UPDATE. No es destructivo, pero el segundo sobreescribe `updated_at`, descuadrando B2.
**Fix:** `update().eq('id', orderId).eq('estado', 'pendiente')` para idempotencia.

### B4 — Sonido nunca se reproduce en producción real
`AudioContext` requiere interacción del usuario para iniciarse en navegadores modernos. Si la pantalla del KDS se deja abierta sin interacción, el primer `osc.start()` puede fallar silenciosamente (envuelto en `try/catch` vacío). El barista no oirá la alerta.
**Fix:** crear un único `AudioContext` al primer click/tecla en la página, mantenerlo, y si está `suspended` mostrar banner "Toca para activar alertas sonoras".

### B5 — Ítems coworking llegan al KDS con `producto_id=null` y nombre genérico ("Tiempo Coworking — Cubículo X")
Esto satura el tablero con líneas que cocina no debe preparar.
**Fix:** en `ConfirmVentaDialog` excluir explícitamente líneas cuyo `producto_id` empiece con `coworking-` (no convertir a `null`, simplemente no agregar a `kdsLines`). También excluir `tipo_concepto !== 'producto' && !== 'paquete'` (propinas, etc., aunque ya están filtrados).

---

## 🟡 Mejoras de robustez/UX

### M1 — Accesibilidad: dialogs sin DialogTitle/Description
Los console-logs muestran warnings de Radix por DialogContent sin `DialogTitle` (no es del KDS específicamente, pero conviene auditar a la par). No bloquea.

### M2 — Sin manejo de errores al cargar `kds_order_items`
Si falla la segunda query, los items se ven vacíos sin aviso.
**Fix:** if (itemsError) toast.error(...).

### M3 — `key={order.id}` sin `data-folio` y card sin `aria-label`
Para pantallas táctiles compartidas, agregar etiquetas accesibles ("Orden #0635, en sitio, pendiente, 3 minutos").

### M4 — Sin botón "deshacer marcado" tras tocar Listo por error
Una vez "listo", la orden se oculta a los 30 s sin posibilidad de revertir. Agregar botón "Regresar a pendiente" durante esos 30 s (rol admin/supervisor).

---

## Plan de corrección

1. **Migración SQL** (`supabase/migrations/...`):
   - `ALTER PUBLICATION supabase_realtime ADD TABLE public.kds_orders, public.kds_order_items;`
   - `ALTER TABLE public.kds_orders REPLICA IDENTITY FULL;`
   - `ALTER TABLE public.kds_order_items REPLICA IDENTITY FULL;`
   - Trigger `AFTER UPDATE ON ventas`: si `NEW.estado='cancelada'` y `OLD.estado<>'cancelada'`, `DELETE FROM kds_orders WHERE venta_id=NEW.id`.

2. **`ConfirmVentaDialog.tsx`** (L286–304):
   - Excluir líneas coworking del `kdsLines` (no enviar al KDS).

3. **`CocinaPage.tsx`**:
   - Refactor del auto-ocultar a 30 s usando `updated_at` server-side y filtro en `fetchOrders` (`OR(estado.eq.pendiente, and(estado.eq.listo,updated_at.gt.<hace 30s>))`).
   - Inicializar `AudioContext` en primer gesto del usuario; mostrar banner si está `suspended`.
   - `handleMarkReady`: agregar `.eq('estado','pendiente')`.
   - Manejo de error en query de items.

4. **`CancelVentaDialog.tsx`**: tras marcar venta como cancelada, ejecutar `DELETE FROM kds_orders WHERE venta_id` (o confiar en el trigger del paso 1; idealmente ambos).

5. **Smoke test end-to-end**:
   - Crear venta nueva en POS con dispositivo A → verificar que aparece **instantáneamente** en KDS abierto en dispositivo B (sin recargar) y que suena alerta.
   - Vender un paquete → verificar que sus componentes aparecen como líneas separadas con prefijo combo.
   - Vender solo coworking sin productos → verificar que **NO** se crea orden KDS.
   - Cancelar venta desde POS → verificar que orden KDS desaparece automáticamente.
   - Marcar listo y esperar 30 s → debe ocultarse; cerrar caja → todas las "listo" se ocultan.
   - Doble-tap rápido en "Marcar Listo" → idempotente.

