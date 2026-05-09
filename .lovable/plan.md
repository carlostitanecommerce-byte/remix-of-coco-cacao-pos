## Paginación en Productos Individuales y Paquetes/Combos

Aplicar el mismo patrón de paginación que se usó en la matriz de precios delivery, en estas dos pestañas de la sección Menú.

### Archivos a modificar

1. **`src/components/inventarios/ProductosTab.tsx`** (pestaña "Productos Individuales")
2. **`src/components/menu/PaquetesDinamicosTab.tsx`** (pestaña "Paquetes / Combos")

### Cambios por archivo (mismo patrón en ambos)

- Agregar estados `paginaActual` (default `1`) y `porPagina` (default `25`).
- Resetear `paginaActual` a `1` al cambiar la búsqueda o el tamaño de página (`useEffect`).
- Calcular `totalPaginas`, `paginaSegura`, `inicio`, `fin` y `productosPagina = filtrados.slice(inicio, fin)` (en `ProductosTab` mover el cálculo de `filtrados` a un `useMemo` justo antes del render para reutilizarlo).
- La tabla itera `productosPagina` en lugar de `filtrados`.
- Debajo de la tabla, footer con:
  - Texto "Mostrando X–Y de Z".
  - Selector "Por página" con opciones `10 / 25 / 50 / 100`.
  - Botones de paginación: anterior, números (con elipsis si hay más de 7 páginas), siguiente. Mismo `numerosPagina` helper.
- Solo se muestra el footer cuando `filtrados.length > 0`.

### Notas técnicas

- Sin cambios de backend ni de esquema. Solo presentación.
- Se mantiene intacta toda la lógica existente (CRUD, expansión de filas/recetas, validaciones, permisos, etc.).
- Reutilizar componentes shadcn ya importados (`Button`, `Select`, `Label`) e importar íconos `ChevronLeft` / `ChevronRight` de `lucide-react`.
