

## Plan: Crear trigger, backfill profiles y corregir secuencias de folios

### Migración SQL única

1. **Crear trigger `on_auth_user_created`** en `auth.users` AFTER INSERT que llame a `handle_new_user()` para que futuros usuarios generen profile automáticamente.

2. **Backfill profiles** para los 8 usuarios existentes en `auth.users` que no tienen registro en `profiles`, usando `id`, `email` y `raw_user_meta_data->>'nombre'`.

3. **Ejecutar `encrypt_and_save_password`** para cada usuario con su username y contraseña correspondiente:
   - admin/Coco2024!, supervisor/Coco2024!, caja/Coco2024!, barista/Coco2024!, recepcion/Coco2024!, carlos123/Coco2024!, daria/Dari26, grissel/Gris26

4. **Corregir secuencias de folios** para evitar conflictos con datos migrados:
   - `ALTER SEQUENCE ventas_folio_seq RESTART WITH 632;`
   - `ALTER SEQUENCE cajas_folio_seq RESTART WITH 56;`

### Archivos
- Solo una migración SQL (sin cambios de código)

