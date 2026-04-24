

# Plan: Paquetes de Productos en Inventarios + POS

## Objetivo
Permitir crear, editar, duplicar y eliminar **paquetes** (combos) compuestos de productos ya existentes, y venderlos desde el POS descontando correctamente el inventario de los insumos de cada producto componente.

## Decisión de arquitectura

Un paquete **es un producto especial** (`tipo = 'paquete'`) que apunta a uno o más productos hijos. No tiene receta propia. Al venderse, el sistema **expande** el paquete en líneas de detalle por cada producto componente, reutilizando todos los flujos existentes (descuento de inventario por trigger, KDS, reportes, validación de stock).

**Ventaja:** No tocamos el trigger `descontar_inventario_venta` ni la lógica de KDS, reportes o validación. El paquete fluye de manera transparente.

```text
PAQUETE "Combo Desayuno" ($120)
   ├─ 1x Café Americano   → receta → insumos
   ├─ 1x Pan de Chocolate → receta → insumos
   └─ 1x Jugo Natural     → receta → insumos
```

## Cambios en Base de Datos (migración)

1. **`productos`**: añadir columna `tipo text NOT NULL DEFAULT 'simple'` con valores `'simple' | 'paquete'`.
2. **Nueva tabla `paquete_componentes`**:
   - `id uuid PK`
   - `paquete_id uuid` (referencia lógica a `productos.id`, tipo = paquete)
   - `producto_id uuid` (referencia lógica a `productos.id`, tipo = simple)
   - `cantidad numeric NOT NULL DEFAULT 1`
   - `created_at timestamptz`
   - RLS: SELECT a `authenticated`; ALL a `administrador`.
3. **`detalle_ventas`**: añadir columnas opcionales para trazabilidad de paquete:
   - `paquete_id uuid NULL` — cuando esta línea es un componente expandido de un paquete
   - `paquete_nombre text NULL`
   - El trigger `descontar_inventario_venta` sigue funcionando idéntico porque cada línea sigue teniendo su `producto_id` real.
4. **Función `validar_stock_paquete(p_paquete_id, p_cantidad)`** (security definer): itera componentes y reusa la lógica de `validar_stock_disponible` por cada componente; devuelve `{valido, error}` con el primer faltante.

## Cambios en el módulo Inventarios

### Nueva pestaña "Paquetes" (`src/pages/InventariosPage.tsx`)
- Añadir `<TabsTrigger value="paquetes">Paquetes</TabsTrigger>` y su `<TabsContent>`.
- Visible para admin y supervisor (mismo gating que Compras).

### Nuevo componente `src/components/inventarios/PaquetesTab.tsx`
Estructura calcada de `ProductosTab.tsx` para mantener consistencia visual y de UX:

- **Tabla principal** con columnas: Nombre · Categoría · Precio venta · Costo (suma de costos de componentes) · Margen · Componentes (expandible) · Acciones.
- **Búsqueda en tiempo real** y filtro por categoría.
- **Acciones**: Nuevo, Editar, Duplicar (con audit_log "duplicar_paquete"), Eliminar.
- **Diálogo de edición** con:
  - Datos generales: nombre, categoría, precio_venta, imagen_url, instrucciones (opcional).
  - **Constructor de componentes**: dropdown con productos `tipo='simple'` activos + input de cantidad + botón añadir. Lista debajo con eliminar línea.
  - **Cálculo en vivo**: costo_total = Σ (componente.costo_total × cantidad); margen con código de color (verde/amarillo/rojo).
  - Validaciones: nombre obligatorio, mínimo 1 componente, no permitir agregar el mismo producto dos veces (sumar cantidad si ya existe).
- **Persistencia**:
  - Insert/update en `productos` con `tipo='paquete'` y `costo_total`/`margen` calculados.
  - Borrar y reinsertar `paquete_componentes`.
  - Audit log: `crear_paquete` / `actualizar_paquete` / `eliminar_paquete`.

### Aislar productos simples en otras vistas
- En `ProductosTab.tsx`: filtrar consultas con `.eq('tipo', 'simple')` para no mezclar paquetes.
- En `useCategorias` y demás: sin cambios.

## Cambios en el POS

### `ProductGrid.tsx`
- Cambiar query a `select('id, nombre, categoria, precio_venta, precio_upsell_coworking, activo, tipo').eq('activo', true)`.
- Añadir badge visual "📦 Paquete" en filas con `tipo='paquete'`.
- Pestañas de categoría incluyen automáticamente las categorías de paquetes.

### `types.ts` (CartItem)
- Añadir `tipo_concepto: 'producto' | 'coworking' | 'amenity' | 'paquete'`.
- Añadir campos opcionales: `paquete_id?: string`, `componentes?: Array<{producto_id, nombre, cantidad}>` para trazabilidad en el carrito.

### `PosPage.tsx` — `addProduct`
1. Si `producto.tipo === 'paquete'`:
   - Cargar componentes desde `paquete_componentes` con join a `productos` (id, nombre).
   - Validar stock llamando a `validar_stock_paquete` RPC.
   - Insertar **una sola línea visual** en el carrito con `tipo_concepto='paquete'`, `paquete_id`, precio total del paquete y array `componentes`.
2. Si `tipo === 'simple'`: comportamiento actual (sin cambios).
3. Bloquear precio especial / promoción para paquetes en esta primera versión (el menú de estrella solo aparece para simples).

### `CartPanel.tsx`
- Renderizar paquetes en una sección propia con badge "📦 Paquetes".
- Mostrar componentes como sub-líneas indentadas (solo lectura).
- Cantidad +/- aplica al paquete completo (multiplica componentes al confirmar).
- Eliminar borra la línea entera.

### `ConfirmVentaDialog.tsx` — pre-validación y persistencia

**Pre-validación de stock (paquetes):** además del cálculo actual, sumar al `requiredByInsumo` los insumos de los componentes de cada paquete (cantidad_paquete × cantidad_componente × cantidad_componente_receta).

**Inserción en `detalle_ventas`:** cuando una línea del carrito es paquete, **expandirla en N líneas**:
- Cada línea componente tiene:
  - `producto_id` = id real del producto componente (clave para que el trigger descuente inventario)
  - `cantidad` = cantidad_paquete × cantidad_componente
  - `precio_unitario` = 0 (el cobro va prorrateado en una línea adicional, ver abajo) **o** se prorratea proporcionalmente al costo
  - `subtotal` proporcional
  - `paquete_id` y `paquete_nombre` para trazabilidad
  - `tipo_concepto` = `'producto'` (para que el trigger actúe normal)
- **Estrategia de prorrateo recomendada (más limpia para reportes):** distribuir `precio_paquete` entre componentes proporcionalmente al `costo_total` de cada uno; la suma debe coincidir con el precio del paquete (ajustar el último para evitar errores de redondeo).

**KDS:** los items componentes se insertan como antes en `kds_order_items`; opcionalmente prefijar `nombre_producto` con "📦 [Combo]" para que cocina identifique que vienen de un paquete.

**Audit log:** registrar `venta_paquete` con metadata `{paquete_id, componentes, cantidad}`.

## Reportes
- `reportes/MenuTab.tsx` y demás se basan en `detalle_ventas` con `producto_id` real → siguen funcionando para análisis de insumos y popularidad de productos.
- Para análisis específico de paquetes se puede agrupar por `paquete_id` en una iteración futura (no incluido aquí).

## Plan de tareas (orden de ejecución)

1. Migración SQL: columna `productos.tipo`, tabla `paquete_componentes` con RLS, columnas `paquete_id`/`paquete_nombre` en `detalle_ventas`, función `validar_stock_paquete`. Backfill `productos.tipo='simple'` para registros existentes.
2. Filtrar `tipo='simple'` en `ProductosTab.tsx`, `useCategorias` y consultas existentes que no deban mezclar paquetes.
3. Crear `PaquetesTab.tsx` con CRUD completo (crear, editar, duplicar, eliminar, expandir componentes) y registrarlo en `InventariosPage.tsx`.
4. Extender `CartItem` y `ProductGrid` para reconocer paquetes.
5. Adaptar `addProduct` en `PosPage.tsx`: cargar componentes, validar stock con RPC, insertar línea de paquete.
6. Renderizado de paquetes en `CartPanel.tsx` (sección + sub-líneas).
7. Adaptar `ConfirmVentaDialog.tsx`: pre-validación con componentes, expansión a `detalle_ventas` con prorrateo de precio, KDS, audit log.
8. Smoke test end-to-end: crear paquete → venderlo → verificar descuento de stock por componente, ticket correcto, KDS muestra cada componente, reportes consistentes.

