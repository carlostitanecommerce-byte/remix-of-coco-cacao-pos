# Auditoría End-to-End — Módulo Coworking

Veredicto: **Funcional y maduro, pero NO production-ready** sin correcciones. La arquitectura es sólida (snapshot inmutable de tarifas, ciclo de vida coordinado con POS, validación de conflictos en reservaciones, RLS aplicada), pero hay **6 hallazgos** que afectan integridad de datos, integridad de inventario y experiencia operativa. 3 son de prioridad alta.

---

## Hallazgos

### 🔴 ALTA — Integridad de datos

**H1. Cancelación de sesión no libera inventario comprometido (amenities)**
Cuando una sesión activa se cancela (admin directo o vía solicitud aprobada), sólo se cambia `estado='cancelado'` y se pone `monto_acumulado=0`. **Pero los registros de `coworking_session_upsells` permanecen** y, aún más grave, las amenities ya entregadas físicamente al cliente **no descuentan inventario** porque el descuento real ocurre cuando el POS factura la venta — que ya no se hará.
Consecuencia: stock teórico queda inflado vs stock real (cliente se llevó el café cortesía pero el sistema cree que sigue ahí).

**H2. Race condition en `getAvailablePax` durante check-in concurrente**
`CheckInDialog` y `QuickCheckInButton` validan capacidad en cliente con `getAvailablePax`, que lee del estado React local (snapshot del último realtime). Dos cajeros que registren entradas simultáneas en la misma área pública pueden **superar la capacidad** del área. No hay validación atómica en el servidor (no existe trigger ni constraint).

**H3. `QuickCheckInButton` no congela tarifa, amenities ni upsells**
A diferencia de `CheckInDialog`, el check-in rápido desde reservación inserta la sesión **sin** `tarifa_id`, `tarifa_snapshot`, ni inserta amenities/upsells incluidos. Resultado: al hacer checkout, el cálculo cae al precio base del área (no a la tarifa aplicable) y el cliente **no recibe los amenities incluidos** a los que tendría derecho. Inconsistencia comercial directa.

### 🟡 MEDIA — Integridad operativa

**H4. Falta lock anti doble-clic en check-in y check-out**
- `CheckInDialog.handleCheckIn`: no usa `useRef` lock; doble-click rápido puede crear **dos sesiones** simultáneas para el mismo cliente (el `setCreating` no es síncrono).
- `CheckoutDialog.handleConfirm`: no tiene `disabled` ni lock; doble-click puede mover la sesión 2 veces a `pendiente_pago` y disparar dos navegaciones al POS.
- `QuickCheckInButton`: sí tiene `disabled={loading}`, pero también necesita ref-lock síncrono.

**H5. Inserts secuenciales en bucle (no batch) durante check-in**
`CheckInDialog` inserta amenities y extras en bucle `for ... await` (1 round-trip por item). Con tarifa que tenga 4 amenities + 2 upsells + 5 pax, son **6 INSERTs en serie** = ~600-1200ms de latencia post-check-in. Riesgo: si una falla a mitad, la sesión queda con cuenta incompleta sin rollback.

### 🟢 BAJA — UX / pulido

**H6. Sin botón de "Imprimir resumen de check-out"**
El `CheckoutDialog` muestra un desglose detallado (tiempo contratado, excedente, tolerancia, upsells), pero al confirmar redirige al POS y se pierde. No hay forma de imprimir/entregar al cliente el detalle del cobro de coworking previo al ticket fiscal.

---

## Plan de remediación

### Fase A — Integridad crítica (urgente)

1. **Limpiar upsells y reintegrar inventario al cancelar sesión**
   Crear trigger DB `trg_cleanup_session_on_cancel` sobre `coworking_sessions` que, cuando `estado` pase a `cancelado`:
   - Borre `coworking_session_upsells` de la sesión.
   - **No** descuente inventario (la lógica actual no descontó porque la venta nunca se completó — el upsell sólo "compromete" stock; al cancelar simplemente lo libera).
   - Si en el futuro la cancelación ocurre **después** de entregar amenities físicos, requerir registrar merma manual desde el flujo de cancelación.

2. **Validación atómica de capacidad en INSERT de `coworking_sessions`**
   Trigger `BEFORE INSERT` que recalcule en servidor `SUM(pax_count) WHERE area_id = X AND estado = 'activo'` y rechace si supera `capacidad_pax` (privadas: rechazar si ya existe alguna activa). Cierra H2 sin tocar UI.

3. **`QuickCheckInButton` debe replicar la lógica de `CheckInDialog`**
   - Cargar tarifas aplicables al área de la reservación.
   - Si hay exactamente 1 tarifa aplicable: usarla automáticamente con su snapshot completo.
   - Si hay >1: abrir el `CheckInDialog` pre-poblado en lugar del check-in directo (cajero elige tarifa).
   - Insertar amenities con cantidad `cantidad_incluida * pax`.

### Fase B — Robustez operativa

4. **Locks anti doble-clic con `useRef`** en `CheckInDialog`, `CheckoutDialog`, `QuickCheckInButton` (mismo patrón usado en `ConfirmVentaDialog` Fase B del POS).

5. **Batch insert de amenities + extras** en check-in usando `supabase.from('coworking_session_upsells').insert([...])` con un único array. Si falla, abortar y borrar la sesión recién creada (rollback explícito).

### Fase C — Pulido UX

6. **Botón "Imprimir Resumen Pre-cobro" en `CheckoutDialog`** que reutiliza el mismo patrón CSS `@media print` ya existente en `ConfirmVentaDialog`/`TicketReimprimirDialog`. Permite entregar al cliente el desglose de coworking antes de pasar a caja.

---

## Notas técnicas

- Las RLS sobre `coworking_sessions`, `coworking_session_upsells` y `coworking_reservaciones` son correctas (insert restringido a `auth.uid()`, update propio o admin).
- El snapshot inmutable `tarifa_snapshot` está bien implementado y resiste cambios futuros de tarifas — esto es excelente.
- El sistema de conflictos de reservación (`conflictCheck.ts`) cubre tanto reservaciones contra reservaciones como reservaciones contra sesiones activas. Diferencia bien áreas privadas vs públicas.
- El ciclo `activo → pendiente_pago → finalizado/cancelado` está coordinado con el POS vía `coworking_session_id` en `ventas`.

Tras Fases A+B+C el módulo queda production-ready con el mismo nivel que el POS post-auditoría.
