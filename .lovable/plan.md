# Auditoría End-to-End — Módulo Inventarios

## Veredicto general

**Estado: Funcional y bien estructurado, pero NO production-ready al 100%.** Hay 4 hallazgos de severidad media/alta que deben resolverse antes de operar en producción. El resto son pulidos de UX y consistencia.

Cobertura revisada: `InventariosPage`, `CategoriasTab`, `InsumosTab`, `ProductosTab`, `PaquetesTab`, `ComprasTab`, `MermaDialog`, `MermasTab`, triggers (`descontar_inventario_venta`, `sumar_stock_compra`, `reintegrar_inventario_cancelacion`), validadores (`validar_stock_carrito`, `validar_stock_disponible`, `validar_stock_paquete`) y RLS.

---

## Lo que funciona profesionalmente

- **Cálculo de costos y márgenes en tiempo real** con preview de margen público y de upsell.
- **Validación de stock comprometido** por sesiones de coworking activas (`validar_stock_carrito` lo descuenta correctamente).
- **Trigger atómico** `descontar_inventario_venta` con excepción si stock < 0.
- **Reintegro automático** al cancelar venta (`reintegrar_inventario_cancelacion`).
- **Bitácora exhaustiva**: cada CRUD de insumo/producto/paquete/compra/merma queda en `audit_logs`.
- **Bloqueo de borrado** de productos usados en paquetes (con nombres del paquete dependiente).
- **Detección de componentes inactivos** dentro de paquetes (badge rojo + bloqueo al guardar).
- **Buscadores y filtros** (búsqueda por nombre, filtro por categoría, toggle stock bajo).
- **Duplicación** de insumos, productos y paquetes con audit log.
- **Exportación a Excel** del recetario completo con costos y margen.
- **Costo unitario auto-calculado** al registrar compras y opción de actualizar costo del insumo.
- **RLS correcta**: solo admin escribe; lectura para autenticados; supervisores/admin ven mermas.

---

## Hallazgos críticos a resolver

### 🔴 Alto — Race condition al registrar mermas
`MermaDialog.tsx` lee `stock_actual` del cliente y hace `UPDATE insumos SET stock_actual = X - cantidad`. Si dos mermas se registran simultáneamente, una sobreescribe la otra. **Fix:** crear RPC `registrar_merma(p_insumo_id, p_cantidad, p_motivo)` con SECURITY DEFINER que en una transacción inserte la merma, descuente stock con `stock_actual - p_cantidad` (operación atómica de SQL) y valide que no quede negativo.

### 🔴 Alto — Borrado de producto sin verificar sesiones coworking activas
`ProductosTab.handleDelete` solo bloquea si el producto está en paquetes. Si está como **upsell de tarifa** (`tarifa_upsells`), **amenity incluido** (`tarifa_amenities_incluidos`) o **upsell activo en sesión** (`coworking_session_upsells`), se elimina y rompe referencias. **Fix:** validar también esas tres tablas antes de borrar.

### 🟠 Medio — `handleDelete` de productos usa `confirm()` nativo
Inconsistente con el resto de la app que usa `AlertDialog`. UX poco profesional en kiosko/tablet. **Fix:** migrar a `AlertDialog`.

### 🟠 Medio — `ComprasTab` permite registrar a cualquier autenticado
La tabla `compras_insumos` solo bloquea por `auth.uid() = usuario_id` (cualquier usuario logueado puede insertar). El frontend solo muestra el tab a admin/supervisor, pero la API queda abierta a `caja`/`recepcion`/`barista`. **Fix:** endurecer RLS de INSERT en `compras_insumos` exigiendo rol admin o supervisor.

### 🟠 Medio — `MermasTab` huérfano
El componente existe (93 líneas) pero **no está montado** en `InventariosPage`. El historial de mermas vive solo en Reportes. Decidir: borrarlo o agregarlo como sub-tab dentro de Inventarios para tener todo el ciclo de inventario en un solo lugar.

### 🟡 Bajo — Recálculo de `costo_total` y `margen` en productos
Cuando se actualiza el `costo_unitario` de un insumo (vía edición o vía compra con "Actualizar costo"), los productos que lo usan **no recalculan** su `costo_total` ni `margen` almacenados. El cálculo en pantalla se hace al vuelo desde recetas, pero los reportes y la tabla `productos.costo_total` quedan desactualizados hasta que alguien re-edite el producto. **Fix:** RPC `recalcular_costos_productos(p_insumo_id)` invocada al guardar costo de insumo o al confirmar compra con actualización.

### 🟡 Bajo — `ProductosTab` usa `<></>` en vez de `<Fragment key>` dentro del `.map`
React lanza warning de key duplicada porque el Fragment vacío no acepta `key`. `PaquetesTab` ya lo hace bien con `Fragment`.

### 🟡 Bajo — No hay validación en frontend de unicidad de nombre de insumo/producto
Permite crear "Cacao 70%" duplicado. Solo se previene en el cálculo de uso. Agregar índice único en `insumos.nombre` + manejo de error amigable.

### 🟡 Bajo — `ComprasTab` no tiene paginación
Carga las últimas 200 compras hardcoded. Para producción a mediano plazo necesita paginación o filtro por rango de fechas.

### 🟡 Bajo — Eliminación de categoría no actualiza insumos/productos
Al borrar una categoría, los insumos/productos quedan con un texto que ya no aparece en el dropdown. La advertencia en el `confirm()` lo menciona, pero no hay forma de re-asignar masivamente.

---

## Plan de remediación recomendado

Si apruebas, ejecutaré las correcciones en este orden:

**Fase G1 — Integridad (críticos rojos)**
1. RPC `registrar_merma` atómica + refactor de `MermaDialog`.
2. Extender validación de borrado de producto (tarifa_upsells, tarifa_amenities_incluidos, coworking_session_upsells activos).
3. Migrar `handleDelete` de productos a `AlertDialog`.
4. Endurecer RLS de `compras_insumos` (solo admin/supervisor pueden INSERT).

**Fase G2 — Consistencia (medios/bajos)**
5. Decidir destino de `MermasTab` (montar como tab o eliminar archivo).
6. RPC `recalcular_costos_productos` y disparar al actualizar costo de insumo / al guardar compra con "actualizar costo".
7. Fix de Fragment con key en `ProductosTab`.
8. Índice único `insumos.nombre` + mensaje amigable.
9. Filtro de fechas + paginación en `ComprasTab`.

**Tiempo estimado:** Fase G1 ~30 min, Fase G2 ~25 min.

---

## Detalle técnico (referencia rápida)

```text
Archivos con cambios previstos:
  src/components/inventarios/MermaDialog.tsx          (RPC)
  src/components/inventarios/ProductosTab.tsx         (AlertDialog + Fragment + validaciones extra)
  src/components/inventarios/InventariosPage.tsx      (decisión MermasTab)
  src/components/inventarios/ComprasTab.tsx           (paginación + filtro fecha)
  src/components/inventarios/InsumosTab.tsx           (manejo error unique)
  + 2 migraciones SQL:
      - registrar_merma(...) RPC
      - recalcular_costos_productos(insumo_id) RPC
      - RLS UPDATE compras_insumos
      - UNIQUE INDEX insumos(nombre)
```

¿Apruebas ejecutar la Fase G1 (críticos), G1+G2 completa, o solo un subconjunto específico?
