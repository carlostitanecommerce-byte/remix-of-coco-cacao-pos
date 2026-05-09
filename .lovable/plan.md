## Épica 3: POS en modo "Cuenta Abierta"

Adapta el POS para reconocer cuándo está cargando consumo a una sesión de coworking en lugar de procesar una venta normal, mostrando un banner contextual, cambiando el CTA, y aplicando precios especiales de la tarifa de la sesión automáticamente.

### Cambios

**1. `src/stores/cartStore.ts` — Activación sin importar items**

Reutilizamos los campos existentes `coworkingSessionId` / `clienteNombre` (ya están en el store). Añadimos:

- `setActiveCoworkingSession(sessionId: string | null, clienteNombre: string | null)`: activa el modo cuenta abierta sin tocar `items` (el flujo actual de `importCoworkingSession` queda intacto para Caja).
- `tarifaUpsells: Record<string, number>` (mapa `producto_id → precio_especial`) y `setTarifaUpsells(map)`.
- En `clear()` también resetea `tarifaUpsells`.

**2. `src/pages/PosPage.tsx` — Detección de contexto + motor de upsells**

- Leer `useSearchParams()` al montar. Si hay `session_id`:
  - Llamar `setActiveCoworkingSession(session_id, client_name)`.
  - Consultar `coworking_sessions` para obtener `tarifa_id`, luego `tarifa_upsells` (`producto_id`, `precio_especial`) y guardar el mapa con `setTarifaUpsells`.
  - Mostrar `toast.success` con el cliente.
- Si NO hay `session_id` en la URL, limpiar el modo (`setActiveCoworkingSession(null, null)` + `setTarifaUpsells({})`) para no arrastrar estado entre visitas.
- En `addProduct`: antes de pushear al carrito, si el `producto_id` existe en `tarifaUpsells`, reemplazar `precio_venta` por el precio especial. Pasar también una pista visual al item (`precio_especial: true`) — opcional sólo para mostrar badge.
- En `goToCheckout`: si hay `coworkingSessionId`, en lugar de navegar a `/caja` (flujo de cobro tradicional), invocar la lógica de "Cargar a Cuenta" → insertar líneas en `detalle_ventas` con `coworking_session_id` y `venta_id = NULL` (reutilizando la base preparada en Épica 1), enviar a KDS, limpiar carrito, navegar de regreso a `/coworking`.
  - Esta inserción se encapsula en un helper `chargeToOpenAccount()` dentro de la misma página (o en un hook nuevo `useChargeOpenAccount.ts` si crece). Incluye `verificarStock` por línea antes de insertar.

**3. `src/components/pos/CartPanel.tsx` — Banner y CTA**

Aceptar dos props nuevas opcionales:
- `coworkingSessionActive?: boolean`
- `clienteNombre?: string | null`

Cuando `coworkingSessionActive` sea true, renderizar arriba del listado un banner:

```
┌────────────────────────────────────────────┐
│ 📌 Cargando a sesión de Coworking          │
│    Cliente: {clienteNombre}                │
└────────────────────────────────────────────┘
```

Estilo: `bg-primary/10 border border-primary/30 rounded-md p-2 text-sm text-primary`.

El botón principal de checkout se queda en `PosPage.tsx` (no en CartPanel). Allí cambiamos el texto/icono condicional:
- Modo normal → "Procesar pago en Caja" (desktop) / "Cobrar" (mobile sheet).
- Modo cuenta abierta → "Cargar a Cuenta" con icono `ClipboardCheck` o `Receipt`.

**4. UX: badge de precio especial en items**

En `CartPanel.tsx`, si un item tiene `precio_especial === true`, agregar un mini-badge "Tarifa Coworking" junto al precio unitario para que el cajero vea por qué el precio bajó.

### Fuera de alcance (siguientes épicas)

- Implementación del checkout final que convierte líneas abiertas en una venta cerrada (UPDATE `venta_id`).
- Eliminación física de `coworking_session_upsells`.
- Migración del flujo amenities a `detalle_ventas`.

### Detalles técnicos

- `tarifaUpsells` se hidrata cada vez que `session_id` cambie en la URL; si la sesión no tiene `tarifa_id`, queda vacío.
- El URL-effect debe correr ANTES de que el usuario interactúe — usar `useEffect` con `[searchParams]` y un guard de carga (`isLoadingTarifa`) opcional para evitar agregar productos sin upsells aún cargados.
- Mantener `sessionStorage` persistence pero sobreescribir en cada montaje del POS según la URL (la URL es la fuente de verdad del modo).
- RLS ya permite INSERT en `detalle_ventas` con `venta_id IS NULL` cuando la sesión está activa (Épica 1).
- Tipos: extender `CartItem` opcional con `precio_especial?: boolean`.