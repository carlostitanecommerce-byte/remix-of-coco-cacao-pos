## Épica 2: Reestructuración de Navegación (Back of House vs Front of House)

Separar el almacén (insumos/compras/mermas) del catálogo de venta (productos, paquetes, precios delivery).

---

### 2.1 — Nuevo item "Menú" en `AppSidebar.tsx`

- Agregar entrada en `allMenuItems` justo **debajo de "Inventarios"**:
  - `title: 'Menú'`, `url: '/menu'`, `icon: BookOpen` (ícono tipo carta de menú de restaurante, importado de `lucide-react`).
  - `allowedRoles: ['administrador', 'supervisor']`.

### 2.2 — Limpiar `InventariosPage.tsx`

Quitar de la página y del `<TabsList>`:
- Pestaña **Productos & Recetas** (`ProductosTab`).
- Pestaña **Paquetes** (`PaquetesTab`).
- Imports asociados.

Pestañas que permanecen: **Categorías, Insumos, Compras, Mermas**.

`defaultValue` sigue en `"categorias"`.

> Los archivos `ProductosTab.tsx` y `PaquetesTab.tsx` **no se borran**; sólo dejan de importarse aquí porque se reutilizarán en Menú.

### 2.3 — Nueva página `MenuPage.tsx`

Crear `src/pages/MenuPage.tsx` con la misma estructura visual de `InventariosPage` (header + `<Tabs>`):

- Título: **"Menú"** · subtítulo: "Productos, paquetes y precios para venta y delivery".
- Tabs (`defaultValue="productos"`):
  1. **Productos Individuales** → reutiliza `<ProductosTab isAdmin={isAdmin} roles={roles} />` tal cual existe hoy.
  2. **Paquetes / Combos** → placeholder con `<div>` "Próximamente — gestión de paquetes dinámicos". *(Se implementará en una épica posterior con la nueva tabla `paquete_grupos`.)*
  3. **Precios Delivery** → placeholder "Próximamente — precios por plataforma". *(Se implementará al construir la UI sobre `producto_precios_delivery`.)*

Permisos de página: `administrador` y `supervisor`.

### Routing — `src/App.tsx`

- Importar `MenuPage`.
- Agregar `<Route path="/menu" …>` con `<ProtectedRoute allowedRoles={['administrador','supervisor']}>` envolviendo `<DashboardLayout><MenuPage /></DashboardLayout>`.

---

### Notas técnicas

- No se toca lógica de negocio ni queries — sólo navegación, imports y un nuevo archivo de página.
- `ProductosTab` y `PaquetesTab` quedan disponibles para reutilizarse/refactorizarse en épicas siguientes.
- Sin migraciones de base de datos en esta épica.

### Archivos afectados

- `src/components/AppSidebar.tsx` (editar)
- `src/pages/InventariosPage.tsx` (editar)
- `src/pages/MenuPage.tsx` (crear)
- `src/App.tsx` (editar — agregar ruta)
