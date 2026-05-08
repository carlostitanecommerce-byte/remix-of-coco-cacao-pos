## Objetivo

Convertir el POS en una vista puramente de "armado de ticket": solo categorías + grid de productos + ticket en vivo. Sin sesiones de coworking pendientes, sin método de pago, sin propina, sin pago mixto, sin botón "Procesar Venta", sin solicitudes de cancelación. El ticket se mantiene visualmente para que el usuario vea lo que va agregando.

## Cambios

### 1. `src/pages/PosPage.tsx` — eliminar pago y coworking del POS

Eliminar:
- Imports de `CoworkingSessionSelector`, `ConfirmVentaDialog`, `SolicitudesCancelacionPanel`, `useVentaConfig`, `MixedPayment`, `VentaSummary`, `useSearchParams`.
- Estados: `metodoPago`, `tipoConsumo`, `mixedPayment`, `propina`, `propinaEnDigital`, `summary`, `importedSessionId`, `originalSessionItems`, `pendingSessionId`, `searchParams`.
- Funciones: `handleImportSession`, `handleConfirm`, `handleSuccess`, `handleRestoreItem`, `missingImportedItems`, todo el `useEffect` del query param `session`.
- En `addProduct`: eliminar la lógica de auditoría `audit_logs` para precios especiales/promoción (es parte del flujo de venta; al no haber venta, no aplica). Mantener solo el cálculo de precio según `tipoPrecio`.
- En `updateQty` y `removeItem`: eliminar las ramas que tocan `coworking_session_upsells` (ya no se importan sesiones).
- En `handleClearCart`: eliminar la restauración de upsells; queda solo `setItems([])`, `setPropina(0)` (eliminar también), `setKey(k => k + 1)`.
- `roles`, `isAdmin`, `canUseSpecialPrice`: revisar — `canUseSpecialPrice` se mantiene si seguimos permitiendo aplicar precio especial/promo manual al armar ticket; si no hay venta, propongo eliminarlos también junto con el dropdown de la tarjeta. Plan: **eliminar** `canUseSpecialPrice` y simplificar.

Layout final:
```text
<div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
  <div className="lg:col-span-3">
    <ProductGrid onAdd={addProduct} />
  </div>
  <div className="lg:col-span-2 border rounded-lg p-4 bg-card">
    <CartPanel items={items} onUpdateQty={...} onUpdateNotas={...} onRemove={...} onClear={handleClearCart} subtotal={subtotal} />
  </div>
</div>
```

### 2. `src/components/pos/CartPanel.tsx` — ticket de solo lectura/armado

Eliminar de la interfaz `Props` y del render:
- `metodoPago`, `tipoConsumo`, `mixedPayment`, `propina`, `propinaEnDigital` y todos sus setters.
- `onConfirm`, `comisionPct`, `missingImportedItems`, `onRestoreItem`.
- Todo el bloque "Método de pago / Tipo de consumo" (Selects).
- Todo el bloque "Propina" (input + botones 10/15/Limpiar + checkbox digital).
- Todo el bloque "Desglose de pago mixto".
- Bloque de "Consumos de sesión omitidos" (missingImportedItems).
- Botón "Procesar Venta".
- Filtros `coworkingItems` y `amenityItems` (ya no llegarán al carrito porque se quita el import de sesiones). Mantener solo `productoItems` y `paqueteItems` agrupados.
- Imports no usados: `Select*`, `Input`, `Checkbox`, `Label` (si no lo usa el NotesPopover — lo mantiene), `Coffee`, `Users`, `RotateCcw`, iconos huérfanos.

Mantener:
- Header "Ticket" con `ShoppingCart` y botón "Limpiar".
- Lista de items con `+`/`-`, cantidad, subtotal, notas (`NotesPopover`), eliminar.
- Sección de totales simplificada al final:
  ```text
  Subtotal: $X.XX
  Total:    $X.XX  (mismo subtotal, sin propina/comisión)
  ```
- Mensaje "Agrega productos al ticket" cuando está vacío.

### 3. `src/components/pos/ProductGrid.tsx` — quitar dropdown de precios especiales

- Eliminar el `DropdownMenu` flotante de la estrella (Precio Especial / Promoción) y el prop `canUseSpecialPrice`. La tarjeta queda 100% clickeable → `onAdd(p)` con precio normal.
- Eliminar imports no usados (`DropdownMenu*`, `Star`).

### 4. Archivos que dejan de usarse desde POS (no se eliminan del proyecto)

Quedan en el repo por si se reutilizan en otra pantalla, pero ya no se importan desde `PosPage`:
- `CoworkingSessionSelector.tsx`
- `ConfirmVentaDialog.tsx`
- `SolicitudesCancelacionPanel.tsx`
- `CambiarMetodoPagoDialog.tsx`
- `CancelVentaDialog.tsx`
- `TicketReimprimirDialog.tsx`
- `MovimientosCajaPanel.tsx`
- `VentasTurnoPanel.tsx`
- `useVentaConfig.ts`

No los borro en este cambio para no romper otras vistas (Reportes, Coworking) que puedan referenciarlos. Si quieres, en un siguiente paso hago una limpieza de archivos huérfanos.

### 5. Sin cambios de base de datos

No se modifican tablas, RPCs ni RLS. La validación de stock al agregar productos se mantiene intacta.

## Resultado esperado

POS = grid táctil de productos + ticket en vivo a la derecha. El usuario agrega/quita/edita cantidades y notas, y ve cómo se construye el ticket. Sin método de pago, sin propina, sin botón de procesar venta, sin importación de sesiones de coworking, sin paneles de cancelación. Listo para conectar después un flujo de generación de ticket cuando se defina.