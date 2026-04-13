

## Plan: Replicación en tiempo real a base de datos externa

### Concepto
Cada vez que se inserte, actualice o elimine un registro en cualquier tabla de este proyecto, un trigger enviará los datos automáticamente a la base de datos destino mediante una Edge Function.

### Paso 1: Configurar secretos
Usar la herramienta `add_secret` para solicitar:
- `DEST_SUPABASE_URL` — URL del proyecto Supabase destino
- `DEST_SUPABASE_SERVICE_ROLE_KEY` — Service role key del destino

### Paso 2: Crear Edge Function `replicate-data`
`supabase/functions/replicate-data/index.ts`

- Recibe payload con: `table`, `type` (INSERT/UPDATE/DELETE), `record`, `old_record`
- Usa el service role key destino para conectarse vía `@supabase/supabase-js`
- Ejecuta la operación correspondiente en la tabla destino:
  - INSERT → `.upsert(record)` (upsert para evitar conflictos)
  - UPDATE → `.upsert(record)`
  - DELETE → `.delete().eq('id', old_record.id)`
- Manejo de errores con logging

### Paso 3: Migración SQL — Triggers de replicación
Crear triggers `AFTER INSERT OR UPDATE OR DELETE` en todas las tablas del proyecto que llamen a una función PL/pgSQL. Esta función usa `pg_net` (extensión HTTP de Supabase) para enviar un POST a la Edge Function con el payload del cambio.

**Tablas a replicar (21):**
areas_coworking, audit_logs, cajas, categorias_maestras, compras_insumos, configuracion_ventas, coworking_reservaciones, coworking_session_upsells, coworking_sessions, detalle_ventas, insumos, kds_order_items, kds_orders, mermas, movimientos_caja, productos, profiles, recetas, solicitudes_cancelacion, solicitudes_cancelacion_sesiones, tarifas_coworking, tarifa_amenities_incluidos, tarifa_upsells, user_roles, ventas

**Tablas excluidas:** `profiles` y `user_roles` se replican también (a diferencia de la migración original), ya que ahora ambos proyectos tienen los mismos auth.users.

### Arquitectura

```text
[Tabla modificada] 
    → Trigger AFTER INSERT/UPDATE/DELETE
    → pg_net HTTP POST → Edge Function /replicate-data
    → Supabase client destino → upsert/delete en tabla destino
```

### Consideraciones
- Se usa `upsert` en lugar de `insert` para manejar reintentos sin duplicados
- La función PL/pgSQL genérica evita tener que crear una función por tabla
- Se necesita habilitar la extensión `pg_net` si no está activa
- Los triggers no replicarán cambios que vengan de la propia replicación (no hay loop porque la escritura es unidireccional)

### Archivos
- Nuevo: `supabase/functions/replicate-data/index.ts`
- Nueva migración SQL (triggers + habilitación de `pg_net`)

