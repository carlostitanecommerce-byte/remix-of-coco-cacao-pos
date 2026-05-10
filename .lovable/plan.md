# Eliminar "Añadir Consumo Extra" del diálogo de Registrar Entrada

Ya existe la lógica de cargar consumos a una sesión activa desde el POS, por lo que la búsqueda de productos en el check-in es redundante. Se elimina por completo, conservando intactos:

- Selección de área, tarifa, pax y horas.
- **Amenities automáticos** incluidos por la tarifa (sección "Entregar al cliente ahora").
- Snapshot de tarifa, validación de capacidad/reservaciones, envío a KDS de amenities, y audit log.

## Cambios en `src/components/coworking/CheckInDialog.tsx`

1. **Eliminar UI**: bloque completo "Búsqueda unificada de consumos extra" (líneas ~408–513), incluyendo lista de `extraItems`, input de búsqueda, y resultados con badge "Precio Especial / Regular".

2. **Eliminar estado y tipos**:
   - Interfaces `Producto` y `ExtraItem`.
   - Estados `productos`, `extraItems`, `search`.
   - `inputs` no usados (`Search`, `Plus`, `Sparkles` si quedan huérfanos; `Gift` se queda por amenities).

3. **Eliminar fetch de productos**: en `useEffect` de apertura, dejar solo la consulta a `tarifas_coworking`.

4. **Eliminar reset**: quitar `setExtraItems([])` del `useEffect` que reacciona a `selectedTarifaId`.

5. **Eliminar inserción en `handleCheckIn`**:
   - Quitar `firstUpsell` (no se usa).
   - Construir `detalleRows` solo con amenities (eliminar el `for (const it of extraItems)`).
   - Quitar `...extraItems.map(...)` del arreglo `kitchenItems` enviado al KDS.
   - Quitar `extra_items` del `metadata` del audit log.

6. **Verificar imports**: limpiar iconos (`Sparkles`, `Search`, `Plus`) y `verificarStock` si ya no se usan tras la limpieza.

## Validación

- Smoke test manual: abrir diálogo, seleccionar área/tarifa con amenities, registrar entrada → verificar que la sesión se crea, los amenities se insertan en `detalle_ventas` y se envían al KDS, sin errores en consola.
- Confirmar que añadir consumo desde POS sobre la sesión activa sigue funcionando (flujo ya existente, no se toca).
