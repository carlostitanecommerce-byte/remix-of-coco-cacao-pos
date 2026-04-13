

## Plan: Encriptar contraseñas con pgcrypto

### Resumen
Reemplazar el almacenamiento en texto plano (`password_visible`) por encriptación simétrica usando `pgp_sym_encrypt/decrypt` de pgcrypto. El admin podrá seguir consultando contraseñas, pero ahora se desencriptan bajo demanda mediante una función SQL segura.

### Cambios

**1. Migración SQL**
- Activar extensión `pgcrypto`
- Renombrar columna `password_visible` → `password_encrypted` en `profiles`
- Migrar datos existentes: encriptar valores actuales en texto plano con `pgp_sym_encrypt(password_visible, 'coco_y_cacao_secret_key')`
- Crear función `get_decrypted_password(p_user_id uuid)` con `SECURITY DEFINER` que:
  - Valida que `auth.uid()` tenga rol administrador via `has_role()`
  - Retorna `pgp_sym_decrypt(password_encrypted::bytea, 'coco_y_cacao_secret_key')` 
  - Retorna `null` si no es admin

**2. Edge Function `create-user/index.ts` (línea 122-125)**
- Cambiar el update de `password_visible: password` por una llamada RPC que ejecute:
  ```sql
  UPDATE profiles SET username = $1, password_encrypted = pgp_sym_encrypt($2, 'coco_y_cacao_secret_key') WHERE id = $3
  ```
- Se usará `supabaseAdmin.rpc('encrypt_and_save_password', ...)` o un raw SQL update vía la función de base de datos

**3. `src/pages/UsersPage.tsx` (línea 157-167)**
- Reemplazar `supabase.from('profiles').select('password_visible')` por:
  ```ts
  supabase.rpc('get_decrypted_password', { p_user_id: userId })
  ```
- Usar el resultado directamente como string

### Archivos modificados
- Nueva migración SQL en `supabase/migrations/`
- `supabase/functions/create-user/index.ts`
- `src/pages/UsersPage.tsx`

### Nota de seguridad
La clave de encriptación `'coco_y_cacao_secret_key'` queda embebida en la función SQL (SECURITY DEFINER, no expuesta al cliente) y en la Edge Function (servidor). No es accesible desde el frontend. Para mayor seguridad en producción, se podría mover a un secret de Vault, pero para este caso es suficiente.

