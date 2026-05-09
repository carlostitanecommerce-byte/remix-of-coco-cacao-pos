## POS: paquetes dinámicos con selección de opciones

Adaptar el flujo de POS para que al tocar un producto `tipo='paquete'` se abra un modal de selección de grupos antes de añadir al carrito, y que el ticket muestre y cobre las opciones elegidas (con sus precios adicionales).

### 1. Estructura del CartItem (`src/components/pos/types.ts`)

Agregar soporte para opciones anidadas y para que múltiples paquetes "iguales" coexistan con distinta configuración:

```ts
export interface PaqueteOpcionSeleccionada {
  grupo_id: string;
  nombre_grupo: string;
  producto_id: string;
  nombre_producto: string;
  precio_adicional: number; // 0 si no aplica
}

export interface CartItem {
  lineId: string;        // NUEVO — identificador único de línea (uuid para paquetes; = producto_id para simples)
  // ... campos existentes
  opciones?: PaqueteOpcionSeleccionada[]; // NUEVO — solo para paquetes dinámicos
  // `componentes` se mantiene para paquetes legacy (compatibilidad con KDS y prorrateo en ConfirmVentaDialog)
}
```

`precio_unitario` del paquete = `precio_base + Σ precio_adicional` de las opciones; `subtotal = precio_unitario * cantidad`.

### 2. Cart store (`src/stores/cartStore.ts`)

- Cambiar todas las operaciones de carrito para usar `lineId` en lugar de `producto_id`: `updateQty(lineId, delta)`, `setQty`, `updateNotas`, `removeItem`.
- `addOrIncrementProduct`: sigue mergeando por `producto_id` y reusa `lineId = producto_id`.
- `addOrIncrementPaquete`:
  - Si el paquete es **dinámico** (tiene `opciones`): NO mergear. Crear siempre línea nueva con `lineId = crypto.randomUUID()`.
  - Si es **legacy** (sin `opciones`, viene con `componentes`): mantener merge actual por `producto_id`.
- `importCoworkingSession`: rellenar `lineId` con `producto_id` si falta (compatibilidad con items históricos en sessionStorage).
- Migración suave: al hidratar desde sessionStorage, si un item no trae `lineId`, asignar `lineId = producto_id`.

### 3. Modal de selección (`src/components/pos/PaqueteSelectorDialog.tsx`, nuevo)

Props: `paquete: { id, nombre, precio_venta }`, `open`, `onOpenChange`, `onConfirm(opciones, precioFinal)`.

Comportamiento:
- Al abrir, carga `paquete_grupos` + `paquete_opciones_grupo` con join a `productos(nombre, activo)` filtrando opciones inactivas.
- Renderiza cada grupo como card con título, badge "Obligatorio" y contador `seleccionadas / cantidad_incluida`.
- Cada opción es un botón clickeable; muestra `+ $X.XX` cuando `precio_adicional > 0`.
- Selección con repetición permitida: el cajero puede tocar la misma opción `cantidad_incluida` veces; cada toque empuja una entrada a `opciones[grupo_id]`. Se puede quitar tocando un chip "✕" sobre las elegidas.
- Resumen pegajoso al pie: `Precio base + extras = Total`. Botón "Agregar al ticket" deshabilitado hasta cumplir todas las cantidades obligatorias.
- Validación: si un grupo `es_obligatorio = false`, permitir 0 selecciones.

### 4. Integración en `PosPage.tsx`

- Estado `paqueteSeleccionado: Producto | null`.
- En `addProduct`, si `p.tipo === 'paquete'`:
  - Mantener la validación de stock (`validar_stock_paquete`).
  - **Cambio**: en vez de leer `paquete_componentes` directamente, abrir `PaqueteSelectorDialog`. Si el paquete no tiene `paquete_grupos` (legacy), mantener el flujo actual (componentes fijos). Detectar con un count rápido a `paquete_grupos`.
- `onConfirm` del modal: construir `componentes` derivado de `opciones` (para que KDS y prorrateo en `ConfirmVentaDialog` sigan funcionando sin cambios) y llamar `addOrIncrementPaquete` con `lineId = uuid`, `opciones`, `componentes`, `precio_unitario = base + Σ extras`.

### 5. CartPanel (`src/components/pos/CartPanel.tsx`)

- Cambiar handlers a `lineId` (props: `onUpdateQty(lineId, delta)`, `onRemove(lineId)`, etc.).
- En el render del item, si es paquete con `opciones`, listar las opciones agrupadas por `nombre_grupo` indentadas bajo el nombre, con `+ $X.XX` cuando aplique. Si no tiene `opciones`, conservar el render actual de `componentes`.
- Subtotal por línea ya viene calculado; nada cambia ahí.

### 6. Persistencia y KDS (sin migración de DB)

- `ConfirmVentaDialog.tsx` ya consume `pq.componentes` para prorratear precios y construir KDS. Como en el paso 4 generamos `componentes` a partir de las opciones elegidas (mapeando cada opción a `{ producto_id, nombre, cantidad: 1 }`), no se requiere modificar la persistencia.
- El nombre que llega al KDS seguirá viendo `Componente (📦 Paquete)`. Aceptable.
- No se requiere migración SQL en esta épica.

### 7. Validación post-cambio

- Probar paquete legacy (con `paquete_componentes`, sin `paquete_grupos`) → flujo actual sin modal, sigue funcionando.
- Paquete dinámico → abre modal, valida obligatorios, agrega al ticket con extras sumados.
- Dos paquetes dinámicos del mismo producto con distintas opciones → dos líneas separadas en el ticket.
- Cobro normal en `/caja` → venta y KDS generados correctamente.

### Archivos afectados

- `src/components/pos/types.ts` (editar)
- `src/stores/cartStore.ts` (editar — refactor a `lineId`)
- `src/components/pos/PaqueteSelectorDialog.tsx` (crear)
- `src/pages/PosPage.tsx` (editar — abrir modal + cablear handlers por `lineId`)
- `src/components/pos/CartPanel.tsx` (editar — handlers por `lineId` + render de opciones)
