## Auditoría: ¿realmente se cobró mal el paquete?

Consulté la base de datos para la única venta con paquete registrada (folio **#0653**, total $310):

| Línea | Descripción | Subtotal | paquete_nombre |
|---|---|---:|---|
| 1 | Café Americano Frío (vaso de 14 oz) | **$19.39** | 📦 Bebida + Helado |
| 2 | Helado de horchata con coco (vaso 1/2 L) | **$130.61** | 📦 Bebida + Helado |
| 3 | Café & Cacao Frappé Mokachino | $85.00 | — |
| 4 | Café & Cacao Frío Latte moka | $75.00 | — |

**$19.39 + $130.61 = $150.00 exactos** = precio del paquete "Bebida + Helado".

Conclusión: el paquete **se cobró correctamente a $150**. Lo que se ve en el ticket NO son dos paquetes mal cobrados, sino **un solo paquete con dos componentes (bebida + helado)** cuyo precio fue prorrateado entre los dos productos en `detalle_ventas` proporcional a su costo (el helado vale mucho más que el café, por eso se llevó $130.61 y el café $19.39).

El prorrateo es intencional y necesario para que los reportes de menú / margen por producto funcionen, pero **la presentación al cliente y al cajero está rota**:

1. El ticket no muestra el paquete como una unidad — solo aparecen los componentes con precios distorsionados.
2. No hay encabezado "📦 Bebida + Helado .... $150.00".
3. Visualmente parece que se vendieron productos sueltos a precios extraños.
4. La sección "Paquetes" del carrito desaparece del ticket impreso (todo se mezcla en "Productos").

## Plan de corrección (solo presentación; no se toca lógica de cobro ni DB)

### 1. `src/components/caja/ConfirmVentaDialog.tsx` — vista del ticket post-venta
- Agregar una sección **"Paquetes"** antes de "Productos".
- Para cada paquete del `summary.items` (tipo_concepto = 'paquete'), renderizar:
  - Línea principal: `{cantidad}x 📦 {nombre} ........ ${subtotal}` (precio real del paquete).
  - Sub-lista (sin precio) con cada componente: `• {cant}x {nombre_componente}`.
- Quitar de la sección "Productos" cualquier ítem que provenga de un paquete (ya están listados como sub-componentes).

### 2. `src/components/caja/TicketReimprimirDialog.tsx` — re-impresión desde Caja/Reportes
- Agrupar `detalle_ventas` por `paquete_id`:
  - Si `paquete_id IS NOT NULL`: agrupar todas las filas con el mismo `paquete_id`, sumar sus subtotales y mostrar **una sola línea** `1x 📦 {paquete_nombre} ........ ${suma}` con los componentes listados debajo sin precio.
  - Si `paquete_id IS NULL`: mostrar la línea tal cual (productos sueltos, coworking, amenities).
- Eliminar el formato actual `📦 Paquete → Componente $19.39` que confunde.

### 3. Vista de confirmación previa (mismo `ConfirmVentaDialog`, líneas 530–537)
- Aplicar la misma agrupación: paquetes como una sola línea con componentes como sub-ítems sin precio. Esto coincide con cómo ya se ven en `CartPanel`.

### 4. Verificación
- Reimprimir el ticket #0653 desde Reportes → Caja: validar que aparezca `1x 📦 Bebida + Helado .... $150.00` con los dos componentes listados debajo, en vez de las dos líneas con precios prorrateados.
- Hacer una venta de prueba con dos paquetes del mismo tipo pero distintas selecciones: deben aparecer como dos líneas independientes de $150 cada una con sus respectivos componentes debajo.

### Detalles técnicos
- No se modifican: `crear_venta_completa`, `detalle_ventas`, prorrateo en `ConfirmVentaDialog.handleConfirm`, ni reportes (siguen usando los precios prorrateados que son correctos para análisis de margen por producto).
- Cambios estrictamente en JSX de los dos diálogos de ticket.

¿Procedemos con esta corrección de presentación?
