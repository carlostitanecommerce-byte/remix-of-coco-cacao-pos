## Épica 3: UI de Gestión de Catálogo (Menú)

Construir las dos pestañas que actualmente son placeholders en `MenuPage.tsx`:
1. **Paquetes / Combos** — constructor de paquetes con grupos dinámicos.
2. **Precios Delivery** — CRUD de plataformas + matriz editable de precios con margen neto.

---

### 3.1 — Paquetes Dinámicos (Constructor de Grupos)

**Componente:** `src/components/menu/PaquetesDinamicosTab.tsx`
**Tablas usadas:** `productos` (tipo='paquete'), `paquete_grupos`, `paquete_opciones_grupo`.
**Coexiste con la tabla legacy `paquete_componentes`** (que sigue usando el POS); esta pestaña sólo escribe a las tablas nuevas.

#### Vista lista
Tabla de paquetes (igual estilo que `PaquetesTab` actual): nombre, categoría, precio, # grupos, badge "Dinámico" si tiene `paquete_grupos`, acciones (editar / duplicar / eliminar / activar).

Solo carga `productos` con `tipo='paquete'`. Botón **"Nuevo Paquete"** (admin).

#### Diálogo de edición — dos secciones
**(A) Datos generales del paquete** (igual que `PaquetesTab`): nombre, categoría, precio_venta, imagen, instrucciones, activo. Reusar el patrón de subida al bucket `productos`.

**(B) Constructor de Grupos**

```text
┌─ Grupo: "Elige tu bebida"  · cantidad: [1] · ☑ Obligatorio · ▲▼ ✕ ─┐
│   Opciones:                                                          │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │ 🔍 Buscar producto…                              [+ Agregar]│    │
│   └─────────────────────────────────────────────────────────────┘    │
│   • Café americano               precio_adicional: [  0.00] ✕        │
│   • Latte                        precio_adicional: [ 10.00] ✕        │
│   • Cappuccino                   precio_adicional: [  5.00] ✕        │
└──────────────────────────────────────────────────────────────────────┘

[+ Agregar Grupo]
```

- Cada grupo: input `nombre_grupo`, input numérico `cantidad_incluida` (≥1), switch `es_obligatorio`, botones reordenar (actualizan `orden`), botón eliminar grupo.
- Buscador de productos: input + dropdown filtrando `productos` activos (`tipo='simple'`) por nombre. Click → agrega como opción con `precio_adicional=0`.
- Validaciones al guardar:
  - Nombre del paquete obligatorio.
  - Al menos 1 grupo.
  - Cada grupo debe tener `nombre_grupo`, `cantidad_incluida≥1` y al menos 1 opción.
  - `cantidad_incluida` ≤ número de opciones del grupo.

#### Persistencia
Para simplicidad y consistencia (sin orfanatos): al guardar un paquete existente, **borrar todos sus `paquete_grupos`** (cascade limpia las opciones) y reinsertar todo. Wrap con manejo de error y `audit_logs`.

#### Costo y margen del paquete
Como las opciones son intercambiables, el `costo_total` del producto-paquete se calcula como **promedio del costo de las opciones × cantidad_incluida, sumado por grupo** (referencial). Se persiste en `productos.costo_total` y `margen` para que se vea en lista y en reportes.

> Nota: No se mezcla con `paquete_componentes` (legacy). El POS seguirá funcionando con paquetes legacy. Una migración posterior reemplazará el flujo POS.

---

### 3.2 — Precios Delivery (CRUD plataformas + matriz)

**Componente:** `src/components/menu/PreciosDeliveryTab.tsx`
**Tablas usadas:** `plataformas_delivery`, `producto_precios_delivery`, `productos`.

#### Sección superior — CRUD plataformas
Card con título "Plataformas de delivery". Tabla compacta:

| Plataforma | Comisión % | Activo | Acciones |
|---|---|---|---|
| Uber Eats | 30 | ☑ | ✏️ 🗑️ |

- Botón **"+ Agregar plataforma"** abre dialog con `nombre`, `comision_porcentaje`, switch `activo`.
- Editar inline o por dialog (mismo).
- Eliminar: confirm; si tiene precios asociados (FK CASCADE los borra) avisar antes.
- Solo admin puede modificar.

#### Sección inferior — Matriz de precios

Filtros: input de búsqueda por nombre + select de filtro `Categoría` + switch "Solo activos".

Tabla:

| Producto | Categoría | Costo receta | Precio base | **Uber Eats** | Margen Neto | **Rappi** | Margen Neto | … |
|---|---|---|---|---|---|---|---|---|
| Latte | Café | $18.50 | $55 | [input $65] | $26.00 ✅ | [input $70] | $30.00 ✅ | |

- Filas: `productos` (incluye `tipo='simple'` y `tipo='paquete'`) con `activo=true`.
- Columnas dinámicas: una pareja **(Precio, Margen Neto)** por cada plataforma activa.
- Celda de precio: `<Input type="number">` controlado; `onBlur` → upsert en `producto_precios_delivery` (UNIQUE producto+plataforma).
- Margen neto calculado en cliente:
  ```
  margenNeto = (precio - precio * comision%/100) - costo_total
  ```
  - Color: verde si > 30%, amarillo 10–30%, rojo < 10% (sobre `precio`).
- Si el precio se vacía → DELETE de la fila correspondiente.
- Guardado optimista con `toast` y refetch.
- Realtime opcional sobre `producto_precios_delivery` y `plataformas_delivery` para mantener sincronía entre pestañas.

Permisos: admin/supervisor pueden editar precios; solo admin puede gestionar plataformas (RLS ya lo aplica; el botón se deshabilita en UI para no-admin).

---

### Wiring en `MenuPage.tsx`
Reemplazar los dos placeholders por los nuevos componentes:
```tsx
<TabsContent value="paquetes"><PaquetesDinamicosTab isAdmin={isAdmin} /></TabsContent>
<TabsContent value="delivery"><PreciosDeliveryTab isAdmin={isAdmin} /></TabsContent>
```

---

### Auditoría
Insertar registros en `audit_logs` para: crear/editar/eliminar paquete dinámico, crear/editar/eliminar plataforma, y batch de cambios de precios delivery por producto.

### Archivos
- **Crear:** `src/components/menu/PaquetesDinamicosTab.tsx`
- **Crear:** `src/components/menu/PreciosDeliveryTab.tsx`
- **Editar:** `src/pages/MenuPage.tsx` (sustituir placeholders)

### Sin cambios de schema
La épica 1 ya creó las 4 tablas necesarias.
