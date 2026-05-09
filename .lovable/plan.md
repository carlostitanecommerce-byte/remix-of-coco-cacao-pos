## Épica 2: Puente Coworking → POS

### Objetivo
Mantener en `ManageSessionAccountDialog` solo lo que pertenece a la **gestión de la sala** (PAX + amenities incluidos). Eliminar la venta de productos extra desde ese modal y reemplazarla por un botón que redirige al POS llevando contexto de la sesión.

### Cambios

**1. `src/components/coworking/ManageSessionAccountDialog.tsx`**

Conservar:
- Header con cliente + edición de PAX (privadas) y diálogo de recálculo de amenities (`pendingAmenityUpdate`).
- Sección "Estado de la Cuenta" (lista actual de items de la sesión) **solo en modo lectura**: mostrar nombre, cantidad y "Incluido"/precio. Quitar botones +/−, eliminar y "Solicitar cancelación" en esta épica.
  - *Nota:* mantenemos visualización porque el cajero necesita ver lo ya consumido. La gestión de cancelaciones ahora vive en el POS / pestaña de cocina.
- Sección "Beneficios por reclamar" (`missingAmenities`) con su botón "Reclamar" — esto es parte de los amenities incluidos en la tarifa, sigue siendo gestión de sala.
- Realtime de `cancelaciones_items_sesion` y reload — para que la lista se refresque si cocina decide algo.

Eliminar:
- Sección completa "Añadir Consumo Extra" (search + lista `productos` + `handleAdd` / `doAdd`).
- Botones de +/−, eliminar y solicitar cancelación dentro de "Estado de la Cuenta" (los handlers `handleRemove`, `handleUpdateQuantity`, `openCancelDialog`, `submitCancelRequest`, `cancelTarget` state y su `AlertDialog`).
- Imports y estado ya no necesarios: `Search`, `Trash2`, `Ban`, `Textarea`, `Label`, `productos`, `search`, `cancelTarget`, `cancelQty`, `cancelMotivo`, `verificarStock`, `enviarASesionKDS` (queda solo si lo usa la restauración de amenity — sí lo usa en `doRestoreAmenity`, conservarlo).
- El `useEffect` que carga `productos` se reduce a solo `reloadItemsAndCancels()`.

Agregar:
- Botón **"Agregar Consumo en POS"** en el `DialogFooter` (variante `default`, ícono `ShoppingCart`), a la izquierda del botón "Cerrar".
- Handler `handleGoToPos`:
  ```ts
  const handleGoToPos = () => {
    if (!session) return;
    const params = new URLSearchParams({
      session_id: session.id,
      client_name: session.cliente_nombre,
    });
    onClose();
    navigate(`/pos?${params.toString()}`);
  };
  ```
- Importar `useNavigate` de `react-router-dom` y `ShoppingCart` de `lucide-react`.

**2. Fuera de alcance (épicas siguientes)**
- `PosPage.tsx` leyendo `?session_id` y `?client_name` para abrir cuenta abierta — Épica 3.
- Eliminación física de `coworking_session_upsells` — al final.
- Migrar amenities/cancelaciones a `detalle_ventas` — al final.

### Archivos
- `src/components/coworking/ManageSessionAccountDialog.tsx` (refactor: quitar UI de venta, agregar botón puente).
