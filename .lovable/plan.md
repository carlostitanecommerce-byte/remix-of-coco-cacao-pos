# Sidebar como overlay (no empuja el contenido)

## Comportamiento actual
La barra usa `collapsible="offcanvas"` (default). Cuando se abre en escritorio, el componente shadcn renderiza un **div "spacer"** con `w-[--sidebar-width]` que ocupa espacio en el flex layout, comprimiendo la sección principal para que ambas quepan lado a lado.

## Comportamiento deseado
Al abrir, la barra debe **flotar encima** del contenido (sin alterar su ancho), reforzando que es solo para navegación. Al cerrar (clic en el trigger o en el área oscurecida), se oculta y el contenido queda 100% visible.

## Cambios

### 1. Neutralizar el spacer del Sidebar — `src/index.css`
Agregar una regla CSS global y específica que fuerce a 0 el ancho del div "gap" del Sidebar shadcn cuando está expandido en desktop. Es la única forma limpia sin tocar el componente UI base.
```css
/* Sidebar overlay mode: don't reserve space for the sidebar on desktop */
@media (min-width: 768px) {
  .peer[data-state="expanded"] > div:first-child {
    width: 0 !important;
  }
}
```
Esto convierte la barra en un overlay puro: el div interior `fixed inset-y-0 z-10` ya está posicionado por encima, solo el spacer estaba reservando espacio.

### 2. Backdrop opcional para desktop — `src/components/DashboardLayout.tsx`
Agregar un overlay semitransparente que aparece cuando la barra está abierta en desktop y la cierra al hacer clic. Mejora la usabilidad y comunica al usuario que debe cerrar la barra para interactuar con la sección.

- Crear pequeño componente interno `<SidebarBackdrop />` que use `useSidebar()` para leer `open` y llamar `setOpen(false)`.
- Renderizar `<div className="fixed inset-0 z-[5] bg-black/30 backdrop-blur-[1px] hidden md:block" onClick={...}>` solo cuando `open === true`.
- Z-index menor que el sidebar (`z-10`) para que la barra siga encima.

### 3. (No requiere cambios) Mobile
En móviles el Sidebar shadcn ya usa Sheet (overlay con backdrop nativo). El cambio CSS está dentro de `@media (min-width: 768px)` para no afectar móvil.

### 4. (No requiere cambios) Estado por defecto
La barra inicia abierta por defecto (`SidebarProvider` con `defaultOpen` true). Tras este cambio podría sentirse intrusiva al cargar; **se mantiene el default actual** salvo que el usuario lo pida.

## Verificación
1. Cargar `/inventarios` → la barra está abierta, el contenido **NO** se comprime (mantiene el ancho que tendría con la barra cerrada).
2. Click en el trigger (icono ☰) → la barra se cierra, contenido sin cambios.
3. Click fuera de la barra (sobre el backdrop) → la barra se cierra.
4. En móvil → comportamiento Sheet sin cambios.

## Fuera de alcance
- No se modifica `src/components/ui/sidebar.tsx` (componente base shadcn).
- No se cambia el contenido ni los items de `AppSidebar.tsx`.
- No se cambian rutas ni lógica de navegación.
