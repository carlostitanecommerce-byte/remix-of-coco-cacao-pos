## Auditoría end-to-end del rol Barista

Resumen ejecutivo: el flujo funciona, pero **NO es profesional todavía**. La pantalla de cocina ya quedó robusta tras la última iteración (realtime + reconexión + polling defensivo + indicador "En vivo"), pero el rol barista tiene **6 fallos de UX, seguridad y operación** que un sistema KDS de nivel producción no debería tener.

---

## Hallazgos

### 🔴 Críticos (producción no debería ir así)

**1. Bug en el menú lateral: el barista NO puede ver "Cocina" en el sidebar.**
En `AppSidebar.tsx` el ítem Cocina dice `allowedRoles: ['administrador']`. Si el barista alguna vez navegara por la app con sidebar (caso "barista + otro rol"), no vería el enlace a Cocina. Debería ser `['administrador', 'barista']`. Hoy se compensa porque el barista se redirige automáticamente a `/cocina`, pero es un bug latente.

**2. La sesión queda atrapada si por error se asignan dos roles al barista.**
La detección `isBaristaOnly = roles.length === 1 && roles[0] === 'barista'` en `App.tsx` y `CocinaPage.tsx` es frágil. Si un admin asigna por error otro rol al barista, pierde el modo fullscreen, ve el sidebar y puede entrar a POS, Coworking, etc. La condición debe ser "tiene rol barista" + "no tiene roles de gestión" o, mejor, basarse en una preferencia explícita de modo "Pantalla cocina".

**3. La seguridad RLS de `kds_orders`/`kds_order_items` es demasiado abierta.**
Cualquier usuario autenticado puede `INSERT/UPDATE/DELETE` en estas tablas. Un barista podría borrar órdenes, marcar listas que no existen, o insertar basura desde la consola del navegador. Para un KDS profesional el barista solo debería poder hacer `UPDATE estado` (transiciones válidas) y `SELECT`. La creación es exclusiva del POS (admin/caja) y la eliminación es del trigger del sistema.

**4. Ventana de "hoy" calculada en UTC, no en zona horaria del negocio.**
`fetchOrders` filtra con `d.setHours(0,0,0,0)` (zona local del navegador). La memoria del proyecto define `America/Mexico_City` (UTC-6) como zona estándar. En la madrugada o si el equipo está en otra zona, las órdenes "de hoy" se calculan mal y pueden desaparecer prematuramente o aparecer las de ayer. Debe alinearse con CDMX como en el resto del sistema.

### 🟡 Importantes (rompen experiencia profesional)

**5. La auto-eliminación de "listo" a los 30s puede borrar pedidos que el cliente aún no recogió.**
30s es muy agresivo para un KDS real (estándar de industria: 60–120s o manual). Además, no hay forma de "deshacer" si por error se marcó listo. Profesional: 90s por defecto + opción de revertir (que ya existe pero queda escondida porque la tarjeta desaparece).

**6. No hay feedback háptico ni timbre repetitivo para órdenes urgentes.**
Hoy suena un "ding" único cuando llega una orden. Si el barista está en otra parte del local, lo pierde. Profesional: re-tocar el sonido cada 30s mientras haya órdenes con >10 min sin atender (estado "urgente" rojo pulsante ya existe, falta el sonido).

### 🟢 Menores (pulido)

**7. Sin contador de "tiempo promedio de preparación" del turno.**
Métrica básica de cualquier KDS. Se puede calcular en cliente con las órdenes que pasaron por `listo` en el día.

**8. No hay protección contra doble-click en los botones de acción.**
`busyId` evita acciones simultáneas dentro de UNA tarjeta, pero no entre tarjetas. Si el barista da click rápido en "Iniciar" de dos órdenes, ambas se procesan. Aceptable, pero el botón debería deshabilitarse globalmente durante el roundtrip.

---

## Plan de implementación

### Cambios de UI/lógica (`src/`)

**`src/components/AppSidebar.tsx`**
- Línea 28: cambiar `allowedRoles: ['administrador']` por `['administrador', 'barista']` para Cocina.

**`src/App.tsx` y `src/pages/CocinaPage.tsx`**
- Reemplazar `isBaristaOnly = roles.length === 1 && roles[0] === 'barista'` por una helper `isKitchenOnlyMode(roles)` que retorne `true` si el usuario tiene rol `barista` y NO tiene `administrador`/`supervisor`/`caja`/`recepcion`. Esto hace que añadir un segundo rol "operativo" saque del modo cocina solo si es de gestión real.
- Centralizar la helper en `src/lib/roles.ts` (nuevo archivo, 5 líneas) para no duplicar lógica.

**`src/pages/CocinaPage.tsx`**
- Cambiar `todayStartIso()` para usar offset CDMX (UTC-6) consistente con el resto del sistema (memoria `timezone-standardization`).
- Aumentar `LISTO_TIMEOUT_MS` de 30000 a 90000.
- Agregar timbre repetitivo: `setInterval` cada 30s que dispare `playNewOrderSound()` si hay alguna orden con `urgency === 'urgent'` (>10 min) en estado `pendiente` o `en_preparacion`.
- Agregar "Métricas del turno" en el header (compacto): `X órdenes activas · Promedio Y min` calculado de las órdenes que llegaron hoy y ya pasaron por `listo`.

### Cambios de seguridad (migración SQL)

**Endurecer RLS de `kds_orders`:**
```sql
DROP POLICY "Authenticated can insert kds_orders" ON kds_orders;
DROP POLICY "Authenticated can delete kds_orders" ON kds_orders;
DROP POLICY "Authenticated can update kds_orders" ON kds_orders;

-- Solo admin/caja insertan (vienen del POS)
CREATE POLICY "Staff de POS puede insertar kds_orders"
  ON kds_orders FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'administrador') OR
    has_role(auth.uid(), 'caja')
  );

-- Barista, admin, supervisor pueden hacer UPDATE (cambiar estado)
CREATE POLICY "Cocina puede actualizar kds_orders"
  ON kds_orders FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'administrador') OR
    has_role(auth.uid(), 'supervisor') OR
    has_role(auth.uid(), 'barista')
  );

-- DELETE solo admin (el trigger del sistema usa SECURITY DEFINER y bypasea RLS)
CREATE POLICY "Solo admin puede borrar kds_orders"
  ON kds_orders FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'administrador'));
```

Mismo endurecimiento para `kds_order_items` (INSERT/DELETE solo admin/caja; el barista no necesita tocar items individuales).

### Resultado esperado

- El barista solo puede hacer transiciones de estado (`pendiente → en_preparacion → listo` y revertir). No puede crear ni borrar.
- El bug de visibilidad del sidebar queda corregido (no afecta al modo fullscreen, pero queda limpio para futuros multi-rol).
- La ventana de "hoy" usa la zona del negocio (CDMX), consistente con reportes.
- Las órdenes listas se quedan 90s en pantalla y el timbre repetitivo asegura que ninguna orden urgente pase desapercibida.
- Header muestra métrica operativa real (promedio de preparación del turno).
- Detección de modo cocina más robusta ante asignación accidental de roles.

### Lo que NO cambia

- La pantalla de cocina sigue siendo fullscreen, sin sidebar para el barista.
- El realtime con reconexión y el indicador "En vivo / Reconectando…" agregado en la iteración anterior se mantiene tal cual.
- El logout del barista desde el header no cambia.
- Los íconos por tipo de consumo (Bike/ShoppingBag/Coffee) ya implementados se conservan.