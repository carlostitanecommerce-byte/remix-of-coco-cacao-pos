
# Plan: Categorías siempre visibles + ticket compacto + sin precio en tarjetas

## 1. Categorías sin scroll horizontal
Archivo: `src/components/pos/ProductGrid.tsx`

- Quitar `overflow-x-auto` y volver a `flex-wrap` para que todas las categorías sean visibles siempre.
- Mantener la barra `sticky top-0` con `backdrop-blur`.
- Reducir tamaño de los badges (`text-xs px-2 py-0.5`) para que quepan más por fila.
- Resultado: un solo clic cambia de categoría, sin scroll lateral.

## 2. Ticket más compacto
Archivo: `src/pages/PosPage.tsx`

- Cambiar el grid de `lg:grid-cols-5` (3+2) a `lg:grid-cols-7` con **5 columnas para productos y 2 para el ticket** (~28% del ancho).
- Reducir `p-4` → `p-3` en el panel del ticket.

Archivo: `src/components/pos/CartPanel.tsx`
- Header "Ticket" de `text-lg` a `text-base`.
- Padding interno de cada item `p-2` → `p-1.5`, botones +/− `h-6 w-6`.

## 3. Quitar precio de las tarjetas de producto
Archivo: `src/components/pos/ProductGrid.tsx`

- Eliminar el `<span>` que muestra `${p.precio_venta.toFixed(2)}` en cada tarjeta.
- El nombre del producto queda como única información visible (más el badge de paquete cuando aplique).
- Esto permite reducir aún más la altura de cada card y ajustar el área de imagen para mostrar más productos por pantalla.
- El precio se sigue viendo en el ticket al agregar el producto, que es donde realmente importa.

## Resultado esperado
- Categorías siempre visibles, un clic para cambiar.
- Ticket más estrecho y compacto pero legible.
- Tarjetas de producto sin precio, más bajas → más filas visibles sin scroll.
