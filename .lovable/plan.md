## Objetivo

Mantener que la barra lateral aparezca **encima** de la sección abierta (sin recortarla), pero eliminar el paso extra de tener que hacer clic en el fondo para cerrarla. La barra debe cerrarse sola en cuanto el usuario ya navegó a otra sección.

## Comportamiento propuesto

1. **Cierre automático al navegar:** apenas el usuario haga clic en cualquier opción del menú de la barra lateral, la barra se cierra sola. Así el flujo queda en un solo gesto: abrir → elegir → la sección queda visible.
2. **El backdrop sigue existiendo** como red de seguridad (clic afuera también cierra), pero deja de ser el camino principal.
3. **Tecla Esc** como atajo adicional para cerrar sin mover el mouse.
4. La barra **no se cierra** si el usuario hace clic en la opción de la sección en la que ya está (evita parpadeos innecesarios), pero sí se cierra si elige una sección distinta.

## Cambios técnicos

- **`src/components/AppSidebar.tsx`**: en cada `NavLink`/`SidebarMenuButton`, llamar a `setOpen(false)` (escritorio) o `setOpenMobile(false)` (móvil) en el `onClick` después de navegar. Usar el hook `useSidebar()` ya disponible. Aplicarlo tanto al menú principal como a cualquier submenú.
- **`src/components/DashboardLayout.tsx`**: agregar un `useEffect` con listener global `keydown` que cierre la barra al presionar `Escape` cuando esté abierta en escritorio. El backdrop existente se conserva sin cambios.
- No se tocan `sidebar.tsx` (componente de shadcn) ni la lógica de overlay/z-index ya implementada.

## Resultado esperado

- Abrir barra → un clic en la sección deseada → la barra desaparece automáticamente y la sección queda totalmente visible.
- Cero clics extra en el fondo para uso normal.
- El backdrop y Esc quedan como salidas alternativas para casos donde el usuario abre la barra por error.
