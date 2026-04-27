# Quitar el bloque de sesiones de las tarjetas de Ocupación

En `OccupancyGrid.tsx`, eliminar por completo el bloque que renderiza las sesiones dentro de cada tarjeta de espacio (las líneas que muestran "Sesión 1 · N pax", "Salida" y "Cancelar", tanto para áreas privadas como públicas).

## Lo que queda en cada tarjeta

- Nombre del área e ícono.
- Badge superior derecho con la capacidad/ocupación (ej. `3/7`) o estado "Privado · Libre/Ocupado".
- Etiqueta de estado (Vacío / Disponible / Lleno) y precio por hora.
- Barra de progreso de ocupación.

## Lo que se elimina

- El bloque completo `{areaSessions.length > 0 && (...)}` con sus dos ramas (privado / público), incluyendo:
  - Indicador "Sesión 1 · N pax".
  - Botones "Salida" y "Cancelar".

Las acciones de Salida y Cancelar siguen disponibles en la tabla "Sesiones Activas" debajo, que es la fuente única de verdad para gestionar cada sesión.

## Detalles técnicos

- **Archivo:** `src/components/coworking/OccupancyGrid.tsx`.
- Eliminar las líneas 81–116 aprox. (el bloque `{/* Sessions display */}`).
- Eliminar también del import `LogOutIcon` y `XCircle` si quedan sin usar; mantener `Users` (todavía se usa en el header de áreas públicas) y `Lock`.
- Las props `onCheckOut` y `onCancel` siguen siendo recibidas por el componente (las pasa `CoworkingPage`) pero ya no se invocan desde aquí; las dejamos en la firma para no romper el llamador y porque podrían reactivarse en el futuro — sin ningún costo en runtime.
- Sin cambios en `ActiveSessionsTable.tsx`, `SessionTimer.tsx` ni en la lógica de cobro.
