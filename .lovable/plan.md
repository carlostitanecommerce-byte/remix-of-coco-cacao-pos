

# Plan: Corrección de errores en Paquetes (v2)

## Aclaración de alcance
**Los paquetes son exclusivos para venta directa al público en el POS.** No deben aparecer en ningún flujo de Coworking (amenities de tarifa, upsells de sesión, check-in). Esto refuerza la necesidad de filtrar `tipo='simple'` en todos los selectores de productos del módulo de coworking.

---

## Bugs a corregir

### 🔴 B1 — Paquetes contaminan selectores de Coworking
Hoy `CheckInDialog.tsx`, `TarifasConfig.tsx` y cualquier otro selector de productos del módulo de coworking consultan `productos` sin filtrar por tipo. Esto permitiría seleccionar un paquete como amenity / upsell, y al consumirse en sesión **no descontaría inventario** (los paquetes no tienen receta directa).
**Fix:** agregar `.eq('tipo', 'simple')` en todas las consultas de productos dentro de `src/components/coworking/*` y `src/pages/CoworkingPage.tsx`. Auditar también `ManageSessionAccountDialog.tsx` y cualquier otro sitio donde se listen productos para sesiones.

### 🔴 B2 — Reportes incluyen paquetes como producto vendible huérfano
`MenuTab.tsx` y posibles `GeneralTab.tsx` / `InventarioTab.tsx` leen `productos` sin filtrar. Como las ventas se persisten expandidas en componentes simples, el paquete aparece con 0 ventas distorsionando popularidad/rentabilidad.
**Fix:** filtrar `tipo='simple'` en consultas de catálogo de productos en reportes.

### 🔴 B3 — Clave React duplicada en filas expandidas
`PaquetesTab.tsx` usa `<>...</>` con dos `<TableRow>` internos sin key en el Fragment.
**Fix:** usar `<Fragment key={p.id}>` explícito.

### 🔴 B4 — Componente eliminado/desactivado rompe la venta
Si un producto componente se desactiva tras crear el paquete, la venta falla con mensaje técnico.
**Fix:**
- En `PaquetesTab` mostrar badge "⚠ Componente inactivo" cuando aplique.
- En `addProduct` (POS) prevalidar componentes y abortar con toast claro.
- En `ProductosTab` bloquear eliminación de productos simples que estén en algún paquete (con mensaje listando paquetes afectados).

### 🔴 B5 — Cantidades decimales en componentes desincronizan validación y descuento
`paquete_componentes.cantidad` es `numeric` pero `detalle_ventas.cantidad` es `integer`. Decimales generan truncado silencioso.
**Fix:** forzar enteros (`type=number step=1 min=1`) en el constructor de paquetes y validación al guardar. Ajustar RPC para asumir enteros.

### 🔴 B6 — Prorrateo puede generar `precio_unitario` negativo
En paquetes promocionales (precio < suma de costos), el ajuste de centavos del último componente puede quedar negativo.
**Fix:** en `ConfirmVentaDialog.tsx` validar `precios[i] >= 0` y redistribuir si negativo.

---

## Mejoras de robustez

### 🟡 M1 — CHECK constraint en `productos.tipo`
Agregar `CHECK (tipo IN ('simple','paquete'))` y backfill defensivo.

### 🟡 M2 — Reemplazar `window.confirm` por `AlertDialog`
`PaquetesTab.tsx` usa `confirm()` nativo, inconsistente con el resto del app.

### 🟡 M3 — Atomicidad en `handleSave`
Si falla la inserción de `paquete_componentes` tras crear el producto, queda un paquete vacío.
**Fix:** rollback eliminando el producto recién creado si falla la inserción de componentes.

---

## Cambios concretos (orden de ejecución)

1. **Migración SQL**:
   - `ALTER TABLE productos ADD CONSTRAINT productos_tipo_check CHECK (tipo IN ('simple','paquete'));`
   - Backfill: `UPDATE productos SET tipo='simple' WHERE tipo IS NULL OR tipo NOT IN ('simple','paquete');`
   - Refactorizar `validar_stock_paquete` para asumir cantidades enteras.

2. **Aislar paquetes en Coworking** (regla de negocio: paquetes solo POS):
   - `src/components/coworking/CheckInDialog.tsx` → `.eq('tipo','simple')` en consulta de productos.
   - `src/components/coworking/TarifasConfig.tsx` → `.eq('tipo','simple')` en consulta de productos.
   - `src/components/coworking/ManageSessionAccountDialog.tsx` → `.eq('tipo','simple')` si lista productos.
   - Auditar `src/components/coworking/ConfiguracionTab.tsx` y `useCoworkingData.ts` por consultas similares.

3. **Aislar paquetes en Reportes**:
   - `src/components/reportes/MenuTab.tsx` → `.eq('tipo','simple')`.
   - Revisar `GeneralTab.tsx` e `InventarioTab.tsx` por coherencia.

4. **`PaquetesTab.tsx`**:
   - Importar `Fragment` y reemplazar `<>` por `<Fragment key={p.id}>`.
   - Forzar `cantidad` entera en `newLine` y `addLine`.
   - Reemplazar `confirm()` por `AlertDialog` shadcn para eliminar.
   - Mostrar badge "⚠ Componente inactivo" cuando `loadComponentes` devuelva `producto: null`.
   - Rollback del producto si falla la inserción de componentes.

5. **`ProductosTab.tsx`**:
   - Antes de eliminar un producto simple, consultar `paquete_componentes` por `producto_id`. Si hay coincidencias, bloquear con mensaje listando los paquetes afectados.

6. **`PosPage.tsx` `addProduct`**:
   - Prevalidar que todos los `componentes[].productos` no sean null antes de añadir al carrito; sino toast: "Paquete con componentes inválidos, contacta al administrador".

7. **`ConfirmVentaDialog.tsx`**:
   - Validar `precios[i] >= 0` después del ajuste de centavos; redistribuir si negativo.
   - `Math.round` defensivo en `cantidad` de líneas expandidas.

8. **Smoke test end-to-end**:
   - Crear paquete con 3 componentes, vender 2 unidades → verificar `detalle_ventas` (3 filas con `paquete_id`, cantidades correctas), descuento de stock por componente, KDS muestra los 3 componentes, reporte Menú no incluye paquete huérfano.
   - Confirmar que **paquetes NO aparecen** en check-in de coworking, en upsells de tarifa, ni en gestión de cuenta de sesión.
   - Intentar agregar paquete con componente desactivado → debe abortar con toast claro.
   - Intentar eliminar producto simple en uso por paquete → debe bloquearse con mensaje informativo.

