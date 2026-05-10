# Bug: Sesiones activas se quedan "Congeladas"

## Causa raíz

Confirmé en la base de datos que la sesión de **Carlos Alberto Trejo Berumen** está en estado `activo` pero tiene `fecha_salida_real` ya guardada (00:22:55). Por eso el cronómetro se quedó parado en ~5 minutos y aparece el badge "Congelado".

Esto ocurre así:

1. Alguien abre la sesión y pulsa **Salida** (botón "Registrar salida").
2. `CoworkingPage.handleCheckOut` llama al RPC `freeze_checkout_coworking`, que **congela** `fecha_salida_real = now()` para que el monto a cobrar no siga aumentando mientras se confirma el cierre.
3. Se abre el `CheckoutDialog` con el resumen.
4. Si el usuario **cierra el diálogo sin pulsar "Finalizar Estancia y Pasar a Caja"** (cambia de pantalla, hace click fuera, presiona Escape, etc.), la sesión queda en `activo` pero con `fecha_salida_real` ya escrito. El timer entonces deja de avanzar y muestra "Congelado" para siempre.

No hay actualmente ningún flujo que libere ese congelamiento si el cierre se cancela.

## Solución

### 1. Migración SQL

**Nuevo RPC `unfreeze_checkout_coworking(p_session_id uuid)`** (`SECURITY DEFINER`, `search_path = public`):
- Limpia `fecha_salida_real = NULL` **solo si** `estado = 'activo'` (nunca toca sesiones en `pendiente_pago` o `finalizado`).
- Devuelve `boolean` (true si se liberó).
- `GRANT EXECUTE` a `authenticated`.

**Limpieza de datos existentes** (one-shot dentro de la misma migración):
```sql
UPDATE coworking_sessions
SET fecha_salida_real = NULL, updated_at = now()
WHERE estado = 'activo' AND fecha_salida_real IS NOT NULL;
```
Esto recupera la sesión actualmente atascada.

### 2. `src/components/coworking/CheckoutDialog.tsx`

- Agregar un `confirmedRef` que se marque `true` solo cuando `handleConfirm` actualiza la sesión a `pendiente_pago` con éxito.
- Modificar `onOpenChange`/`onClose`: si el diálogo se cierra **sin** que `confirmedRef.current` sea true y la sesión todavía está `activo`, llamar `supabase.rpc('unfreeze_checkout_coworking', { p_session_id: summary.session.id })` antes de invocar `onClose()`.
- Tras el unfreeze, refrescar la lista (la realtime de `coworking_sessions` ya está suscrita en `useCoworkingData`, así que basta con disparar el `onClose` normal; el badge "Congelado" desaparecerá automáticamente).

### 3. Sin cambios en otros archivos

`CoworkingSessionSelector` (caja) **no** dispara el freeze, solo lee `fecha_salida_real`; no requiere cambios. El flujo de cancelar sesión y el de checkout completo siguen iguales.

## Validación

- Sesión actual de Carlos: tras correr la migración, vuelve a estado normal con cronómetro corriendo.
- Caso A: pulsar **Salida** → cerrar el diálogo sin confirmar → la sesión vuelve a correr y el badge "Congelado" desaparece.
- Caso B: pulsar **Salida** → "Finalizar Estancia y Pasar a Caja" → la sesión pasa a `pendiente_pago` con `fecha_salida_real` intacto (no se desfreezza).
- Caso C: el RPC nunca toca sesiones que ya estén en `pendiente_pago`/`finalizado`.
