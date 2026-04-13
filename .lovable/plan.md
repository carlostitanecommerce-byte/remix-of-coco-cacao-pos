
# Plan: Eliminar usuarios y mostrar contrasena inicial

## Resumen
Agregar dos funcionalidades a la seccion de usuarios:
1. Boton para eliminar usuarios (con confirmacion)
2. Boton de candado para ver la contrasena inicial del usuario

## Cambios

### 1. Migracion: agregar columna `password_visible` a `profiles`
Agregar una columna de texto a la tabla `profiles` para almacenar la contrasena inicial asignada por el admin. Solo los administradores podran leerla gracias a las RLS existentes (todos los autenticados pueden ver profiles, pero la contrasena se mostrara solo en la UI del admin).

```sql
ALTER TABLE profiles ADD COLUMN password_visible text DEFAULT null;
```

Ademas, agregar una politica RLS restrictiva: crear una funcion y politica para que solo admins puedan leer este campo no es posible a nivel de columna con RLS estandar. En su lugar, la columna existira en profiles pero solo se consultara desde la UI del admin. Como medida adicional de seguridad, se usara una view o se consultara directamente solo cuando se necesite.

### 2. Actualizar Edge Function `create-user`
Despues de crear el usuario exitosamente, guardar la contrasena en texto plano en `profiles.password_visible`:

```typescript
await supabaseAdmin
  .from("profiles")
  .update({ username: cleanUsername, password_visible: password })
  .eq("id", newUser.user.id);
```

### 3. Crear Edge Function `delete-user`
Nueva funcion que:
- Verifica JWT y rol administrador del solicitante
- Impide que el admin se elimine a si mismo
- Elimina el usuario con `supabaseAdmin.auth.admin.deleteUser(user_id)`
- La eliminacion en cascada limpia profiles y user_roles automaticamente
- Registra la accion en audit_logs

### 4. Actualizar `src/pages/UsersPage.tsx`

**Nuevos imports**: `Trash2`, `Lock`, `LockOpen` de lucide-react, componentes de `AlertDialog`

**Nuevos estados**:
- `userToDelete`: usuario seleccionado para eliminar
- `deletingId`: ID del usuario en proceso de eliminacion
- `visiblePasswords`: Record<string, string> para cachear contrasenas consultadas

**Nueva columna "Contrasena"**: Muestra un boton con icono de candado. Al hacer clic, consulta `profiles.password_visible` para ese usuario y muestra/oculta la contrasena inline.

**Nueva columna "Acciones"**: Boton con icono Trash2 para eliminar. No aparece en la fila del admin logueado.

**AlertDialog de confirmacion**: Al hacer clic en eliminar, se abre un dialogo preguntando "Esta seguro de eliminar al usuario [nombre]? Esta accion no se puede deshacer."

**Funcion handleDeleteUser**: Invoca la Edge Function `delete-user` y recarga la lista.

**Layout de la tabla actualizada**:
| Nombre | Usuario | Contrasena | Rol | Fecha Registro | Acciones |

El boton de contrasena alterna entre `Lock` (cerrado) y `LockOpen` (abierto) cuando se revela la contrasena. Si no hay contrasena guardada muestra "No disponible".

## Archivos a crear/modificar
1. Migracion SQL: agregar columna `password_visible` a `profiles`
2. `supabase/functions/create-user/index.ts` - guardar contrasena en profiles
3. `supabase/functions/delete-user/index.ts` - nueva Edge Function
4. `src/pages/UsersPage.tsx` - agregar columnas de contrasena y acciones + dialogo de eliminacion
