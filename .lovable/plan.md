## Diagnóstico

`PosPage.tsx` usa `grid-cols-1 lg:grid-cols-7` (5/2). El breakpoint `lg` de Tailwind es **1024px**, así que cualquier tableta en vertical (768–1023) cae al layout de **una sola columna**: el grid de productos arriba y el ticket debajo, ambos compitiendo por la altura de pantalla. Resultado: muy poco espacio para tocar productos y un ticket "atascado" abajo.

Además, en tableta el patrón estándar de los POS profesionales (Square, Toast, Loyverse) NO es columna doble apretada: es **producto a pantalla completa + ticket como panel deslizable bajo demanda** con una barra inferior persistente que muestra total y CTA de pago.

## Objetivo

Que en tableta (≥768 y <1024) el cajero vea:

1. La cuadrícula de productos ocupando **todo el ancho disponible** (más columnas, productos más grandes y fáciles de tocar).
2. Una **barra inferior fija** con: contador de items, total y dos botones grandes — `Ver ticket` y `Cobrar`.
3. El ticket abre como **Sheet lateral derecho** (panel deslizable), no compite por espacio vertical.
4. En desktop (≥1024) se mantiene el layout actual de dos columnas.
5. En móvil (<768) misma experiencia de Sheet + barra inferior.

## Cambios

### 1. `src/pages/PosPage.tsx` — Layout responsivo en 3 modos

```text
mobile (<768)        tablet (768–1023)         desktop (≥1024)
┌──────────────┐     ┌────────────────────┐    ┌──────────────┬────┐
│  productos   │     │     productos      │    │  productos   │ tk │
│  (1 col x N) │     │   (más columnas)   │    │              │    │
│              │     │                    │    │              │    │
├──────────────┤     ├────────────────────┤    │              │    │
│ N · $ · CTA  │     │   N items · $ · CTA│    │              │    │
└──────────────┘     └────────────────────┘    └──────────────┴────┘
   Sheet derecho        Sheet derecho             panel inline
```

- Detectar breakpoint con el hook existente `useIsMobile` (extender a `useBreakpoint` que devuelva `mobile | tablet | desktop`, o crear `useIsTablet`). Preferencia: añadir un pequeño hook `useIsDesktop()` (≥1024) en `src/hooks/use-mobile.tsx` para no inflar API.
- Renderizar:
  - **Desktop**: el grid actual `lg:grid-cols-7` con `ProductGrid` + `CartPanel` inline + botón "Procesar pago en Caja" (sin cambios funcionales).
  - **Tablet/móvil**: `ProductGrid` a ancho completo dentro de `flex-col h-[calc(100vh-...)]`, una **`StickyCheckoutBar`** fija abajo y el `CartPanel` dentro de un `Sheet` (shadcn) controlado por estado.

### 2. Nueva `src/components/pos/StickyCheckoutBar.tsx`

Barra inferior fija (no flotante absoluta — vive en el flujo del layout para no tapar contenido). Contenido:

- Izquierda: badge con número de items + total grande (`text-xl font-bold`).
- Derecha: dos botones tamaño `lg` con buen target táctil (≥48px de alto):
  - `Ver ticket` (variant `outline`) — abre el Sheet.
  - `Cobrar →` (variant `default`) — navega a `/caja`. Deshabilitado si `items.length === 0`.
- Si hay items se muestra animación sutil (slide-up) la primera vez que aparece.

### 3. Sheet del ticket

- Reusar el componente shadcn `Sheet` con `side="right"` y `className="w-full sm:max-w-md p-4 flex flex-col"`.
- Dentro: el mismo `<CartPanel/>` ya existente + botón `Cobrar` al pie (duplicado del de la barra para conveniencia dentro del Sheet).
- Cierra automáticamente al pulsar `Cobrar`.

### 4. Ajustes finos en `ProductGrid.tsx`

- Aprovechar más columnas en tableta: el grid actual ya escala bien (`md:grid-cols-5`), pero al ganar todo el ancho los productos ya respiran. Solo asegurar que la barra sticky de categorías siga arriba y que el contenedor padre tenga altura calculada (`h-full`) para que `overflow-y-auto` funcione.
- No tocar lógica de productos, paquetes ni stock.

### 5. Altura de página

Cambiar `h-[calc(100vh-7rem)]` por una expresión que tenga en cuenta la barra inferior en tablet/móvil:

```ts
// desktop: descuenta header
// tablet/mobile: descuenta header + sticky bar
```

Implementación simple: usar flexbox vertical en el wrapper de PosPage (`flex flex-col h-[calc(100vh-3.5rem-1rem)]`), `ProductGrid` con `flex-1 min-h-0`, `StickyCheckoutBar` con altura fija `h-16`.

## Archivos a editar / crear

- **Editar** `src/pages/PosPage.tsx` — nuevo layout responsivo, estado de Sheet abierto/cerrado.
- **Crear** `src/components/pos/StickyCheckoutBar.tsx` — barra inferior con total y CTA.
- **Editar** `src/hooks/use-mobile.tsx` — agregar `useIsDesktop()` (≥1024px) reutilizando el patrón existente.
- **No tocar**: `CartPanel.tsx`, `ProductGrid.tsx` (salvo verificación de altura), `cartStore`, lógica de stock/paquetes.

## Notas

- Se respeta el comportamiento del sidebar (overlay) ya implementado.
- El cambio es 100% presentación; ninguna mutación, validación de stock ni flujo de cobro se modifica.
- Mejora significativa de ergonomía: productos con doble del área tocable en tableta y ticket accesible en 1 toque.
