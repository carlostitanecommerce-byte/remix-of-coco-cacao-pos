
# Auditoría de Producción — Módulo Inventarios

Veredicto: **NO está listo para producción todavía.** El núcleo funcional es muy sólido (recetas, mermas vía RPC, recálculo automático de costos, validaciones de bloqueos, audit en la mayoría de acciones), pero hay **5 bugs bloqueantes** y **8 mejoras recomendadas** antes del despliegue.

---

## ✅ Lo que ya está sólido

- **Recálculo automático de costos**: trigger `trigger_recalcular_costos_insumo` + función `recalcular_costos_productos` mantienen `costo_total` y `margen` de productos sincronizados al cambiar `costo_unitario` de un insumo.
- **Mermas atómicas vía RPC** (`registrar_merma`): bloquea fila con `FOR UPDATE`, valida stock, descuenta y registra audit en una sola transacción.
- **Auditoría inventario** (`aplicar_auditoria_inventario`): exclusiva admin/supervisor, registra mermas automáticas y diferencias.
- **Compras con trigger `sumar_stock_compra`** que incrementa stock al insertar.
- **Validación de bloqueos al eliminar productos** (`ProductosTab.checkAndPromptDelete`): paquetes, upsells, amenities, sesiones activas.
- **Detección de componentes inactivos en paquetes** con badge visible.
- **Rollback explícito** en `PaquetesTab.handleSave` si falla el insert de componentes (elimina el producto huérfano).
- **Subida de imagen** a bucket `productos` con validación de tipo/tamaño.
- **Audit logs completos** en Insumos, Productos, Paquetes, Compras, Mermas.
- **Recetas exportables a Excel** con costo línea, margen y modo de preparación.
- **Filtros y búsqueda** en Insumos (busqueda + categoría + stock bajo), Productos (busqueda), Paquetes (busqueda), Compras (busqueda + rango de fechas + paginación).
- **Permisos por rol** correctos: Categorías/Insumos/Productos/Paquetes solo admin para escritura; Compras/Mermas restringidos a admin+supervisor.

---

## 🔴 Bugs bloqueantes

### B1. ComprasTab filtra fechas en zona horaria incorrecta (ComprasTab.tsx:88, 91)
```ts
if (fechaDesde) comprasQuery = comprasQuery.gte('fecha', `${fechaDesde}T00:00:00`);
if (fechaHasta) comprasQuery = comprasQuery.lte('fecha', `${fechaHasta}T23:59:59`);
```
Sin sufijo `-06:00`, Supabase interpreta esos timestamps como UTC. Una compra registrada el 5-may a las 23:30 CDMX (= 6-may 05:30 UTC) NO aparece al filtrar "desde 6 de mayo" en CDMX, pero sí aparece como del día 6 en UTC. Viola la regla global del proyecto.
**Fix:** usar `T00:00:00-06:00` y `T23:59:59-06:00` (o helper `toCDMXFilterRange`).

### B2. ProductosTab elimina producto sin verificar ventas históricas (ProductosTab.tsx:266-292)
`checkAndPromptDelete` valida paquetes, upsells, amenities y sesiones activas, pero **no consulta `detalle_ventas` ni `kds_order_items`**. Al borrar un producto que ya fue vendido:
- `detalle_ventas.producto_id` queda apuntando a un UUID inexistente (no hay FK declarada).
- Los reportes de ventas pierden el nombre del producto y `MenuTab` (Menu Engineering) se rompe.

**Fix:** agregar consulta a `detalle_ventas.producto_id` y a `kds_order_items.producto_id`. Si existe historial → bloquear eliminación y proponer "desactivar" (`activo = false`) en su lugar (soft delete), alineado con el principio "nunca borrar registros transaccionales".

### B3. PaquetesTab.handleDelete sin validación de bloqueos (PaquetesTab.tsx:264-281)
A diferencia de `ProductosTab`, el paquete se elimina directo sin verificar si:
- Está referenciado en `detalle_ventas` (`paquete_id`).
- Está activo en alguna sesión coworking o KDS pendiente.

Riesgo: pérdida de datos transaccionales y reportes huérfanos.
**Fix:** replicar el patrón de `checkAndPromptDelete` de `ProductosTab` para paquetes (consultar `detalle_ventas.paquete_id`), bloquear si tiene historial y ofrecer soft delete.

### B4. CategoriasTab sin auditoría y con `confirm()` nativo (CategoriasTab.tsx:58-92)
- **No registra audit_logs** en crear / actualizar / eliminar — viola la regla global de trazabilidad.
- Usa `confirm()` del navegador en lugar de `AlertDialog` — UX inconsistente con el resto del módulo.
- Al eliminar una categoría, los `insumos.categoria` y `productos.categoria` que la referencian quedan con texto huérfano sin advertencia visual al usuario.

**Fix:** agregar inserts a `audit_logs` en las 3 operaciones, reemplazar `confirm()` por `AlertDialog`, y antes de eliminar consultar cuántos insumos/productos usan la categoría y mostrarlo.

### B5. ProductosTab.handleSave no captura errores de receta y deja producto inconsistente (ProductosTab.tsx:211-216)
```ts
await supabase.from('recetas').delete().eq('producto_id', productoId!);
if (receta.length > 0) {
  await supabase.from('recetas').insert(...);  // ← sin captura de error
}
```
Si el `insert` de recetas falla (RLS, conflicto, conexión), el producto queda con `costo_total` y `margen` calculados sobre la receta nueva pero **sin recetas en BD** → al venderse, los triggers de descuento de stock no descuentan nada y los reportes de profitability quedan inconsistentes. Tampoco hay rollback como sí tiene PaquetesTab.

**Fix:** capturar error del insert, hacer rollback (restaurar recetas previas o eliminar producto si era nuevo), y mostrar toast de error.

---

## 🟡 Mejoras recomendadas (no bloquean, pero conviene antes de prod)

### M1. InsumosTab permite editar `stock_actual` libremente sin trazabilidad especial
Cualquier admin puede cambiar `stock_actual` desde el form de edición sin pasar por Compra / Merma / Auditoría. El cambio se guarda en `audit_logs` pero como un "actualizar_insumo" genérico, sin diferencia stock anterior vs nuevo. **Fix:** detectar cambios en `stock_actual` y bloquearlos sugiriendo el flujo correcto (Compra/Merma/Auditoría), o registrarlos como `ajuste_inventario` con metadata explícita.

### M2. ProductosTab.handleImageUpload no limpia imagen anterior del storage
Al cambiar la imagen de un producto, la URL anterior queda huérfana en el bucket `productos`. Después de meses de operación, acumula archivos sin referencia. **Fix:** antes de `setForm`, extraer el path de la URL anterior y llamar `supabase.storage.from('productos').remove([path])`.

### M3. PaquetesTab usa input de URL libre para imagen
Mientras `ProductosTab` tiene upload directo a storage, `PaquetesTab` solo acepta URL externa pegada a mano. Inconsistencia UX y dependencia de hosts externos. **Fix:** replicar el componente de upload de `ProductosTab`.

### M4. MermasTab sin paginación ni filtros
`limit(200)` hardcodeado, sin filtro por fecha / insumo / usuario. En operación de meses se llega rápido a las 200 y solo se ven las últimas. **Fix:** paginación + filtro fecha + buscador insumo (mismo patrón de `ComprasTab`).

### M5. InsumosTab y ProductosTab sin Realtime
Cuando una venta o sesión coworking descuenta stock, las pestañas abiertas no reflejan el cambio hasta recargar. **Fix:** suscripción Supabase Realtime a `insumos` (cambios de `stock_actual`/`costo_unitario`) y a `productos` (cambios de `costo_total`/`margen` por trigger).

### M6. ComprasTab: no permite cancelar/revertir una compra mal capturada
Si se registra una compra con cantidad o costo equivocado, no hay UI para revertirla; el stock ya quedó incrementado por el trigger. **Fix:** botón "Anular compra" (admin-only) que ejecute un RPC `anular_compra_insumo` que reste stock y registre audit.

### M7. ProductosTab.handleSave actualiza `costo_total` con el snapshot del cliente
El cálculo se hace con `insumos` cargados al montar el componente. Si entre la apertura del dialog y el guardado, otro usuario cambió un `costo_unitario`, el producto se guarda con costo desactualizado. El trigger DB lo corrige al siguiente cambio de insumo, pero queda una ventana de inconsistencia. **Fix:** invocar `recalcular_costos_productos(producto_id)` por RPC al final del save, o calcular el costo en BD.

### M8. CategoriasTab no muestra cuántos elementos usan cada categoría
Al ver la lista no se sabe cuáles categorías están en uso. Borrar una categoría poco usada vs una crítica luce igual. **Fix:** columna "En uso" con conteo de insumos + productos.

---

## 🟢 Observaciones menores (post-launch)

- `productos` es bucket público (warning del linter de Supabase ya existente). Como los nombres son `crypto.randomUUID()`, el riesgo de enumeración es bajo, pero conviene moverlo a privado y servir vía signed URL si la operación crece.
- `ProductosTab` tiene 748 líneas — funcional, pero conviene partir el dialog en sub-componentes (`ProductBasicInfo`, `RecipeBuilder`, `MarginPreview`) para mantenibilidad.
- `PaquetesTab` no escucha cambios en `productos.activo`: si un componente se desactiva con el dialog cerrado, hay que re-expandir el paquete para ver el badge "Inactivo".
- `MermaDialog` recibe `stock_actual` como prop estático. El RPC ya valida en BD con `FOR UPDATE`, así que la integridad está garantizada; solo el mensaje de error puede sentirse "tardío".
- `ComprasTab.handleSave` actualiza `insumos.costo_presentacion` opcionalmente, lo cual dispara el trigger de recálculo de costos de productos. Ya cubierto, pero conviene mostrar un toast adicional indicando "N productos recalculados".

---

## Recomendación

**Antes de publicar:** corregir B1, B2, B3, B4, B5 (PR único, ~3-4 h de trabajo). Requiere migración SQL solo para el RPC opcional de M6 (no bloqueante).

**Sprint siguiente:** M1–M5 (M6–M8 pueden esperar).

Si lo apruebas, en build mode implemento los 5 bloqueantes en una sola pasada.
