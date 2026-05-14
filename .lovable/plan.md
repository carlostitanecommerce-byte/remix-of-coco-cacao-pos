# Cancelaciones a cocina: visibilidad profesional

## Diagnóstico

La cancelación se inserta correctamente en `cancelaciones_items_sesion`, pero la cocina **nunca la ve** en estos casos:

1. **Paquetes** (`paquete_id IS NOT NULL`): el RPC no intenta enlazar a `kds_orders` y guarda `kds_order_id = NULL`. La UI sólo pinta cancelaciones agrupadas por `kds_order_id` (`cancelacionesPorOrden` descarta las que no tienen).
2. **Productos simples cuyo KDS ya está "listo"**: el RPC filtra `ko.estado <> 'listo'`, por lo que también queda con `kds_order_id = NULL`.
3. **Productos simples cuyo KDS quedó "expirada"** (auto-ocultado tras 90s): aunque se enlace, la página sólo carga órdenes en `pendiente|en_preparacion|listo`, así que la tarjeta tampoco existe.

Verificado en DB: la última cancelación (paquete "Bebida + Helado") tiene `kds_order_id = NULL` y por eso no aparece.

## Objetivo

Que cocina vea y resuelva **toda** cancelación de sesión coworking (producto o paquete) sin importar el estado de la orden KDS asociada, manteniendo el overlay actual cuando sí hay tarjeta visible.

## Cambios

### 1. Frontend: panel dedicado "Cancelaciones pendientes"

En `CocinaPage.tsx` / `KdsBoard.tsx`:

- Ampliar el `select` de `fetchCancelaciones` para incluir `session_id`, `paquete_id`, `producto_id`, `created_at`.
- Enriquecer cada cancelación con `cliente_nombre` y `nombre_area` (join en cliente vía `coworking_sessions` + `areas_coworking`, igual que ya se hace para órdenes).
- Renderizar un nuevo bloque al inicio del board (sólo si hay cancelaciones pendientes) titulado **"Cancelaciones pendientes"** con tarjetas estilo `border-destructive`:
  - Encabezado: cliente, área, hora, motivo, cantidad, nombre (producto/paquete).
  - Botones **Retornar a stock** / **Registrar merma** (reusando `handleResolveCancel` y el mismo diálogo de notas que `KdsOrderCard`).
- Mantener el overlay actual dentro de la tarjeta KDS cuando `kds_order_id` coincide con una orden visible (no romper UX existente). Para evitar duplicidad, en el panel sólo mostrar cancelaciones cuyo `kds_order_id` no esté en las órdenes visibles del board.

### 2. Backend: enlace KDS más permisivo (mejor trazabilidad cuando sí existe)

Migración que reemplaza `solicitar_cancelacion_item_sesion(uuid, uuid, integer, text)`:

- Para producto simple: relajar filtro a `ko.estado IN ('pendiente','en_preparacion','listo')` (incluir `listo`); preferir el item con `cancel_qty < cantidad`.
- Para paquete: enlazar `kds_order_id` al KDS más reciente de la sesión (sin `kds_item_id`), si existe alguno en estados activos. Esto permite que aparezca como overlay si la tarjeta sigue en pantalla; si no, el panel del punto 1 lo cubre.

### 3. Realtime y orden

- Reusar el canal `cancelaciones-cocina` ya existente para refrescar el panel.
- Ordenar el panel por `created_at` ascendente y pintar un badge contador en el header del board.

## Detalles técnicos

- No se cambia el esquema (sólo el cuerpo del RPC).
- El componente nuevo puede vivir en `src/components/cocina/CancelacionesPanel.tsx` para mantener `KdsBoard` limpio.
- Tipos: extender `KdsItemCancelacion` con `session_id`, `cliente_nombre?`, `area_nombre?`, `created_at`.

## Fuera de alcance

- Cancelaciones desde POS (ventas no-coworking) usan `solicitudes_cancelacion` a nivel venta completa y hoy no envían señal a cocina; eso requeriría un flujo nuevo (item-level en POS) y se trataría por separado si lo confirmas.

## Verificación

1. Cancelar un paquete en sesión activa → aparece en panel con cliente/área, retornar a stock funciona.
2. Cancelar un producto simple cuya KDS está en "listo" → aparece en panel.
3. Cancelar un producto simple cuya KDS sigue en "pendiente" → aparece como overlay en la tarjeta (comportamiento actual).
4. Resolver cancelación → desaparece del panel y de la tarjeta en realtime.
