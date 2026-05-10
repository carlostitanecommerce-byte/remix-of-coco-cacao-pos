# Permitir solicitar cancelación de items (productos y amenities) desde Gestionar Cuenta

## Contexto

El backend ya tiene todo el flujo de cancelación por item con trazabilidad:

- Tabla `cancelaciones_items_sesion` (estado `pendiente_decision` por defecto).
- Realtime ya conectado en `ManageSessionAccountDialog` (la columna `pendingCancelQty` se actualiza sola).
- `CocinaPage` lista las cancelaciones y resuelve con `resolver_cancelacion_item_sesion(p_decision = 'retornado_stock' | 'merma' | 'rechazado')`, que:
  - Devuelve insumos a stock o registra merma según receta (productos simples y paquetes).
  - Reduce / borra la línea de `detalle_ventas` para que ya no se cobre en POS.
  - Ajusta `kds_order_items` cuando hay vínculo.
  - Inserta `audit_logs`.

Falta (a) la UI para que el cajero/recepción solicite la cancelación desde el diálogo "Cuenta de la sesión" y (b) un RPC que encapsule la creación de la solicitud (en lugar de hacer un INSERT directo desde el frontend).

## Cambios

### 1. Migración SQL — nuevo RPC `solicitar_cancelacion_item_sesion`

`SECURITY DEFINER`, `search_path = public`, parámetros:
`p_session_id uuid`, `p_detalle_id uuid`, `p_cantidad integer`, `p_motivo text`.

Lógica:
1. `auth.uid()` → `v_user`; rechazar si NULL.
2. Validar que `p_motivo` no esté vacío y que `p_cantidad >= 1`.
3. `SELECT FOR UPDATE` sobre `detalle_ventas` filtrando `id = p_detalle_id`, `coworking_session_id = p_session_id` y `venta_id IS NULL`. Si no existe → error legible "Línea no encontrada o ya facturada".
4. Validar que `p_cantidad <= cantidad - SUM(cantidad pendientes ya creadas para este detalle_id en estado pendiente_decision)`; si excede → error.
5. Buscar opcionalmente el `kds_order_items` abierto que corresponda: por `producto_id` + `coworking_session_id` (vía join con `kds_orders`) y `kds_orders.estado <> 'listo'`, último creado. Capturar `kds_order_id` y `kds_item_id` (pueden quedar NULL).
6. `INSERT` en `cancelaciones_items_sesion` con `session_id`, `detalle_id`, `producto_id`, `nombre_producto`, `cantidad`, `motivo`, `solicitante_id = v_user`, `kds_order_id`, `kds_item_id`. Estado queda en `pendiente_decision` por default.
7. `INSERT` en `audit_logs` con acción `solicitar_cancelacion_item_sesion` y metadata (cancelacion_id, detalle_id, cantidad).
8. Retorna `json_build_object('ok', true, 'cancelacion_id', v_id)`.

`GRANT EXECUTE` al rol `authenticated`.

### 2. UI — `src/components/coworking/ManageSessionAccountDialog.tsx`

1. **Botón "Cancelar" por línea** en cada item del listado "Estado de la Cuenta" (productos y amenities por igual). Se deshabilita cuando `pendingCancelQty >= item.cantidad`.

2. **Diálogo de confirmación** (`AlertDialog` o subcomponente) que pide:
   - **Cantidad a cancelar** (input numérico, default `item.cantidad - pendingCancelQty`, máximo el mismo valor).
   - **Motivo** (textarea obligatorio, mínimo 4 caracteres).
   - Aviso: "La cocina decidirá si los insumos se devuelven al stock o se registran como merma".

3. **Acción al confirmar** (envuelta en `withLock`):
   - Llamar `supabase.rpc('solicitar_cancelacion_item_sesion', { p_session_id, p_detalle_id, p_cantidad, p_motivo })`.
   - Toast "Solicitud enviada a cocina" y refrescar (Realtime ya marca `pendingCancelQty`).

4. Mantener el indicador existente `Cancelación pendiente (n)` y añadir un texto pequeño en el footer: "Las cancelaciones se envían a cocina para registrar merma o devolver al stock antes del cobro en POS."

## Validación

- Cargar una sesión con productos y un amenity reclamado.
- Cancelar un amenity (motivo + cantidad) → verificar `cancelaciones_items_sesion` insertada vía RPC y badge "Cancelación pendiente" visible.
- En `Cocina`, resolver como **merma** → la línea desaparece de la cuenta y se crea registro en `mermas`.
- Repetir con un producto cobrable resolviendo como **retornado_stock** → línea reducida/eliminada y `insumos.stock_actual` aumentado.
- Confirmar que al pasar a POS la sesión ya no incluye los items cancelados.
- Probar caso de error: solicitar cantidad mayor a la disponible → el RPC rechaza con mensaje legible.
