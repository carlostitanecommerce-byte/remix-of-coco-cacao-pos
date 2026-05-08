## Objetivo

Convertir la página de Punto de Venta en una interfaz limpia, rápida y táctil:
- Sin nada relacionado a Caja (apertura, cierre, movimientos, badges, bloqueos).
- Sin título "Punto de Venta", sin descripción, sin barra de búsqueda.
- Lado izquierdo: pestañas de categorías + grid de tarjetas (imagen + nombre) — clic en la tarjeta agrega al ticket.
- Lado derecho: ticket (CartPanel) intacto.

## Cambios

### 1. `src/pages/PosPage.tsx` — limpieza profunda

Eliminar:
- Imports y uso de `useCajaSession`, `AperturaCajaDialog`, `CierreCajaDialog`, `MovimientosCajaPanel`, `VentasTurnoPanel`, iconos `Store`, `Lock`, `DoorOpen`, `AlertTriangle`.
- Estados `showCierre`, `showApertura`, todo el bloque `if (!cajaAbierta && !isAdmin)`, banner `cajaCerradaAdmin`, badges 🟢/🔴, botones Abrir/Cerrar Caja, `MovimientosCajaPanel`, dialogs de apertura/cierre.
- Header completo (`<h1>Punto de Venta</h1>` + descripción).
- Validación `if (!cajaAbierta)` dentro de `handleConfirm` (queda solo el cálculo y `setSummary`).
- Gate `cajaAbierta &&` antes de `<CoworkingSessionSelector />` (siempre visible).

Mantener:
- Lógica de carrito, `addProduct`, `updateQty`, `removeItem`, `handleImportSession`, `handleClearCart`, `handleConfirm`, `handleSuccess`, `missingImportedItems`, `handleRestoreItem`.
- `CoworkingSessionSelector`, `CartPanel`, `ConfirmVentaDialog`.
- `SolicitudesCancelacionPanel` (no es de caja, es de cancelaciones de venta) — se mantiene visible para admin.

Layout final:
```text
<div className="space-y-4">
  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
    <div className="lg:col-span-3 space-y-4">
      <CoworkingSessionSelector ... />
      <ProductGrid ... />
    </div>
    <div className="lg:col-span-2 ...">
      <CartPanel ... />
    </div>
  </div>
  {isAdmin && <SolicitudesCancelacionPanel />}
  <ConfirmVentaDialog ... />
</div>
```

### 2. `src/components/pos/ProductGrid.tsx` — rediseño visual completo

Eliminar:
- Input de búsqueda (`Search`, `filtro`, `setFiltro`).
- `<Table>`, `<TableHeader>`, `<TableBody>`, etc.
- Filtro por nombre (queda solo filtro por categoría).

Añadir/cambiar:
- Cargar `imagen_url` del select de productos: `'id, nombre, categoria, precio_venta, precio_upsell_coworking, activo, tipo, imagen_url'`.
- Mantener barra de categorías (badges) tal como está.
- Reemplazar la tabla por un **grid responsivo de tarjetas**:
  ```text
  grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3
  ```
- Cada tarjeta:
  - Botón completo clickeable que llama `onAdd(p)` (sin necesidad del icono `+`).
  - Imagen cuadrada (aspect-square) con `imagen_url`; fallback a placeholder con inicial del producto y color suave si no hay imagen.
  - Badge `📦 Paquete` superpuesto en esquina si `tipo === 'paquete'`.
  - Debajo: nombre (line-clamp-2, `text-sm font-medium`) y precio (`text-xs font-bold text-primary`).
  - Hover/active states (`hover:border-primary hover:shadow-md transition`).
  - Si `canUseSpecialPrice && tipo !== 'paquete'`: pequeño botón flotante (estrella) en esquina superior derecha que abre el `DropdownMenu` actual con "Precio Especial" y "Promoción (Gratis)" — `e.stopPropagation()` para que no dispare el add normal.
- Sin scroll vertical fijo: dejar que el grid fluya con la página (el grid muestra todos los productos de la categoría activa visibles, como pidió el usuario). Si la categoría tiene muchos productos, un `max-h-[70vh] overflow-y-auto` opcional como red de seguridad.

### 3. Sin cambios de base de datos

`productos.imagen_url` ya existe (text, nullable). No requiere migración. La carga/edición de imágenes se gestiona desde Inventarios → Productos (fuera de alcance).

## Fuera de alcance

- No se elimina el módulo Caja del sistema (sigue existiendo en otras pantallas y hooks). Solo se desacopla del POS.
- No se cambia `CartPanel`, `ConfirmVentaDialog`, ni la lógica de ventas.
- No se rediseña Reportes ni se mueve `VentasTurnoPanel` a otra parte (queda fuera de POS; si quieres rescatarlo en Reportes lo vemos después).
- No se sube/edita imágenes desde POS — se asume que ya están cargadas en `productos.imagen_url`.

## Resultado esperado

- POS = solo categorías + grid táctil + ticket. Cero fricción.
- Dos clics: categoría → tarjeta de producto → agregado al ticket.
- Sin bloqueos por caja: la venta se procesa siempre (la lógica de turno/caja se gestionará desde el módulo de Caja independiente).
