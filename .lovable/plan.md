## Problema detectado

En la imagen se ve un item del ticket con el nombre truncado a "Ca..." porque todos los elementos (nombre, precio unitario, controles -/+, cantidad, subtotal, nota, eliminar) están forzados en una sola fila horizontal muy estrecha. Resultado: no se lee el producto, los precios chocan visualmente y se ve amateur.

## Rediseño propuesto (CartPanel.tsx)

Reorganizar cada item del ticket en **dos filas** dentro de una tarjeta limpia, en vez de una sola fila apretada:

### Fila 1 — Identidad del producto
- Nombre del producto en `text-sm font-medium`, con espacio para 2 líneas (`line-clamp-2`), sin truncar agresivamente.
- A la derecha: subtotal en `text-sm font-bold text-primary` (es el dato más importante visualmente).
- Si es paquete: ícono `Package` antes del nombre.

### Fila 2 — Controles y metadata
- Izquierda: precio unitario en `text-[11px] text-muted-foreground` ("$70.00 c/u").
- Centro/derecha: stepper de cantidad agrupado (`-` `1` `+`) con fondo sutil `bg-muted/40 rounded-md` para que se lea como un control unificado, botones `h-7 w-7`.
- Extremo derecho: botones de acción secundarios (nota 📝 y eliminar 🗑) agrupados, separados visualmente del stepper con un pequeño gap.

### Mejoras visuales
- Tarjeta con `p-2.5`, `rounded-lg`, `border-border`, hover sutil `hover:border-primary/30 transition-colors`.
- Botón eliminar en `ghost` con `text-muted-foreground hover:text-destructive` (no rojo permanente — más limpio).
- Nota inline (cuando exista) con fondo `bg-primary/5` y borde izquierdo `border-l-2 border-primary` en lugar del emoji suelto.
- Componentes de paquete sin cambios estructurales, solo ajuste de spacing.

### Layout esquemático

```text
┌─────────────────────────────────────────┐
│ Cappuccino Grande               $70.00  │
│ $70.00 c/u        [- 1 +]      📝  🗑   │
└─────────────────────────────────────────┘
```

## Archivos a modificar

- `src/components/pos/CartPanel.tsx` — solo la función `renderItem` y estilos. Sin cambios en lógica, props ni store.

## Lo que NO cambia

- Lógica de carrito, cálculos, totales, footer del ticket, validaciones.
- Ancho del panel de ticket (sigue siendo 2/7 del grid del POS).
- Otros componentes (ProductGrid, PosPage, CajaCheckoutPanel).
