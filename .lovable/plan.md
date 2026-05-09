## Épica 1: Arquitectura de Base de Datos

Preparar el esquema relacional para soportar **precios por plataforma de delivery** y **paquetes dinámicos** (grupos de selección tipo "elige tu bebida").

---

### Tarea 1.1 — Tablas de Delivery

**`plataformas_delivery`** — catálogo de plataformas (Uber Eats, Rappi, DiDi Food, etc.)
- `id` UUID PK
- `nombre` text UNIQUE NOT NULL
- `comision_porcentaje` numeric NOT NULL DEFAULT 0
- `activo` boolean NOT NULL DEFAULT true
- `created_at`, `updated_at`

**`producto_precios_delivery`** — precio de venta de cada producto por plataforma
- `id` UUID PK
- `producto_id` UUID NOT NULL → `productos.id` ON DELETE CASCADE
- `plataforma_id` UUID NOT NULL → `plataformas_delivery.id` ON DELETE CASCADE
- `precio_venta` numeric NOT NULL DEFAULT 0
- `created_at`, `updated_at`
- UNIQUE (`producto_id`, `plataforma_id`)

---

### Tarea 1.2 — Paquetes dinámicos (grupos de selección)

**`paquete_grupos`** — un paquete tendrá varios grupos (ej. "Elige tu bebida", "Elige tu postre")
- `id` UUID PK
- `paquete_id` UUID NOT NULL → `productos.id` ON DELETE CASCADE
- `nombre_grupo` text NOT NULL
- `cantidad_incluida` integer NOT NULL DEFAULT 1
- `es_obligatorio` boolean NOT NULL DEFAULT true
- `orden` integer DEFAULT 0 *(para mantener orden visual)*
- `created_at`, `updated_at`

**`paquete_opciones_grupo`** — productos seleccionables dentro de cada grupo
- `id` UUID PK
- `grupo_id` UUID NOT NULL → `paquete_grupos.id` ON DELETE CASCADE
- `producto_id` UUID NOT NULL → `productos.id` ON DELETE CASCADE
- `precio_adicional` numeric NOT NULL DEFAULT 0
- `created_at`
- UNIQUE (`grupo_id`, `producto_id`)

> La tabla existente `paquete_componentes` se **conserva intacta** en esta épica para no romper el POS actual. La migración/eliminación se hará en una épica posterior cuando reescribamos la UI de paquetes y el carrito.

---

### Seguridad (RLS)

Las 4 tablas con el mismo patrón ya usado en el proyecto:
- **SELECT**: cualquier usuario autenticado.
- **ALL (insert/update/delete)**: solo `administrador` vía `has_role(auth.uid(), 'administrador')`.

Triggers `update_updated_at_column` donde aplique.

---

### Frontend (sólo tipos, sin UI todavía)

`src/integrations/supabase/types.ts` se regenera automáticamente al aplicar la migración — no se edita a mano. No hay cambios de UI ni lógica en esta épica; sólo schema + RLS listos para que las próximas épicas (gestión de productos / paquetes / delivery) los consuman.

---

### Detalles técnicos

- Una sola migración SQL con: 4 `CREATE TABLE`, índices en FKs, `ENABLE ROW LEVEL SECURITY`, políticas, triggers de `updated_at`.
- Sin datos seed — las plataformas las dará de alta el admin desde la futura UI.
