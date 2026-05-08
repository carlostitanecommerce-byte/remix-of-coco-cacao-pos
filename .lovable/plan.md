
# Auditoría de Producción — Módulo Coworking

Veredicto: **NO está listo para producción todavía.** El núcleo funcional es sólido (RPC atómica de cancelación, snapshots inmutables de tarifa, realtime, RBAC, audit logs), pero hay **3 bugs bloqueantes** y **6 mejoras recomendadas** antes del despliegue.

---

## ✅ Lo que ya está sólido

- **Cancelación atómica** (`cancelar_sesion_coworking`): mermas + descuento de stock + limpieza de upsells + estado + cierre de solicitud + audit en una sola transacción.
- **Snapshot inmutable de tarifa al check-in** (`tarifa_snapshot` con precio_base, método_fracción, tolerancia, amenities, upsells). El cobro usa el snapshot, no la tarifa actual.
- **Reabrir sesión** vía RPC con RBAC (admin/supervisor/caja/recepción).
- **Folio KDS coworking independiente** (`next_kds_coworking_folio`) que no choca con ventas.
- **Realtime** en `coworking_sessions`, `coworking_reservaciones`, `areas_coworking`, `cancelaciones_items_sesion` y notificaciones toast a solicitante y cocina.
- **Locks anti-doble-click** (`inFlightRef` / `mutationLockRef`) en CheckIn, QuickCheckIn, Checkout, Manage, Cancel.
- **Rollback explícito** si falla el insert de upsells tras crear sesión.
- **Validación de stock** en cada Add/Restore/Increment.
- **RLS coherente**: solicitudes con visibilidad propia + admin, cancelaciones con UPDATE solo cocina/admin.
- **Audit logs** en cada acción transaccional (check-in, checkout, cancelar, reagendar, conflicto, reabrir, recalc amenities).
- **OccupancyGrid + ActiveSessionsTable + SessionTimer + Reservaciones (calendario y lista)** funcionalmente completos.

---

## 🔴 Bugs bloqueantes

### B1. Inconsistencia de timezone en `handleCheckOut` (CoworkingPage.tsx:42)
`fecha_salida_real` se persiste con `new Date().toISOString()` (UTC), pero el resto del módulo usa `nowCDMX()` / `dateToCDMX()` con offset `-06:00`. Esto rompe la regla global del proyecto y hace que checkouts disparados desde la grilla queden en UTC mientras los disparados desde CheckoutDialog quedan en CDMX. Reportes y diferencias horarias se desalinean.
**Fix:** usar `nowCDMX()` en lugar de `new Date().toISOString()`.

### B2. `checkReservationConflict` interpreta horas en TZ del navegador, no en CDMX (conflictCheck.ts:20-21, 41-42, 53-54, 78-79, 92-93)
`new Date(\`${fecha}T${hora}\`)` usa la zona del cliente. Un cajero con laptop en otra zona horaria comparará rangos desplazados contra `fecha_inicio`/`fecha_fin_estimada` (que sí están en CDMX). Resultado: falsos OK / falsos conflictos en doble booking.
**Fix:** anclar todas las construcciones de Date al offset CDMX (sufijo `-06:00`) o trabajar en minutos del día como enteros.

### B3. Reservaciones del día no bloquean check-in espontáneo (CheckInDialog + useCoworkingData)
`getAvailablePax` solo descuenta sesiones activas; ignora `coworking_reservaciones` confirmadas/pendientes para hoy. Un walk-in puede ocupar pax/área que ya está reservada para más tarde el mismo día. El conflicto se vería recién cuando intenten arrancar la reservación.
**Fix:** considerar reservaciones del día en `getAvailablePax` cuando el horario esté próximo (o al menos advertir al cajero), o mover la validación al servidor con un trigger en `coworking_sessions`.

---

## 🟡 Mejoras recomendadas (no bloquean, pero conviene antes de prod)

### M1. Cancelación de reservación sin confirmación (ReservacionesTab.tsx:166)
`handleCancel` ejecuta el UPDATE inmediatamente al click. Riesgo de cancelar por error.
**Fix:** envolver en `AlertDialog` con motivo opcional.

### M2. Mutación inline de `session.pax_count` (ManageSessionAccountDialog.tsx:457)
`session.pax_count = pax` muta una prop. Funciona porque luego se hace `onSuccess()` y refetch, pero es antipatrón y puede provocar UI desincronizada si el refetch falla.
**Fix:** confiar solo en `onSuccess` + estado del padre.

### M3. Reducción de pax no compensa amenities ya enviados a cocina
Si pax baja de 4 → 2, se actualiza `cantidad` en `coworking_session_upsells` pero no se cancela lo que ya fue a cocina ni se registra merma. Posible sobre-servicio sin trazabilidad.
**Fix:** cuando `delta < 0` para amenities, abrir el flujo de "Solicitar cancelación a cocina" en lugar de mutar silencioso.

### M4. CheckIn sin tarifa cuando hay varias aplicables
Si el área tiene 2+ tarifas activas, no se autoselecciona ni se obliga a elegir; la sesión queda con `tarifa_id = null` y `tarifa_snapshot = null`. El cobro luego usa `area.precio_por_hora` con método `15_min` y tolerancia 0 por defecto. Funciona, pero el cajero no se entera de que cobró sin tarifa.
**Fix:** marcar la tarifa como requerida cuando `applicableTarifas.length > 1`, o mostrar un badge "Sin tarifa — se cobrará tarifa de área".

### M5. Race en `handleCheckOut` doble-pestaña
Si dos pestañas abren checkout simultáneamente, ambas pasan el guard `if (!fecha_salida_real)` y la segunda sobrescribe a la primera. La diferencia suele ser de milisegundos, pero los totales pueden divergir.
**Fix:** envolver el "freeze" en una RPC `freeze_checkout_coworking(p_session_id)` con `UPDATE ... WHERE fecha_salida_real IS NULL RETURNING *`.

### M6. SessionTimer con N intervalos
Cada fila de `ActiveSessionsTable` monta su propio `setInterval(1000)`. Con 20+ sesiones activas son 20+ timers. Hoy es aceptable, pero si crece la operación conviene un `useNow` global compartido (context o store).

---

## 🟢 Observaciones menores (post-launch)

- `CheckoutDialog` redirige a `/caja?session=...`; depende de que el POS interprete el parámetro (verificar en auditoría POS, no aquí).
- `enviarASesionKDS` etiqueta amenities con `☕` y extras pagados con sufijo `(coworking — cliente)`. Consistente.
- `ManageSessionAccountDialog`: ~890 líneas. Funcional pero conviene partir en sub-componentes (`AccountItemsList`, `MissingAmenities`, `ProductSearch`, `CancelItemDialog`) para mantenibilidad futura.
- Permisos de "Cancelar reservación" no están restringidos por rol; si la política RLS lo permite a todos los autenticados, está bien, pero conviene confirmarlo con la matriz de roles.
- `handleRemove` de items con `requiere_preparacion=false` borra duro sin merma. Correcto porque nunca se descontó stock (la deducción ocurre en POS al cobrar), pero documentarlo.

---

## Recomendación

**Antes de publicar:** corregir B1, B2 y B3 (un solo PR, ~1-2 h de trabajo).
**Sprint siguiente:** M1–M5 (M6 puede esperar).

Si lo apruebas, en build mode implemento los 3 bloqueantes en una sola pasada con migración SQL si fuera necesaria para B3.
