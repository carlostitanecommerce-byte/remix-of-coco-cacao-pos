## Épica 4: RPC transaccional `registrar_consumo_coworking`

### Diagnóstico

En la Épica 3 dejamos funcionando el flujo desde el cliente, pero quedan dos problemas que esta épica resuelve:

1. **Inventario no se descuenta.** El trigger `descontar_inventario_venta` tiene un guard `IF NEW.venta_id IS NULL THEN RETURN NEW;` — pensado para que las líneas abiertas no toquen stock hasta cobrar. Para "Cuenta Abierta" eso es incorrecto: el cliente ya consumió, el inventario debe bajar al momento.
2. **Atomicidad.** Hoy desde el cliente hacemos: validar stock → insertar detalles → crear KDS → audit log. Si KDS falla, el detalle ya quedó insertado. Necesitamos una sola RPC transaccional.

### Cambios

**1. Migración SQL — nueva función `registrar_consumo_coworking`**

```text
registrar_consumo_coworking(
  p_session_id uuid,
  p_items jsonb,         -- [{producto_id, paquete_id?, paquete_nombre?, tipo_concepto,
                         --   cantidad, precio_unitario, subtotal, descripcion?,
                         --   componentes?: [{producto_id, cantidad}]}]
  p_kds_items jsonb      -- [{producto_id, nombre, cantidad, notas?, is_amenity?}]
) RETURNS json
```

Lógica (toda dentro de una transacción Postgres, `SECURITY DEFINER`, `search_path=public`):

1. Validar `auth.uid()` y rol (administrador / caja / recepcion / supervisor).
2. Validar que la sesión existe y está en estado `activo` o `pendiente_pago`.
3. Para cada ítem `producto`: ejecutar `validar_stock_disponible` (ya considera consumos comprometidos). Para `paquete`: `validar_stock_paquete`. Si alguno falla → `RAISE EXCEPTION` (rollback).
4. Insertar las filas en `detalle_ventas` con `venta_id = NULL`, `coworking_session_id = p_session_id`, `tipo_concepto`, `paquete_id`, etc.
5. **Descontar inventario manualmente** recorriendo `recetas`:
   - Productos simples → `UPDATE insumos SET stock_actual = stock_actual - (cantidad_necesaria * cantidad)`.
   - Paquetes → expandir `componentes` (si vienen) o `paquete_componentes` y descontar igual.
   - Si algún `stock_actual` queda < 0 → `RAISE EXCEPTION` (rollback completo).
6. Crear orden KDS:
   - `next_kds_coworking_folio()` para folio.
   - `INSERT INTO kds_orders (venta_id NULL, coworking_session_id, folio, tipo_consumo='sitio', estado='pendiente')`.
   - `INSERT INTO kds_order_items` filtrando productos con `requiere_preparacion = false`. Etiquetado: `"<nombre> (coworking — <cliente>)"` igual que hoy hace `enviarASesionKDS`.
7. `INSERT INTO audit_logs` con acción `coworking_open_account_charge` y metadata (`session_id`, `total`, `lineas`, `kds_order_id`, `kds_folio`, `transaccional: true`).
8. Devolver `{ ok: true, kds_order_id, kds_folio, lineas_insertadas, total }`.

Notas de la migración:

- **No tocar el trigger `descontar_inventario_venta`** — sigue siendo correcto para el flujo POS normal y para cuando, en una épica futura, hagamos UPDATE de `venta_id` al cobrar (ya no debe descontar dos veces; manejamos eso cuando llegue esa épica).
- Permisos GRANT EXECUTE a `authenticated`.

**2. `src/pages/PosPage.tsx` — reemplazar `chargeToOpenAccount` cliente por llamada RPC**

Reemplazar el bloque que hace `validar stock × N → insert × N → enviarASesionKDS → audit` por una sola llamada:

```ts
const { data, error } = await supabase.rpc('registrar_consumo_coworking', {
  p_session_id: coworkingSessionId,
  p_items: items.map(it => ({
    producto_id: it.producto_id,
    paquete_id: it.tipo_concepto === 'paquete' ? (it.paquete_id ?? it.producto_id) : null,
    paquete_nombre: it.tipo_concepto === 'paquete' ? it.nombre.replace(/^📦\s*/, '') : null,
    tipo_concepto: it.tipo_concepto,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    subtotal: it.subtotal,
    descripcion: it.notas ?? null,
    componentes: it.componentes ?? null,
  })),
  p_kds_items: items.flatMap(it =>
    it.tipo_concepto === 'paquete' && it.componentes
      ? it.componentes.map(c => ({ producto_id: c.producto_id, nombre: c.nombre, cantidad: c.cantidad * it.cantidad, notas: it.notas ?? null }))
      : [{ producto_id: it.producto_id, nombre: it.nombre, cantidad: it.cantidad, notas: it.notas ?? null }]
  ),
});
```

Si `error` → `toast.error(error.message)` y NO limpiar carrito. Si éxito → `toast.success('Consumos cargados a la cuenta de <cliente>')`, `clear()`, `navigate('/coworking')`.

Mantener el loading state `charging` y el `disabled` del botón.

### Fuera de alcance (siguientes épicas)

- Checkout final (UPDATE `venta_id` cuando pague en Caja) sin doble descuento de inventario.
- Eliminar `coworking_session_upsells` y migrar amenities a `detalle_ventas`.
- Actualizar `validar_stock_disponible` para considerar líneas de `detalle_ventas` con `venta_id IS NULL` además de `coworking_session_upsells` (hoy sólo mira upsells). Esto se vuelve crítico cuando la épica de migración de amenities esté lista.

### Detalles técnicos

- La RPC nunca devuelve UUIDs en mensajes de error; usa nombres (insumo, producto) — sigue la memoria `database-error-handling`.
- Audit log incluye `transaccional: true` para que la bitácora la marque como acción de sistema.
- Si la sesión no tiene KDS items (todo `requiere_preparacion = false`), no se crea orden KDS pero el cargo sí se inserta. La RPC debe tolerar eso devolviendo `kds_order_id: null`.
- Realtime: `kds_orders` ya está en `supabase_realtime`, así que la pantalla de cocina recibe el push automáticamente.
