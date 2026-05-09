## Problema

Cuando se abre la barra lateral en el POS, queda **debajo** de la barra sticky de categorías/productos. La causa es un conflicto de `z-index`:

- Sidebar (shadcn): `z-10`
- Backdrop del overlay: `z-[5]`
- Barra sticky de categorías en `ProductGrid.tsx`: `z-10`

Al empatar en `z-10`, la barra sticky del contenido queda por encima del sidebar (que es `fixed`), tapándolo.

## Auditoría de otras secciones

Revisé todo `src/` buscando `sticky`, `fixed` y clases `z-*`:

- `CajaPage.tsx` usa `lg:sticky lg:top-4` **sin** z-index → no causa solapamiento, pero por consistencia conviene asegurarse de que el sidebar siempre quede encima.
- Resto de páginas (Coworking, Inventarios, Reportes, Cocina, Usuarios) no usan elementos sticky/fixed que compitan con el sidebar.
- Diálogos/Sheets de shadcn ya viven en `z-50`, por encima del sidebar — correcto, no se tocan.

Es decir, el único síntoma visible es el del POS, pero la **raíz** está en el layout del sidebar. Arreglarlo ahí lo soluciona globalmente y previene regresiones futuras si alguna otra pantalla agrega un sticky.

## Solución

Subir la pila del sidebar **overlay** por encima de cualquier contenido sticky de la app, manteniéndola por debajo de modales (`z-50`):

1. **`src/components/DashboardLayout.tsx`** — Backdrop de `z-[5]` → `z-30`.
2. **`src/index.css`** — Añadir regla CSS dentro del bloque desktop existente para forzar `z-index: 40` sobre el contenedor `fixed` del sidebar de shadcn cuando está expandido (sin tocar `ui/sidebar.tsx`, que es componente generado):

   ```css
   @media (min-width: 768px) {
     .group.peer[data-state="expanded"] ~ * .fixed[data-sidebar],
     [data-sidebar="sidebar"] { z-index: 40; }
   }
   ```

   Selector real: apuntar al wrapper `fixed inset-y-0 z-10 ... md:flex` que renderiza shadcn (lo identificaremos por `data-variant` / `data-side` en el árbol del Sidebar).

3. No se modifica `ProductGrid.tsx` ni ninguna otra página: el sticky del POS sigue funcionando para el scroll vertical, solo deja de competir con el sidebar.

### Jerarquía resultante

```
modales / sheets / popovers ........ z-50
sidebar (overlay desktop) ........... z-40
backdrop del sidebar ................ z-30
contenido sticky de páginas ......... z-10  (sin cambios)
contenido normal .................... z-0
```

## Archivos a editar

- `src/components/DashboardLayout.tsx`
- `src/index.css`
