## Categorías por Ámbito

Separar las categorías maestras por ámbito (insumo / producto / paquete) para que cada formulario solo vea las suyas.

### 1. Base de datos

Migración sobre `categorias_maestras`:
- Agregar columna `ambito text NOT NULL DEFAULT 'producto'`.
- Constraint `CHECK (ambito IN ('insumo','producto','paquete'))`.
- Backfill inteligente antes de aplicar el `NOT NULL`:
  - Si el `nombre` de la categoría aparece en `insumos.categoria` y NO en `productos.categoria` → `ambito = 'insumo'`.
  - En cualquier otro caso → `ambito = 'producto'` (default seguro).
- Quitar el índice único actual sobre `nombre` (si existe) y crearlo como único compuesto `(nombre, ambito)`, así una misma palabra (p.ej. "Bebidas") puede existir como categoría de insumo y de producto sin chocar.
- Índice simple en `ambito` para filtros rápidos.

Nota: no se duplican filas automáticamente. Si el usuario necesita la misma categoría en dos ámbitos, la creará manualmente desde la UI (queda explícito en la nota de la migración).

### 2. Hook `useCategorias`

Aceptar un parámetro opcional de ámbito:

```ts
useCategorias(ambito?: 'insumo' | 'producto' | 'paquete')
```

- Si se pasa, filtra `eq('ambito', ambito)`.
- Si no, devuelve todas (compatibilidad).
- Re-fetch cuando cambia el parámetro.

### 3. `CategoriasTab.tsx` (gestión)

- Form del diálogo: agregar `<Select>` obligatorio "Ámbito de la categoría" con opciones Insumo / Producto / Paquete. Validar antes de guardar.
- Tabla: nueva columna **Ámbito** con `<Badge>` por valor:
  - Insumo → `secondary` con ícono `FlaskConical`.
  - Producto → `default` con ícono `Package`.
  - Paquete → `outline` con ícono `Boxes` (o similar).
- Conteo "En uso": mantener la lógica actual (insumos + productos), pero mostrar solo el conteo relevante al ámbito de la fila (paquetes cuenta dentro de productos ya que comparten tabla).
- Filtro rápido arriba de la tabla: tabs/segmented control para ver "Todas / Insumos / Productos / Paquetes" (mejora UX, no rompe nada).
- Audit log: incluir `ambito` en el `metadata` de crear/actualizar/eliminar.

### 4. Filtros en formularios consumidores

- `InsumosTab.tsx` → `useCategorias('insumo')`.
- `ProductosTab.tsx` (en `MenuPage` → Productos Individuales) → `useCategorias('producto')`.
- `PaquetesDinamicosTab.tsx` (Constructor de Paquetes) → `useCategorias('paquete')`.
- `PaquetesTab.tsx` legacy (si todavía monta en algún lado): también `useCategorias('paquete')`.
- Dejar los filtros de búsqueda/listado (sidebars de categorías) tal cual están si ya leen sus propias listas; solo cambian los `<Select>` del formulario de alta/edición.

### 5. Validación post-cambio

- Verificar que ningún componente externo lea `categorias_maestras` sin filtrar y rompa (búsqueda rápida en repo).
- Tipos de Supabase se regeneran automáticamente tras la migración.

### Archivos afectados

- Migración SQL nueva (categorías_maestras: columna + constraint + backfill + índices).
- `src/hooks/useCategorias.ts` (editar).
- `src/components/inventarios/CategoriasTab.tsx` (editar).
- `src/components/inventarios/InsumosTab.tsx` (editar — solo el `useCategorias`).
- `src/components/inventarios/ProductosTab.tsx` (editar — solo el `useCategorias`).
- `src/components/inventarios/PaquetesTab.tsx` (editar — solo el `useCategorias`).
- `src/components/menu/PaquetesDinamicosTab.tsx` (editar — solo el `useCategorias`).
