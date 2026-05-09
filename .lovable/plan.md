## Mejoras a la Matriz de Precios por Plataforma

Archivo a modificar: `src/components/menu/PreciosDeliveryTab.tsx`

### 1. Nuevo filtro por tipo (Producto / Paquete)

Agregar un `Select` ubicado **entre** el buscador y el filtro de categorías. Opciones:
- Todos los tipos (default)
- Producto individual (`tipo === 'producto'`)
- Paquete / Combo (`tipo === 'paquete'`)

El orden final de la barra de filtros será:
`[ Buscar producto ] [ Tipo ] [ Categoría ] [ Solo activos ]`

Se aplica al `useMemo` de `productosFiltrados` junto con los filtros existentes.

### 2. Paginación

Agregar paginación en el cliente sobre `productosFiltrados`:
- Estado `paginaActual` (default 1) y `porPagina` (default 25, con selector 10/25/50/100).
- Componente `Pagination` de `@/components/ui/pagination` debajo de la tabla, mostrando: anterior, números de página (con elipsis si son muchas), siguiente.
- Indicador "Mostrando X–Y de Z productos".
- Al cambiar cualquier filtro (búsqueda, tipo, categoría, solo activos) o `porPagina`, resetear `paginaActual` a 1 (vía `useEffect`).
- La tabla solo renderiza el slice correspondiente a la página actual.

### Notas técnicas

- Sin cambios de backend, RLS, ni esquema. Es puramente UI/presentación.
- Se mantiene la lógica de borrador, guardado por celda, márgenes y permisos (`isAdmin`) sin cambios.
- Se respetan tokens semánticos del design system existentes en el archivo.
