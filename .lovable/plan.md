## Épica 1: Cuentas Abiertas — venta_id nullable

### Objetivo
Permitir guardar ítems de consumo en `detalle_ventas` vinculados a una `coworking_session_id` antes de generar la venta financiera. El `venta_id` se llenará (UPDATE) al momento del checkout en Caja.

### Cambios

**1. Migración SQL (`supabase/migration`)**

```sql
-- Hacer venta_id opcional para soportar cuentas abiertas de coworking
ALTER TABLE public.detalle_ventas
  ALTER COLUMN venta_id DROP NOT NULL;

-- Garantizar consistencia: cada renglón debe pertenecer a una venta
-- O bien a una sesión de coworking abierta (cuenta abierta)
ALTER TABLE public.detalle_ventas
  ADD CONSTRAINT detalle_ventas_venta_o_sesion_chk
  CHECK (venta_id IS NOT NULL OR coworking_session_id IS NOT NULL);

-- Índice para búsquedas rápidas de cuentas abiertas por sesión
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_session_open
  ON public.detalle_ventas (coworking_session_id)
  WHERE venta_id IS NULL;
```

**2. RLS de `detalle_ventas`**

La política actual de INSERT exige `EXISTS (... ventas WHERE id = venta_id AND usuario_id = auth.uid())`. Eso bloquea inserts con `venta_id IS NULL`. Hay que reescribirla para permitir el caso "cuenta abierta":

```sql
DROP POLICY "Authenticated users can insert detalle_ventas" ON public.detalle_ventas;

CREATE POLICY "Authenticated users can insert detalle_ventas"
ON public.detalle_ventas FOR INSERT TO authenticated
WITH CHECK (
  -- Caso 1: línea ligada a una venta propia
  (venta_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ventas v
    WHERE v.id = detalle_ventas.venta_id AND v.usuario_id = auth.uid()
  ))
  OR
  -- Caso 2: cuenta abierta de coworking (sin venta aún)
  (venta_id IS NULL AND coworking_session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.coworking_sessions s
    WHERE s.id = detalle_ventas.coworking_session_id
      AND s.estado IN ('activo', 'pendiente_pago')
  ))
);

-- Permitir UPDATE de venta_id al cerrar la cuenta (ligar línea a la venta nueva)
CREATE POLICY "Authenticated can attach venta to open lines"
ON public.detalle_ventas FOR UPDATE TO authenticated
USING (venta_id IS NULL AND coworking_session_id IS NOT NULL)
WITH CHECK (venta_id IS NOT NULL);
```

**3. Tipos (`src/integrations/supabase/types.ts`)**

Se regeneran automáticamente tras aprobar la migración. `Row.venta_id` pasará a `string | null`, `Insert.venta_id` quedará opcional. No editar a mano.

**4. Trigger `descontar_inventario_venta`**

Actualmente se ejecuta al insertar en `detalle_ventas` y descuenta inventario. Si insertamos líneas de cuenta abierta (sin `venta_id`), **no debemos descontar todavía** — el inventario se descuenta al cobrar. Hay que añadir guarda al inicio del trigger:

```sql
-- Si es cuenta abierta (sin venta_id), no descontar inventario aún
IF NEW.venta_id IS NULL THEN
  RETURN NEW;
END IF;
```

El descuento real ocurrirá cuando la épica 2/3 haga el `UPDATE detalle_ventas SET venta_id = ...` al cerrar la cuenta. Para eso habrá que migrar el trigger a `AFTER INSERT OR UPDATE OF venta_id` y disparar solo cuando `venta_id` pase de NULL a NOT NULL. (Confirmar en épica posterior; en esta épica basta con la guarda de NULL para no romper nada.)

### Fuera de alcance (épicas siguientes)
- UI para añadir productos a la sesión desde Coworking.
- Migración del trigger a UPDATE-aware (descuento al cerrar cuenta).
- Migración de datos existentes de `coworking_session_upsells` → `detalle_ventas`.
- Borrado de `coworking_session_upsells` (al final, tras refactor del front).

### Archivos
- Nueva migración SQL (alter column + check + índice + RLS + guarda en trigger).
- `src/integrations/supabase/types.ts` (regenerado automáticamente).
