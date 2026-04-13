

## Plan: Migrar toda la base de datos del proyecto anterior

### Situación
- Todas las tablas de este proyecto están vacías (0 registros en las 25 tablas)
- El proyecto origen es [Coco & Cacao POS](/projects/9c332c2f-2fce-4909-a39f-4cd1af816a71) (ref: `lfaotqkmevncdocuelqn`)
- No puedo consultar la base de datos del proyecto origen directamente — necesito una Edge Function que se conecte en runtime

### Requisito previo: Service Role Key del proyecto origen
Necesito agregar un secreto `SOURCE_SERVICE_ROLE_KEY` con la service role key del proyecto anterior. La puedes encontrar en el proyecto anterior yendo a **Cloud → Overview**.

### Implementación

**1. Crear Edge Function `migrate-data`**
Una función temporal que:
- Se conecta al proyecto origen usando su URL (`https://lfaotqkmevncdocuelqn.supabase.co`) y la `SOURCE_SERVICE_ROLE_KEY`
- Lee todas las tablas en orden de dependencias (tablas padre primero)
- Inserta los datos en este proyecto usando la service role key local
- Desactiva temporalmente triggers de inventario para evitar efectos secundarios durante la migración

**Orden de migración (respetando dependencias):**
1. `categorias_maestras`, `areas_coworking`, `configuracion_ventas`, `insumos`, `productos`
2. `tarifas_coworking`, `recetas`
3. `tarifa_upsells`, `tarifa_amenities_incluidos`
4. `profiles` (sin `password_encrypted` — los usuarios de auth son diferentes entre proyectos)
5. `cajas`, `ventas`, `coworking_sessions`, `coworking_reservaciones`
6. `detalle_ventas`, `movimientos_caja`, `compras_insumos`, `mermas`
7. `coworking_session_upsells`, `solicitudes_cancelacion`, `solicitudes_cancelacion_sesiones`
8. `kds_orders`, `kds_order_items`
9. `audit_logs`, `user_roles`

**2. Ejecutar la función una sola vez**

**3. Verificar conteos en cada tabla**

**4. Eliminar la Edge Function** (es temporal, solo para migración)

### Limitación importante: Usuarios
Las tablas `profiles`, `user_roles` y `audit_logs` referencian IDs de `auth.users` que **no existen** en este proyecto. Las opciones son:
- **Migrar los datos con los UUIDs originales** — los registros existirán pero no estarán vinculados a usuarios reales hasta que se recreen con los mismos IDs (no es posible)
- **Omitir estas tablas** — y recrear usuarios manualmente

Para las tablas transaccionales (`ventas`, `cajas`, `coworking_sessions`, etc.) que tienen `usuario_id`, los datos se insertarán con los UUIDs originales pero no tendrán un usuario asociado en auth.

### Archivos
- Nuevo: `supabase/functions/migrate-data/index.ts` (temporal)
- Secreto necesario: `SOURCE_SERVICE_ROLE_KEY`

