## Problema

En el reporte **Reportes → Exportación Contable**, las cinco tarjetas de KPI (`Ingreso Gravable`, `Ingreso Bruto Total`, `IVA Acumulado`, `Propinas`, `Utilidad Estimada`) se muestran en una sola fila horizontal de 5 columnas desde el breakpoint `lg` (≥1024 px). En el viewport actual del usuario (1032 px) cada tarjeta queda con ~190 px y, además, el layout interno coloca el icono al lado del texto, dejando poco espacio para el monto. Como el valor usa `truncate`, los importes con varios dígitos se cortan con "…" y no se alcanza a leer el número completo.

## Cambios propuestos (un solo archivo: `src/components/reportes/GeneralTab.tsx`)

### 1. Grid responsivo más conservador
Sustituir `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` por `grid-cols-2 md:grid-cols-3 xl:grid-cols-5`:
- **Móvil**: 2 columnas (compactas pero legibles).
- **Tablet / laptop pequeña** (≥768 px): 3 columnas → cada tarjeta gana ~340 px.
- **Pantalla amplia** (≥1280 px): las 5 tarjetas en línea, ya con espacio suficiente.

Reducir gap de `gap-4` a `gap-3` para optimizar uso del ancho.

### 2. Layout interno vertical en cada tarjeta
Hoy el icono y el texto están en `flex items-center gap-4`, lo que reserva ~58 px para el icono y deja al monto con un ancho muy reducido. El nuevo layout coloca:
- Fila superior: icono pequeño (h-8) + label.
- Fila inferior: monto ocupando **todo el ancho** de la tarjeta.

Esto multiplica el espacio horizontal disponible para el número.

### 3. Tipografía adaptable y sin recortes
- Cambiar `text-lg font-bold truncate` por `text-base sm:text-lg font-bold tabular-nums break-words`:
  - `tabular-nums`: dígitos de igual ancho, alineación visual entre tarjetas.
  - `break-words`: si el monto sigue siendo más largo que la tarjeta (caso extremo), se ajusta a dos líneas en lugar de cortarse con "…".
  - `text-base` en móvil, `text-lg` en pantallas mayores.

### 4. Skeletons coherentes
Actualizar los skeletons de carga para usar el mismo layout vertical y la misma cuadrícula, manteniendo el layout estable durante la transición.

## Resultado esperado

- En el viewport actual de 1032 px (3 columnas), cada tarjeta pasa de ~190 px a ~340 px de ancho útil → el monto completo cabe sin truncarse incluso para cifras de 7-8 dígitos como `$1,234,567.89`.
- En pantallas anchas (≥1280 px) se conserva la fila de 5 tarjetas, ahora también con suficiente espacio gracias al layout vertical.
- En móvil/tablet la cuadrícula es estable y los textos no se atropellan.
- Cero cambios funcionales: mismos KPIs, mismos cálculos, misma lógica de carga.
