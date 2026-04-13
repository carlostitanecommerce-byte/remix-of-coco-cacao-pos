

## Plan: Migrar datos desde tu Supabase externo a este proyecto

### Enfoque
Crear una Edge Function temporal `migrate-data` que se conecte a tu proyecto de Supabase externo, lea todas las tablas y las inserte en este proyecto.

### Requisitos previos
Necesito dos datos de tu proyecto de Supabase:
1. **URL del proyecto** (ej: `https://xxxxx.supabase.co`)
2. **Service Role Key** — la encuentras en tu dashboard de Supabase → Settings → API → `service_role` (la clave secreta, no la anon key)

Estos se guardarán como secretos seguros: `SOURCE_SUPABASE_URL` y `SOURCE_SERVICE_ROLE_KEY`.

### Implementación

**1. Edge Function `migrate-data`**
- Se conecta a tu Supabase externo con las credenciales proporcionadas
- Lee cada tabla en orden de dependencias (tablas padre primero)
- Inserta los datos en este proyecto usando la service role key local
- Desactiva el trigger `descontar_inventario_venta` durante la migración para evitar efectos secundarios en `detalle_ventas`

**Orden de migración:**
1. `categorias_maestras`, `areas_coworking`, `configuracion_ventas`, `insumos`, `productos`
2. `tarifas_coworking`, `recetas`
3. `tarifa_upsells`, `tarifa_amenities_incluidos`
4. `profiles`, `user_roles`
5. `cajas`, `ventas`, `coworking_sessions`, `coworking_reservaciones`
6. `detalle_ventas`, `movimientos_caja`, `compras_insumos`, `mermas`
7. `coworking_session_upsells`, `solicitudes_cancelacion`, `solicitudes_cancelacion_sesiones`
8. `kds_orders`, `kds_order_items`
9. `audit_logs`

**2. Ejecutar una sola vez y verificar conteos**

**3. Eliminar la función y los secretos** (son temporales)

### Nota sobre profiles/user_roles
Los registros de `profiles` y `user_roles` referencian UUIDs de `auth.users` del proyecto original. Se insertarán con sus IDs originales, pero no tendrán usuarios de Auth asociados en este proyecto hasta que se recreen.

### Archivos
- Nuevo temporal: `supabase/functions/migrate-data/index.ts`
- Secretos necesarios: `SOURCE_SUPABASE_URL`, `SOURCE_SERVICE_ROLE_KEY`

