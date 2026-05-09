# Rediseño columna "En uso" — Categorías

## Problema
Actualmente la columna muestra dos badges separados (`7 ins.` / `6 prod.`) tipo "pastilla" con borde y texto en dos líneas. Ocupa mucho espacio vertical, se ve repetitivo y poco profesional.

## Propuesta de diseño

Reemplazar los dos badges por **un solo "chip" compacto e inline** que combine ambos conteos con iconos semánticos en lugar de abreviaciones de texto.

### Estructura visual (por celda)
```
[🧪 7]  [📦 6]
```

- Cada conteo se muestra con un **icono pequeño + número**, sin bordes ni mayúsculas.
- Iconos:
  - **Insumos:** `FlaskConical` (lucide) — color `text-muted-foreground`
  - **Productos:** `Package` (lucide) — color `text-muted-foreground`
- Tipografía: `text-sm tabular-nums font-medium text-foreground` para el número.
- Separador sutil vertical entre ambos: `divide-x divide-border/60` o un punto `·`.
- Si un conteo es 0, se muestra atenuado (`opacity-40`) en lugar de ocultarlo, para que la celda mantenga ancho consistente y se lea como "estructurado".
- Si **ambos son 0**: un guión `—` sutil en `text-muted-foreground`, alineado a la derecha.
- Tooltip al hacer hover sobre cada par mostrando el texto completo: "7 insumos en esta categoría" / "6 productos en esta categoría".

### Detalle de implementación (`src/components/inventarios/CategoriasTab.tsx`)
- Eliminar los `<Badge>` actuales (líneas 200–212).
- Reemplazar por un contenedor `flex items-center justify-end gap-3` con dos sub-elementos:
  ```tsx
  <Tooltip><TooltipTrigger>
    <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
      <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
      <span className={cn("font-medium", uso_insumos === 0 && "opacity-40")}>{uso_insumos}</span>
    </span>
  </TooltipTrigger><TooltipContent>...</TooltipContent></Tooltip>
  ```
- Envolver toda la tabla con `<TooltipProvider delayDuration={150}>` (verificar si ya existe arriba).
- Importar `FlaskConical, Package` de `lucide-react` y `cn` de `@/lib/utils`.
- Quitar `font-mono` para alinearlo con el estilo limpio del resto.

### Beneficios
- Misma altura de fila para todas las categorías → tabla más uniforme.
- Iconos > abreviaciones de texto: lectura más rápida y profesional.
- Tooltip aporta accesibilidad y claridad sin saturar la celda.
- Mantiene el principio "diseño limpio, tonos cálidos, traceabilidad" de la memoria del proyecto.

## Fuera de alcance
- No se cambian datos, queries, RLS ni la lógica de conteo.
- No se modifica el resto de la tabla (nombre, descripción, acciones).
