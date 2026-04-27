## Problema

En **Inventarios → Insumos**, la columna "Acciones" tiene 4 botones de icono (Merma, Duplicar, Editar, Eliminar) que ensanchan demasiado la tabla y obligan a usar la barra de scroll horizontal inferior, incluso después del intento previo con `overflow-x-auto`.

## Solución

Unificar las 4 acciones en un solo botón **dropdown menu de tres puntitos** (`MoreHorizontal`) usando el componente shadcn `DropdownMenu` (ya disponible en el proyecto en `src/components/ui/dropdown-menu.tsx`). Esto reduce drásticamente el ancho de la columna Acciones y permite que la tabla quepa en el ancho disponible sin scroll horizontal.

## Cambios

Archivo único: `src/components/inventarios/InsumosTab.tsx`

### 1. Imports

- Añadir `MoreHorizontal` a la importación de `lucide-react`.
- Añadir importación de `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuTrigger` desde `@/components/ui/dropdown-menu`.

### 2. Reemplazar la celda de Acciones (líneas ~311-333)

Reemplazar el bloque actual de 4 `<Button>` por un único botón ghost icon con `MoreHorizontal` que abra un `DropdownMenu` con los items:

- **Registrar merma** (icono `ShieldAlert`) — visible para todos los roles, igual que ahora.
- **Separador** + (solo si `isAdmin`):
  - **Duplicar insumo** (icono `Copy`)
  - **Editar** (icono `Pencil`)
  - **Eliminar** (icono `Trash2`, con clase de texto destructivo)

Cada `DropdownMenuItem` conserva exactamente el mismo `onClick` que el botón original.

### 3. Limpiar `min-w-[900px]` de la tabla

Quitar la clase `min-w-[900px]` del `<Table>` (línea 260) para que la tabla use el ancho del contenedor sin forzar scroll. El wrapper `overflow-x-auto` se mantiene como red de seguridad por si en el futuro se añaden más columnas.

## Resultado esperado

- Columna "Acciones" pasa de ~160px (4 iconos) a ~40px (1 icono).
- La tabla cabe en el ancho del viewport (~1032px) sin necesidad de barra horizontal.
- Todas las acciones siguen siendo accesibles vía el menú dropdown.
- Permisos por rol intactos: las acciones admin solo aparecen si `isAdmin` es verdadero.

## Fuera de alcance

- No se cambia ninguna lógica de negocio (handlers `handleDuplicate`, `openEdit`, `setDeleteTarget`, `setMermaDialogOpen` permanecen iguales).
- No se modifican otras pestañas de Inventarios.
