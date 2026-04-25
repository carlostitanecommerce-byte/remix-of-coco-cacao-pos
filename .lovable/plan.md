# Auditoría de tiempo real en Cocina y plan de corrección

## Diagnóstico

Tras revisar `CocinaPage.tsx`, la configuración de la base de datos y todos los puntos donde se publican eventos KDS, encontré tres causas concretas de los síntomas que describes:

### 1) Desfase al crear/cambiar de estado órdenes
- El barista escucha la tabla `kds_orders` y `kds_order_items` con un `setTimeout(fetchOrders, 250ms)` (debounce). Cuando POS confirma una venta se insertan **una orden + N items**, lo que dispara varios eventos casi simultáneos. El refetch se reagenda repetidamente y cada `fetchOrders` hace **dos consultas en cadena** (`kds_orders` + `kds_order_items`). En condiciones reales eso suma de 1 a 5 segundos antes de que la tarjeta aparezca.
- Cuando el barista cambia un estado, sí se hace un update local inmediato (bien), pero los demás roles que también miran Cocina dependen del mismo `scheduleRefetch` y por eso ven el cambio con retraso.

### 2) “Aparece y desaparece” la lista en el rol administrador
- Hay dos rutas que mutan `orders` simultáneamente:
  - El handler de `UPDATE` aplica el cambio in-place.
  - El refetch debounced reemplaza por completo el arreglo (`setOrders(mapped)`).
- Cuando los dos compiten, una versión “vieja” puede pisar a una nueva y viceversa, produciendo el parpadeo. Además, `initialLoad.current` y `knownIds.current` se comparten entre llamadas concurrentes, por lo que algunos suenan dos veces y otros “desaparecen” un instante.
- También el filtro automático de “listo” a 90s y el handler de `UPDATE` que filtra estados fuera de `ACTIVE_STATES` se pueden contradecir si llega un refetch a destiempo.

### 3) Eventos que nunca llegan
- En el publisher `supabase_realtime` solo están `kds_orders` y `kds_order_items`. **`ventas` y `cajas` no están publicadas**, pero `CocinaPage` se suscribe a ellas para reaccionar a cancelación de ventas y cierre de caja → esos eventos nunca llegan, así que esas reglas no funcionan en tiempo real (hay que esperar al polling de 30s).
- Además, `ventas` y `cajas` tienen `REPLICA IDENTITY DEFAULT`, por lo que sus payloads de UPDATE llegarían incompletos aunque se publicaran.

## Cambios propuestos

### A. Base de datos (migración)
1. Añadir `ventas` y `cajas` a la publicación `supabase_realtime`.
2. Poner `REPLICA IDENTITY FULL` en `ventas` y `cajas` para que los UPDATE traigan campos viejos y nuevos completos. `kds_orders` y `kds_order_items` ya están en FULL.

### B. `src/pages/CocinaPage.tsx` — refactor del flujo realtime
1. **Aplicar cambios optimistas para INSERT de `kds_orders`**: en lugar de `scheduleRefetch`, insertar la orden recién creada en el estado al instante (con `items: []`) y disparar el sonido inmediatamente. Los items llegarán por el evento de `kds_order_items` y se anexarán in-place. Esto elimina el viaje de ida y vuelta a la red para mostrar la tarjeta.
2. **Manejar `kds_order_items` por evento, no por refetch**: en INSERT del item, anexarlo al order correspondiente en memoria; en DELETE, removerlo. Si el order aún no está cargado, hacer un único fetch puntual de ese order específico (no un refetch global).
3. **Eliminar la condición de carrera entre handler y refetch**: convertir `fetchOrders` en una función reconciliadora que solo se llama (a) en el primer mount, (b) al recuperar foco/online, y (c) al re-suscribir. Mientras la suscripción esté `live`, los handlers son la única fuente de verdad. Quitar el debounce de 250ms.
4. **Proteger contra fetches concurrentes**: usar un `requestIdRef` para que solo el resultado del último `fetchOrders` aplique cambios (descarta respuestas tardías que causan el parpadeo).
5. **Reducir el polling a red de seguridad**: bajar a un `fetchOrders` cuando `liveStatus !== 'live'` o al volver de background, no cada 30s incondicionalmente.
6. **Filtrar correctamente el efecto de `cajas` y `ventas`** ahora que sí llegarán los eventos (el código ya está, solo dejará de ser código muerto).

### C. Validación
- Probar con dos sesiones (POS + Cocina barista, y un tercero como administrador): la tarjeta debe aparecer en menos de 500ms tras confirmar la venta, los cambios de estado se reflejan instantáneamente, y la lista de “Listos” deja de parpadear.

## Archivos a tocar
- Nueva migración SQL (publicación + REPLICA IDENTITY FULL en `ventas` y `cajas`).
- `src/pages/CocinaPage.tsx` (refactor del bloque realtime + helpers de inserción local).

## Lo que NO se cambia
- `KdsBoard`, `KdsOrderCard`, `StartShiftDialog`, `AppSidebar`, `ProtectedRoute` y RLS de KDS quedan intactos.
- Sigue siendo solo el barista quien recibe sonido y diálogo de iniciar turno.
