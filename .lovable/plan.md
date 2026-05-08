## Plan: Nueva sección "Caja"

Mover toda la lógica de caja (apertura, cierre, movimientos, historial de ventas del turno) a una página propia accesible desde el sidebar, debajo de POS. El POS queda intacto como ticket-builder puro.

### 1. Nueva página `src/pages/CajaPage.tsx`
Componente que reúne:
- `useCajaSession()` (ya existe — sin cambios)
- `AperturaCajaDialog` — bloqueante si no hay caja abierta
- Header con estado de caja (abierta/cerrada, hora apertura, fondo fijo, usuario)
- Botón "Cerrar Caja" → `CierreCajaDialog`
- `MovimientosCajaPanel` (entradas/salidas)
- `VentasTurnoPanel` (historial de ventas del turno con cancelar/cambiar pago/reimprimir, según rol)
- `SolicitudesCancelacionPanel` (solicitudes pendientes de cancelación de ventas) — solo admin/supervisor

Layout limpio en una sola columna con tarjetas, sin grid POS.

### 2. Sidebar `src/components/AppSidebar.tsx`
Agregar item "Caja" justo debajo de "POS":
```ts
{ title: 'Caja', url: '/caja', icon: Wallet, allowedRoles: ['administrador','supervisor','caja','recepcion'] }
```
(import `Wallet` de lucide-react).

### 3. Ruteo `src/App.tsx`
Nueva ruta protegida `/caja` con los mismos roles que POS, envuelta en `DashboardLayout`.

### 4. Sin cambios en
- `PosPage.tsx`, `CartPanel.tsx`, `ProductGrid.tsx` (siguen siendo ticket-only)
- Hook `useCajaSession.ts` (ya es compartido y reactivo)
- Diálogos existentes (`AperturaCajaDialog`, `CierreCajaDialog`, `MovimientosCajaPanel`, `VentasTurnoPanel`, `SolicitudesCancelacionPanel`, `CancelVentaDialog`, `CambiarMetodoPagoDialog`, `TicketReimprimirDialog`) — se reutilizan tal cual.
- Base de datos — sin migraciones.

### Resultado
- `/pos` → solo construir ticket.
- `/caja` → control de caja completo (abrir, movimientos, cerrar, historial de ventas, solicitudes).
- Visible para administrador, supervisor, caja, recepción.
