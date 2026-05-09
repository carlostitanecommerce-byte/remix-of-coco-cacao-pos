## Épica 5 · Tarea 5.1 — Descuento atómico de insumos por opciones reales

### Diagnóstico

Tras revisar el flujo actual (`PosPage.tsx` → `cartStore` → `ConfirmVentaDialog.tsx` → RPC `crear_venta_completa` → trigger `descontar_inventario_venta`), **la lógica ya descuenta inventario por la opción real elegida** gracias a Épica 4:

1. Cuando el cajero elige las opciones del paquete dinámico, `PosPage.handlePaqueteConfirm` mapea cada `opcion.producto_id` a un `componente { producto_id, cantidad }` y lo guarda en el `CartItem`.
2. `ConfirmVentaDialog` **no inserta una fila para el "shell" del paquete**. En su lugar expande cada paquete en N filas de `detalle_ventas` con `tipo_concepto='producto'` y el `producto_id` del hijo elegido (con el precio prorrateado y `paquete_id`/`paquete_nombre` para trazabilidad).
3. El trigger `descontar_inventario_venta` corre por cada fila de `detalle_ventas` y consulta `recetas` por el `producto_id` real → descuenta los insumos base correctos (vasos, leche, pan, etc.).
4. La pre-validación `validar_stock_carrito` ya acumula consumo por `producto_id` real (incluyendo el de los componentes de paquetes), así que tampoco hay falsos positivos de stock.

**Conclusión:** la "fuga" que describe la épica no ocurre — el descuento ya es atómico por la elección real. Esta tarea consiste en **endurecer y verificar** ese contrato, no en reescribirlo.

### Cambios propuestos (mínimos, defensivos)

1. **`src/pages/PosPage.tsx` — guardia contra paquetes sin selección:**
   - Si `handlePaqueteConfirm` recibe `opciones` vacío o `componentes` derivados con longitud 0, abortar con toast `"Selecciona al menos una opción del paquete"` (hoy el modal lo bloquea, pero falta cinturón en la capa de carrito).

2. **`src/components/caja/ConfirmVentaDialog.tsx` — validación previa al RPC:**
   - Al recorrer `paqueteItems`, si algún `pq.componentes` está vacío o tiene `producto_id` no-uuid, lanzar error claro (`"El paquete '<nombre>' no tiene opciones válidas"`) y no enviar la venta. Evita insertar un paquete fantasma sin descuento.
   - Confirmar que el `producto_id` del shell del paquete **nunca** entra a `detalle_ventas` (ya es así; solo añadir comentario explicativo y un `assert` defensivo).

3. **Trigger `descontar_inventario_venta` (Supabase) — endurecimiento:**
   - Añadir guardia: si `NEW.producto_id IS NULL` y `tipo_concepto='producto'`, lanzar excepción (`"Detalle de venta sin producto_id"`). Hoy podría pasar silenciosamente.
   - Mantener el comportamiento actual de saltar `tipo_concepto='coworking'` (ya descontó stock al enviar a cocina).
   - No se requiere lógica especial para `tipo_concepto='paquete'` porque ya no se insertan filas con ese tipo desde el POS dinámico.

4. **Prueba manual / QA (sin código):**
   - Crear paquete "Combo Desayuno" con grupo "Bebida" (Café Americano vs Latte) y grupo "Pan".
   - Vender 2 combos eligiendo Latte en uno y Americano en otro.
   - Validar en `insumos`: leche descontada solo 1 vez (no 2), café descontado en ambos, vasos según receta del producto elegido.
   - Validar `detalle_ventas`: 4 filas (2 bebidas + 2 panes) con `paquete_id` y `paquete_nombre` poblados.

### Detalles técnicos

- **Sin migración de schema.** Solo una migración para reemplazar la función trigger `descontar_inventario_venta` con la guardia adicional.
- **Sin cambios en `cartStore`** ni en `PaqueteSelectorDialog`.
- **Sin cambios** en `crear_venta_completa` (sigue recibiendo `p_detalles` con filas ya expandidas desde el cliente).
- Archivos editados: `src/pages/PosPage.tsx`, `src/components/caja/ConfirmVentaDialog.tsx`, una migración SQL para la función trigger.

### Fuera de alcance

- Reescribir el descuento dentro del RPC `crear_venta_completa` para mover la expansión de paquetes al servidor — útil a futuro pero rompe contrato actual y no aporta a esta tarea.
- Cambiar el modelo de `paquete_componentes` legacy.
