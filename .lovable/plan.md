## Plan: Procesar ventas desde la sección Caja

### Diagnóstico de UX
Hoy el ticket vive sólo en POS. Mover toda la lógica de cobro a Caja sin duplicar estado requiere un **carrito compartido global**, para que POS lo construya y Caja lo cobre — ambas vistas lo ven en tiempo real.

```text
┌──────────── /pos ────────────┐    ┌──────────── /caja ────────────┐
│ Categorías + Grid productos  │    │ [Header caja]   │              │
│ (3/5)                        │    │ [Coworking]     │   TICKET     │
│                              │    │ [Solicitudes]   │  (cobro)     │
│  TICKET (live, solo lectura) │    │ [Historial]     │  Métodos pago│
│  (2/5) — botón "Ir a cobrar" │    │  (3/5)          │  Propina     │
└──────────────────────────────┘    │                 │  [Cobrar]    │
                                    └─────────────────┴──────────────┘
```

### 1. Estado global del ticket — Zustand
Nuevo archivo `src/stores/cartStore.ts`:
- `items: CartItem[]`, `coworkingSessionId: string | null`, `clienteNombre: string | null`.
- Acciones: `addItem`, `updateQty`, `updateNotas`, `removeItem`, `clear`, `importCoworkingSession(items, sessionId, clienteNombre)`, `setItems`.
- Persistencia ligera en `sessionStorage` (sobrevive recargas del POS/Caja en la misma pestaña).

### 2. POS (`src/pages/PosPage.tsx`)
- Reemplazar `useState` local por el store.
- Quitar el `useEffect` de `pos_pending_import` (ya no aplica; el store maneja la importación directamente).
- Mantener `ProductGrid` + `CartPanel` (sigue mostrando el ticket en construcción).
- Agregar al fondo del `CartPanel` (o como botón flotante en POS) un botón **"Procesar pago en Caja →"** que navegue a `/caja`. Habilitado sólo si `items.length > 0`.

### 3. CajaPage (`src/pages/CajaPage.tsx`) — nuevo layout 2 columnas (cuando caja abierta)
```
[Card "Control de Caja"]                 [Ticket activo + Cobro]
[Sesiones pendientes coworking]          (sticky, panel derecho)
[Solicitudes cancelación]
[Historial de ventas]
```
- Layout: `grid-cols-1 lg:grid-cols-5`. Izquierda `lg:col-span-3` (lo que ya hay). Derecha `lg:col-span-2` con un nuevo componente `<CajaCheckoutPanel />` sticky.
- `CoworkingSessionSelector.onImportSession` → llama a `cartStore.importCoworkingSession(...)` directamente (sin navegar al POS).
- Si no hay caja abierta, todo lo de cobro queda oculto por el diálogo de apertura (ya funciona).

### 4. Nuevo `src/components/pos/CajaCheckoutPanel.tsx`
Reúne lo que antes vivía en POS:
- Lista del ticket (reusa `<CartPanel>` en modo lectura ligera o renderiza propio similar).
- Selector de **tipo de consumo** (`sitio` / `llevar`) — `Select`.
- Selector de **método de pago** (`efectivo` / `tarjeta` / `transferencia` / `mixto`) — `Select`.
- Si `mixto`: 3 inputs (`efectivo`, `tarjeta`, `transferencia`) que deben sumar al total.
- **Propina**: botones rápidos 0%, 10%, 15% + input manual; toggle "Propina en digital" si método ≠ efectivo (para `mixed_payment`).
- Cálculo en vivo: subtotal, IVA (informativo), comisión bancaria (3.5% sobre tarjeta — no se cobra al cliente, sólo se muestra), propina, total a cobrar.
- Botón **"Cobrar $X"** → arma `VentaSummary` y abre `ConfirmVentaDialog`.
- Botón "Limpiar ticket".
- Si el ticket está vacío: estado vacío con CTA "Agregar productos en POS →".

### 5. Confirmación de venta
- Reusar `ConfirmVentaDialog` tal cual (ya hace todo: validación stock, insert venta + detalle, KDS, cierre coworking, audit log, ticket imprimible).
- En `onSuccess`: `cartStore.clear()` y refetch de ventas/sesiones.

### 6. Limpieza
- `CartPanel` en POS sigue editable (qty, notas, eliminar). El mismo componente con la misma store en Caja también es editable, así el operador de caja puede ajustar antes de cobrar.
- Eliminar el helper `sessionStorage.pos_pending_import` (sustituido por el store persistido).
- Sin cambios en BD ni edge functions.

### 7. Permisos / navegación
- "Procesar pago en Caja" sólo visible para roles con acceso a `/caja` (ya filtrado por sidebar).
- Si un usuario sin permiso a Caja construye un ticket, muestra mensaje "Pide al cajero que cobre este ticket" — caso edge, todos los roles del POS también tienen Caja.

### Resultado
- POS = construir ticket (touch-friendly grid).
- Caja = control de caja + importar sesiones coworking + **procesar cobro** (método pago, propina, mixto, confirmar venta, ticket impresión, KDS) + historial + solicitudes.
- Ticket sincronizado entre ambas vistas vía store.
