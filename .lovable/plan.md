## Diagnóstico

"Agua natural de 500 ml" aparece en el reporte porque la query actual cuenta tanto las filas con `tipo_concepto='producto'` (venta real, $585 en abril) como las de `tipo_concepto='amenity'` (cortesía incluida en tarifa, $0 ingreso). En total se contaron 68 unidades cuando solo 51 son ventas reales.

Este sesgo distorsiona la Ingeniería de Menú:
- **Popularidad** sube artificialmente con consumos regalados.
- **Contribución económica** queda mal calculada (se asume margen unitario de venta para unidades que se entregaron gratis).

Además, en la Fase I1 se sumaba también el consumo de `coworking_session_upsells`, que es el mismo problema: amenities/upsells incluidos en la tarifa, no ventas a precio de menú.

## Cambios

**`src/components/reportes/MenuTab.tsx`** (única edición):

1. **Restringir el conteo a ventas reales del menú**:
   ```ts
   .eq('tipo_concepto', 'producto')
   ```
   Eliminar `'amenity'` del filtro. La Ingeniería de Menú mide rentabilidad — los amenities no generan ingreso y deben excluirse.

2. **Eliminar el bloque que agregaba `coworking_session_upsells` al `salesMap`**: ese consumo ya está cubierto por las filas de venta cuando aplica, y cuando son amenities incluidos no deben contar para popularidad de menú.

3. Mantener la lógica de paquetes (`paquete_id ?? producto_id`).

No se tocan `CoworkingAnalysis.tsx` ni `CoworkingOpsMetrics.tsx`: ahí sí tiene sentido contar amenities porque el objetivo es analizar el comportamiento de coworking, no la rentabilidad del menú.

## Verificación esperada

Tras el fix, en abril 2026:
- "Agua natural de 500 ml" debería mostrar **51 vendidas** (no 68) y contribución acorde solo a ventas reales.
- Productos cuyo único consumo del periodo fue como amenity desaparecerán del scatter / tabla.
