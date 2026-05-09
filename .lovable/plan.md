## Objetivo

Convertir la barra lateral en una barra siempre visible en modo "icon" (colapsada mostrando solo íconos), con el botón de toggle dentro de la barra arriba, y eliminar la franja blanca superior de todas las páginas para ganar espacio.

## Cambios

### 1. `src/components/DashboardLayout.tsx`
- Cambiar `defaultOpen` a `true` para que arranque expandida la primera vez (luego el usuario puede colapsar). Mantener persistencia vía cookie del propio shadcn.
- Eliminar el `<header className="h-14 ...">` con el `SidebarTrigger`.
- Eliminar el componente `SidebarBackdrop` y su uso (ya no aplica overlay porque la barra siempre está visible en modo icon).
- Reducir padding del contenedor principal si hace falta para "subir" el contenido (mantener `p-6` lateral, pero el header ya no resta espacio vertical).

### 2. `src/components/AppSidebar.tsx`
- Pasar `collapsible="icon"` al `<Sidebar>` para que en estado colapsado quede una franja angosta con íconos en lugar de desaparecer (offcanvas actual).
- Añadir un `SidebarHeader` arriba que contenga el `SidebarTrigger` (siempre visible, tanto colapsado como expandido), reemplazando o acompañando el bloque actual de marca "Coco & Cacao". En modo colapsado el bloque de marca se oculta con `group-data-[collapsible=icon]:hidden`, dejando solo el trigger + íconos.
- Asegurar tooltips en cada `SidebarMenuButton` (prop `tooltip={item.title}`) para que en modo colapsado se vea el nombre al hacer hover.
- Quitar el cierre manual de la barra al navegar (`handleNavClick` con `setOpen(false)`), ya que la barra debe permanecer en su estado actual.
- En el `SidebarFooter`, ocultar nombre/rol en colapsado y dejar solo el ícono de logout.

### 3. `src/index.css`
- Eliminar/ajustar el bloque `@media (min-width: 768px)` que neutraliza el spacer en modo `expanded` (`width: 0 !important`). Con `collapsible="icon"` queremos que el sidebar empuje el contenido (no flotar encima), para que nada quede tapado. Se elimina también el `z-index: 40` forzado del overlay.

### 4. Páginas
- No requieren cambios: ya renderizan su propio `<h1>` como encabezado. Al quitar el `header` del layout, su contenido sube automáticamente y aprovecha el espacio.

## Resultado esperado

- Barra lateral siempre visible. Por defecto en modo icono (angosta) mostrando solo íconos de POS, Caja, Cocina, Coworking, Inventarios, Menú, Usuarios, Reportes y logout.
- Botón de toggle arriba dentro de la barra; al expandir, aparecen los textos y la marca.
- Click en cualquier ícono navega a su sección sin colapsar/expandir.
- Desaparece la franja blanca superior fija; cada página comienza directamente con su título.
