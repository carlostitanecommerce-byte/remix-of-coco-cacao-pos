
# Plan: Grid denso de productos en POS

## Objetivo
Que en la vista del POS se muestre la mayor cantidad de productos posible por categoría sin necesidad de hacer scroll, manteniendo claridad visual y la experiencia de "dos clics" (categoría → producto).

## Diagnóstico actual
Archivo: `src/components/pos/ProductGrid.tsx`

Problemas que limitan la densidad:
1. **Imagen cuadrada grande** (`aspect-square`) ocupa la mayor parte de cada tarjeta.
2. **Nombre con `min-h-[2.5rem]`** reserva 2 líneas aunque el producto tenga 1.
3. **Columnas conservadoras**: en el ancho actual del panel POS (~600px en viewport 1032), solo entran 3 columnas (`md:grid-cols-4` requiere ≥768px del *viewport*, no del contenedor).
4. **`max-h-[75vh]` + scroll**: confirma que la vista está pensada para hacer scroll.
5. **Barra de categorías** como `Badge` con wrap, ocupa altura variable.
6. **Padding interno** de cada card (`p-2` + gap-3) suma espacio muerto.

Resultado: en una categoría con 12+ productos, el usuario tiene que scrollear.

## Propuesta de diseño

### A. Tarjeta compacta (modo por defecto)
- Reducir imagen: de `aspect-square` a `aspect-[4/3]` o `h-20` fija, con `object-cover`.
- Quitar `min-h-[2.5rem]` del nombre; permitir 1 línea con `truncate` y tooltip nativo (`title={p.nombre}`) para nombres largos.
- Tipografía: `text-xs` para nombre, `text-sm font-bold` para precio.
- Padding: `p-1.5`, `gap-2` en el grid.
- Badge "📦 Paquete" más pequeño y sin texto (solo ícono) en modo denso.

### B. Más columnas, basadas en el contenedor
Cambiar a breakpoints por contenedor (Tailwind `@container`) o ajustar breakpoints fijos para que con el ancho real del panel POS quepan más columnas:
- Base: `grid-cols-3`
- `sm:grid-cols-4`
- `md:grid-cols-5`
- `lg:grid-cols-6`
- `xl:grid-cols-7`

Esto duplica aproximadamente la cantidad de productos visibles.

### C. Toggle de densidad (opcional pero recomendado)
Botón pequeño junto a las categorías: **"Compacto / Cómodo"** (persistido en `localStorage`).
- **Compacto** (default): tarjeta sin imagen o con imagen mini (h-12 redonda a la izquierda) tipo lista-grid, 6–8 columnas.
- **Cómodo**: similar al actual pero con la mejora B aplicada.

### D. Barra de categorías sticky y compacta
- `sticky top-0` con fondo `bg-background/95 backdrop-blur` para que no consuma scroll.
- Categorías en una sola fila con scroll horizontal (`overflow-x-auto`) en vez de wrap, evitando que la barra crezca a 2–3 líneas y robe espacio al grid.

### E. Quitar el `max-h-[75vh]` y dejar que el grid use toda la altura disponible
El layout padre (`PosPage`) ya divide en columnas; el grid debería ocupar 100% de la altura del panel y solo scrollear si realmente sobran productos. Con la densidad mejorada, el scroll será raro.

## Archivos a modificar
- `src/components/pos/ProductGrid.tsx` — rediseño del grid, tarjeta compacta, barra sticky, toggle de densidad.
- `src/pages/PosPage.tsx` — ajuste menor de alturas para que el grid ocupe el alto del viewport (ej. `h-[calc(100vh-X)]`).

No se tocan datos, lógica de carrito, ni Caja.

## Resultado esperado
En el viewport actual (~1032px) deberían verse aproximadamente **20–30 productos sin scroll** en modo compacto (vs ~6–8 actuales), manteniendo legibilidad del nombre y precio, y conservando el flujo de 2 clics.
