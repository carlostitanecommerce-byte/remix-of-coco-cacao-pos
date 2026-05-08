# Redirigir checkout de coworking a Caja

## Problema
Al registrar la salida de una sesión de coworking, `CheckoutDialog` redirige a `/pos?session=...`, pero el cobro ahora se hace en la sección de Caja. Además, `PosPage` ya no procesa el query param, por lo que la sesión no se carga automáticamente en ningún lado.

## Cambios

### 1. `src/components/coworking/CheckoutDialog.tsx` (línea 72)
Cambiar la redirección:
- Antes: `navigate(\`/pos?session=${summary.session.id}\`)`
- Después: `navigate(\`/caja?session=${summary.session.id}\`)`

### 2. `src/pages/CajaPage.tsx`
- Leer `session` desde `useSearchParams` (react-router-dom).
- Mantener un estado local `pendingSessionId` inicializado con ese valor.
- Pasarlo a `<CoworkingSessionSelector pendingSessionId={pendingSessionId} onPendingConsumed={...} />`. El selector ya soporta esos props y autoejecuta `handleSelect` cuando la sesión aparece en la lista de pendientes de pago.
- Al consumir, limpiar el query param con `setSearchParams({})` para evitar reimportaciones.
- Si la caja está cerrada y hay `?session=...`, mostrar primero el diálogo de apertura (comportamiento actual); el param persiste y se procesará cuando se abra la caja.

## Resultado
Al hacer checkout de una sesión de coworking, el usuario va directo a `/caja`, la sesión se importa automáticamente al ticket activo (panel derecho `CajaCheckoutPanel`) y puede proceder al cobro sin pasos extras.
