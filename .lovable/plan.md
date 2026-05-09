## Objetivo

Que la barra lateral aparezca **cerrada por defecto** al cargar / volver a la app. Si el usuario quiere abrirla, usa el botón del header.

## Cambio

- **`src/components/DashboardLayout.tsx`**: pasar `defaultOpen={false}` al `<SidebarProvider>`.

Eso es todo. El `SidebarProvider` de shadcn usa `defaultOpen` (actualmente `true` por defecto) como estado inicial, así que con `false` la barra arrancará cerrada cada vez que se entre o se regrese a la pestaña.

## Resultado

- Al abrir o volver a la app → contenido a pantalla completa, barra cerrada.
- El botón del header (`SidebarTrigger`) sigue funcionando para abrirla cuando se necesite.
- El cierre automático al navegar y la tecla Esc ya implementados se mantienen.