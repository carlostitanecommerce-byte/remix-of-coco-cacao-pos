# Caja y Coworking compartidos en tiempo real

## Diagnóstico

### Caja (POS) — el problema real
Auditando `useCajaSession.ts` y las RLS de `cajas`/`movimientos_caja` encontré dos causas que explican lo que viste:

1. **RLS de `cajas` impide ver la caja de otros usuarios.** Hoy las políticas dicen:
   - `Users can view own cajas` → SELECT solo si `auth.uid() = usuario_id`.
   - `Supervisors can view all cajas` → SELECT solo para supervisor.
   - `Admins can manage all cajas` → todo para administrador.
   
   Resultado: si **administrador** abre la caja, los roles **caja** y **recepción** no la ven en su consulta y la app les pide "abrir caja" otra vez. Esto rompe el modelo de "una sola caja física compartida".

2. **`useCajaSession` no tiene suscripción realtime.** Aunque arregláramos las RLS, hoy solo hace `fetchCaja` al montar. Si admin abre/cierra o registra un movimiento, las demás sesiones no lo ven hasta recargar la página.

### Coworking — ya funciona bien
`useCoworkingData.ts` ya:
- Lee todas las sesiones activas y reservaciones sin filtrar por usuario.
- Tiene un canal realtime que escucha INSERT/UPDATE/DELETE en `coworking_sessions`, `coworking_reservaciones` y `areas_coworking`.
- Las RLS ya permiten a cualquier autenticado ver todas las sesiones y reservaciones.

No requiere cambios. Si percibiste desfases en coworking, debería desaparecer al unificar el patrón con el realtime ya en uso.

## Cambios propuestos

### A. Migración de base de datos
1. **`cajas` — SELECT abierto a todos los autenticados.** Eliminar `Users can view own cajas` y `Supervisors can view all cajas`; crear una política única `Authenticated users can view cajas` con `USING (true)`. (Admins mantienen `manage all` intacto.)
2. **`cajas` — UPDATE compartido cuando el turno está abierto.** Reemplazar `Users can update own cajas` por `Authenticated users can update open caja` con `USING (estado = 'abierta')`. Así caja/recepción pueden cerrar el turno o disparar acciones aunque lo haya abierto otro. Los turnos cerrados quedan inmutables salvo para administrador.
3. **`movimientos_caja` — INSERT compartido.** Reemplazar `Users can insert own movimientos` por `Authenticated users can insert movimientos` con `WITH CHECK (auth.uid() = usuario_id AND la caja referenciada está 'abierta')`. Cada movimiento queda firmado por su autor real, pero cualquiera puede registrar contra la caja activa.
4. **Realtime para `movimientos_caja`.** Añadir a la publicación `supabase_realtime` y poner `REPLICA IDENTITY FULL` (igual que ya hicimos con `cajas` y `ventas`).

### B. `src/hooks/useCajaSession.ts` — suscripción realtime
- Tras `fetchCaja`, abrir un canal Supabase que escuche:
  - `cajas` (INSERT/UPDATE/DELETE) → re-evaluar la caja abierta global.
  - `movimientos_caja` (INSERT/DELETE) → re-cargar movimientos cuando afecten a la caja activa.
- Reutilizar `fetchCaja` como reconciliador (es ligero: una sola consulta de `cajas` + otra de movimientos cuando hay caja).
- Limpiar el canal al desmontar.

### C. Validación
- Iniciar sesión simultánea con admin, caja y recepción.
- Admin abre caja → en menos de 1 segundo las otras dos sesiones deben mostrarse en POS sin pedir apertura.
- Cualquiera registra un movimiento → aparece al instante en las tres.
- Cualquiera cierra el turno → el panel se actualiza en las tres y vuelve a aparecer "Abrir caja".

## Archivos a tocar
- Migración SQL (políticas RLS + publicación realtime).
- `src/hooks/useCajaSession.ts` (canal realtime).

## Lo que NO cambia
- `useCoworkingData` (ya cumple los requisitos).
- Lógica de cálculo de cierre, IVA, propinas, validación de stock, KDS — intactos.
- Auditoría: cada apertura/movimiento/cierre sigue quedando ligada al `usuario_id` que la ejecutó.
