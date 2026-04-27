# Correcciones en Coworking — Ocupación y Tarifa "Sin cobrar fracción extra"

## Problema 1 — Información duplicada en tarjetas de Ocupación

Cada tarjeta de espacio en `OccupancyGrid.tsx` repite información que ya aparece de forma completa en la tabla "Sesiones Activas" (nombre del cliente + cronómetro). Esto satura visualmente la cuadrícula sin aportar nada nuevo.

**Alcance exacto del cambio:**

- **Quitar** de las tarjetas de espacio (tanto en áreas privadas como públicas):
  - El nombre del cliente.
  - El componente `<SessionTimer variant="compact" ... />`.
- **Conservar** en las tarjetas:
  - Nombre del área, badge de estado (Disponible/Ocupado/Lleno), capacidad/ocupación, precio, barra de progreso.
  - Número de pax por sesión y botones de acción (Salida / Cancelar / Gestionar Cuenta), de modo que el operador siga pudiendo accionar desde la tarjeta sin saber a quién corresponde — la identificación se hace en la tabla.
- **No tocar** la tabla "Sesiones Activas" (`ActiveSessionsTable.tsx`): se mantiene tal cual, con cliente y cronómetro como fuente única de verdad.

Resultado: la cuadrícula muestra ocupación a un vistazo y la tabla muestra el detalle por cliente y tiempo, sin duplicidad.

## Problema 2 — Error "Error al actualizar tarifa" al elegir "Sin cobrar fracción extra"

**Causa raíz (confirmada en BD):** la tabla `tarifas_coworking` tiene un CHECK constraint:

```text
CHECK (metodo_fraccion = ANY (ARRAY['hora_cerrada','15_min','30_min','minuto_exacto']))
```

El valor `'sin_cobro'` que ahora envía la UI **no está permitido** por ese constraint, así que Postgres rechaza el UPDATE/INSERT y la app muestra el toast genérico "Error al actualizar tarifa".

**Acción (migración SQL):**

1. Eliminar el CHECK existente `tarifas_coworking_metodo_fraccion_check`.
2. Recrearlo incluyendo `'sin_cobro'`:

   ```text
   CHECK (metodo_fraccion IN ('sin_cobro','hora_cerrada','15_min','30_min','minuto_exacto'))
   ```

Con esto la opción "Sin cobrar fracción extra" se podrá guardar tanto al crear como al editar una tarifa, y la lógica de facturación ya implementada (que fuerza `cargoExtra = 0` cuando `metodo_fraccion === 'sin_cobro'`) entrará en efecto sin más cambios.

## Mejora adicional de UX (recomendada)

En `handleSave` de `TarifasConfig.tsx` el toast de error oculta el mensaje real de Postgres. Cambiarlo para incluir `error.message` en `description` y que cualquier futuro fallo de validación sea diagnosticable de inmediato.

## Detalles técnicos

- **Archivos a modificar:**
  - `src/components/coworking/OccupancyGrid.tsx` — eliminar nombre del cliente y `<SessionTimer />` en los dos bloques (privado y público); conservar pax + botones; limpiar el import de `SessionTimer` si queda sin usar.
  - `src/components/coworking/TarifasConfig.tsx` — propagar `error.message` en los toasts de crear/actualizar tarifa.
- **Migración SQL nueva:** `ALTER TABLE public.tarifas_coworking DROP CONSTRAINT tarifas_coworking_metodo_fraccion_check;` seguido de `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` con los 5 valores válidos.
- **Sin cambios** en `CoworkingPage.tsx`, `CoworkingSessionSelector.tsx`, `ActiveSessionsTable.tsx` ni en `SessionTimer.tsx`.
