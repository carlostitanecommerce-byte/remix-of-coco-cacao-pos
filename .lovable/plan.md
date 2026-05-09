## Categorías por ámbito en POS y Delivery

### Problema

`useCategorias()` se llama sin parámetro en `ProductGrid.tsx` (POS) y `PreciosDeliveryTab.tsx` (Delivery), por lo que mezclan categorías de los tres ámbitos (`insumo`, `producto`, `paquete`). Como ambas pantallas listan productos vendibles (productos simples + paquetes, ambos viven en `productos`), aparecen categorías de insumos que nunca contienen ítems vendibles → tabs/filtros vacíos y ruido visual.

### Solución

Permitir que `useCategorias` acepte **múltiples ámbitos** y pedir solo `['producto','paquete']` en POS y Delivery. Insumos queda intacto.

### Cambios

1. **`src/hooks/useCategorias.ts`**
   - Cambiar firma a `useCategorias(ambito?: CategoriaAmbito | CategoriaAmbito[])`.
   - Si es array, usar `.in('ambito', ambitos)`; si es string, mantener `.eq` actual.
   - Deduplicar nombres (un mismo nombre puede existir en varios ámbitos tras el índice compuesto).
   - Memoizar el array en el `useEffect` (serializar a string para deps estable).

2. **`src/components/pos/ProductGrid.tsx`**
   - Reemplazar `useCategorias()` → `useCategorias(['producto','paquete'])`.
   - Mantener el filtro `categoriasConProductos` (ya filtra por categorías que tienen al menos un producto cargado), así si una categoría queda vacía no aparece como tab.

3. **`src/components/menu/PreciosDeliveryTab.tsx`**
   - Reemplazar `useCategorias()` → `useCategorias(['producto','paquete'])`.
   - El select "Filtrar por categoría" mostrará solo categorías relevantes a ítems vendibles.

### Fuera de alcance

- `InsumosTab`, `ProductosTab`, `PaquetesTab/PaquetesDinamicosTab` ya usan el ámbito correcto desde la épica anterior — no se tocan.
- No se requiere migración de BD.

### Archivos

- `src/hooks/useCategorias.ts`
- `src/components/pos/ProductGrid.tsx`
- `src/components/menu/PreciosDeliveryTab.tsx`
