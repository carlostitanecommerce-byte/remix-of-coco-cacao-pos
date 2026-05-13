## Diagnóstico

El error `invalid input value for enum tipo_concepto: "paquete"` se dispara cuando, al cancelar la sesión, el RPC `cancelar_sesion_coworking` ejecuta el casteo literal `'paquete'::tipo_concepto` dentro de su loop sobre `detalle_ventas`. El enum `public.tipo_concepto` en la base sólo contiene los valores `producto`, `coworking` y `amenity`, así que el casteo aborta toda la transacción de cancelación.

### Por qué pasa ahora

Existen tres migraciones del 11-may que precisamente arreglaban esto, pero **no quedaron aplicadas** en la base (no aparecen en `supabase_migrations.schema_migrations`):

- `20260511002329_fix_paquete_cancellations.sql` — reescribe `cancelar_sesion_coworking` y `resolver_cancelacion_item_sesion` para distinguir paquetes por `paquete_id IS NOT NULL` en lugar del enum.
- `20260511004038_add_paquete_to_tipo_concepto.sql` — añadía el valor `paquete` al enum (alternativa).
- `20260511004555_fix_consumo_coworking_enum.sql` — hacía que `registrar_consumo_coworking` insertara paquetes con `tipo_concepto = 'producto'` y la marca real en `paquete_id`/`paquete_nombre`.

La función desplegada hoy es la versión vieja (de `20260510000603`), por eso falla cualquier cancelación de sesión que tenga al menos una línea en `detalle_ventas` (con o sin paquetes), porque el casteo del enum se evalúa en cada iteración del loop.

## Solución

Crear **una sola migración nueva** que vuelva a definir las tres funciones con la lógica correcta, sin tocar el enum (no hace falta agregar `paquete` porque la nueva lógica usa `paquete_id IS NOT NULL`). Esto es seguro y reversible.

### Migración nueva

`CREATE OR REPLACE FUNCTION` para:

1. **`public.cancelar_sesion_coworking`** — distingue casos por `paquete_id IS NOT NULL` en lugar de `tipo_concepto = 'paquete'`. Mantiene exactamente la misma firma, retorno y semántica (mermas + retorno de stock + DELETE de upsells + update de sesión + audit + cierre de solicitud).
2. **`public.resolver_cancelacion_item_sesion`** — misma corrección: detecta paquetes por `paquete_id IS NOT NULL`.
3. **`public.registrar_consumo_coworking`** — al insertar en `detalle_ventas`, mapea `tipo_concepto = 'paquete'` → `'producto'` antes del cast al enum, y conserva la información del paquete en `paquete_id` y `paquete_nombre`.

### Sin cambios en frontend

`fetchSessionUpsellsForCancel`, `cancelarSesionAtomico` y `CancelSessionDialog` ya pasan los datos correctos. El bug es 100% en el RPC.

### Validación

Después de aplicar la migración:

- Confirmar en `pg_proc` que la nueva definición está vigente (`pg_get_functiondef` no debe contener el literal `'paquete'::tipo_concepto`).
- Probar cancelar una sesión activa con upsells de productos simples y otra con paquete asociado: ambos casos deben terminar OK, registrando merma para lo entregado y devolviendo stock para lo no entregado.
- Probar `solicitar_cancelacion_item_sesion` + `resolver_cancelacion_item_sesion` sobre una línea de paquete.

## Archivos

- `supabase/migrations/<nuevo_timestamp>_reapply_paquete_cancel_fix.sql` — nueva migración (recrea las 3 funciones).
- No se tocan archivos de frontend.
