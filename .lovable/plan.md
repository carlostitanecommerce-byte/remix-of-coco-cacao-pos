## Problema

En **Inventarios → Insumos**:

1. **Scroll horizontal en toda la página**: la tabla tiene 9 columnas (Insumo, Categoría, Presentación, Unidad, Stock Actual, Stock Mínimo, Costo Unitario, Estado, Acciones) y se desborda del ancho disponible, lo que obliga a usar la barra horizontal inferior del navegador para ver columnas como Estado y Acciones.
2. **Diálogo de Nuevo/Editar Insumo se corta**: en viewports cortos (≈575px de alto) el contenido del dialog (nombre, categoría, unidad, bloque de presentación con costo calculado, stock actual y mínimo + footer) excede la altura de la pantalla y los botones quedan inaccesibles porque el `DialogContent` no tiene scroll interno.

## Cambios propuestos

Archivo único: `src/components/inventarios/InsumosTab.tsx`

### 1. Confinar el scroll horizontal a la tabla

Envolver la `<Table>` en un contenedor con `overflow-x-auto` para que **solo la tabla** haga scroll horizontal cuando sea necesario, en lugar de empujar todo el layout de la página.

- Cambiar el `<CardContent className="p-0">` para que su hijo directo sea un `<div className="overflow-x-auto">` que contenga la `<Table>`.
- Agregar `min-w-[900px]` (o similar) a la tabla para garantizar legibilidad de las columnas cuando se active el scroll.

Resultado: la página ya no muestra barra horizontal global; solo la tabla la muestra cuando el viewport es estrecho.

### 2. Hacer el diálogo desplazable y limitar su altura

Modificar el `<DialogContent>` del formulario para:

- Limitar la altura a la del viewport: `max-h-[90vh]`.
- Convertirlo en flex column: `flex flex-col`.
- Hacer scrollable únicamente la sección del formulario (el `<div className="space-y-4 py-2">` actual): añadir `flex-1 overflow-y-auto pr-1`.
- El `DialogHeader` y `DialogFooter` quedan fijos arriba/abajo; solo el contenido central scrollea.

Resultado: en cualquier altura de pantalla el header (título) y el footer (botones Cancelar/Guardar) siempre son visibles, y los campos del formulario se pueden navegar con scroll interno.

## Fuera de alcance

- No se cambia ninguna lógica de negocio, ni columnas, ni datos.
- No se tocan otros tabs de Inventarios (esos pueden tener problemas similares pero el usuario reportó solo Insumos).
