## Cambios a implementar en la sección POS

### 1. Aprovechar el espacio inferior (franja blanca)

`src/pages/PosPage.tsx` usa `h-[calc(100vh-7rem)]` en ambas ramas (desktop y tablet/mobile). Ese `7rem` se calculaba con el header `h-14` ya eliminado. Ahora sobran ~3.5rem al fondo.

- Línea 287 (desktop) y línea 321 (tablet/mobile): cambiar `h-[calc(100vh-7rem)]` → `h-[calc(100vh-3rem)]` (solo descuenta el `p-6` vertical del layout). El grid de productos y el panel del ticket se extenderán hasta el borde inferior.

### 2. Mostrar más nombre del producto en cada tarjeta

Problema actual en `src/components/pos/ProductGrid.tsx`: el nombre se renderiza con `truncate` en una sola línea (`text-[11px]` en compacto, `text-sm` en cómodo). Nombres largos como "Café Latte Vainilla Grande" se cortan a "Café Latte Vai…", y con tantas tarjetas pequeñas es difícil reconocer el producto.

Solución profesional: permitir **2 líneas** de nombre con `line-clamp-2` (truncado limpio al final de la 2ª línea), reducir un poco la altura/aspect de la imagen para no perder densidad, y mantener el atributo `title={p.nombre}` que ya existe (tooltip nativo con el nombre completo al hacer hover).

Cambios concretos en `ProductGrid.tsx`:

- **Imagen un poco más baja** para dejar aire al texto sin agrandar la tarjeta:
  - Compacto: `h-16` → `h-14`.
  - Cómodo: `aspect-[4/3]` → `aspect-[5/3]` (más ancho que alto, deja más espacio para el texto debajo).
  - Aplica también al skeleton (línea 122) para mantener simetría.
- **Texto del nombre en 2 líneas con clamp** (línea 162):
  - Reemplazar `truncate` por `line-clamp-2`.
  - Añadir `min-h-[2.2em]` para que todas las tarjetas tengan la misma altura aunque el nombre ocupe 1 sola línea (alineación visual).
  - Mantener `leading-tight` y los tamaños actuales (`text-[11px]` / `text-sm`).
- **Padding del bloque de texto** (línea 161): subir de `p-1.5` a `px-1.5 py-1` para que el texto respire un poco más sin crecer demasiado.
- Mantener el `title={p.nombre}` actual (línea 137) como tooltip nativo para casos donde aún se trunque al final de la 2ª línea.

### Resultado esperado

- Sin franja blanca abajo: el grid + ticket llegan al borde inferior de la pantalla.
- Cada tarjeta muestra hasta 2 líneas del nombre, lo que duplica el texto visible sin alterar la cuadrícula. Los nombres muy largos se cortan limpiamente al final de la 2ª línea, y el tooltip al hover siempre muestra el nombre completo.
- No cambia el comportamiento de selección, categorías, densidad ni la lógica de carga.
