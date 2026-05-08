## Plan: Ajustes en sección Caja

### 1. Diálogo de apertura de caja: permitir cerrar
`src/components/pos/AperturaCajaDialog.tsx`
- Añadir prop opcional `onClose?: () => void`.
- Cambiar `<Dialog open={open}>` por `<Dialog open={open} onOpenChange={(v)=>{ if(!v && !saving) onClose?.(); }}>`.
- Quitar `onInteractOutside={e => e.preventDefault()}` para permitir cerrar al hacer clic fuera o con ESC.
- Agregar botón "Cancelar" en `DialogFooter` que invoque `onClose` (junto al botón "Abrir Caja").

`src/pages/CajaPage.tsx`
- Pasar `onClose={() => navigate(-1)}` (usar `useNavigate` de react-router-dom). Si no hay historial, navegar a `/`. Esto deja salir al usuario hacia POS u otra sección sin estar bloqueado.

### 2. Sesiones pendientes de cobro de coworking en Caja
`src/pages/CajaPage.tsx`
- Importar `CoworkingSessionSelector` y agregarlo dentro de la página (visible solo si `cajaAbierta`, debajo del header de control de caja, antes de Solicitudes/Historial).
- Implementar handler `onImportSession(items, sessionId, clienteNombre)` que navegue a `/pos?session=<sessionId>` para que el flujo siga siendo el mismo (POS reconstruye el carrito al recibir el query param).

`src/pages/PosPage.tsx`
- Agregar `useSearchParams` para detectar `?session=<id>`.
- Si llega ese parámetro y aún no se ha importado, llamar a la lógica de importación de sesión: cargar la sesión (reusando misma lógica de `CoworkingSessionSelector.handleSelect` extraída a util `src/lib/coworkingCart.ts`) y pre-cargar `items` en el carrito.
- Limpiar el query param tras importar para no re-importar al recargar.

### 3. Refactor menor (extraer lógica reutilizable)
- Crear `src/lib/coworkingCart.ts` con función `buildCartItemsFromSession(sessionId): Promise<{items: CartItem[], clienteNombre: string} | { error: string }>` que contenga la matemática de tiempo/tarifa/upsells (idéntica a `handleSelect` actual).
- `CoworkingSessionSelector` y `PosPage` usan esta util — mantiene una sola fuente de verdad.

### Resultado
- El diálogo de apertura ya no atrapa al usuario: puede cerrarlo con ESC, clic fuera o botón Cancelar.
- En `/caja` (con caja abierta) aparece de nuevo el panel de "Sesiones Pendientes de Pago"; al hacer clic en "Cobrar" se redirige a `/pos?session=…` y el ticket se llena automáticamente para procesar el cobro como antes.
