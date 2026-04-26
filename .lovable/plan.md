## Objetivo

Ejecutar las tres acciones de mayor relación impacto/esfuerzo de la auditoría:

1. **Eliminar el bug financiero** de las ventas canceladas que conservan `monto_efectivo > 0`.
2. **Corregir el filtro de turnos** para que use solape con el rango (no solo `fecha_apertura`).
3. **Profesionalizar la carga**: manejo de errores con toast, `AbortController`, límites explícitos e indicador de truncamiento — paridad con VentasTab/MenuTab tras Fase I2.

No se tocan funcionalidades existentes (fórmula de arqueo, RLS, Arqueo Ciego, audit logs).

---

## Acción 1 — Limpiar montos al cancelar venta

### Migración (schema)

Trigger `BEFORE UPDATE` en `public.ventas` que, cuando `estado` cambia a `'cancelada'`, pone a cero los tres montos de cobro. Mantiene `total_neto`, `total_bruto`, `iva`, `monto_propina` intactos para preservar trazabilidad histórica del valor original cancelado.

```sql
CREATE OR REPLACE FUNCTION public.zero_montos_on_cancel()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'cancelada'
     AND (OLD.estado IS DISTINCT FROM 'cancelada') THEN
    NEW.monto_efectivo      := 0;
    NEW.monto_tarjeta       := 0;
    NEW.monto_transferencia := 0;
    NEW.comisiones_bancarias := 0;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_zero_montos_on_cancel
BEFORE UPDATE ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.zero_montos_on_cancel();
```

### Backfill de datos históricos

Operación de actualización (no schema) para limpiar las **18 ventas canceladas** que hoy conservan $1,245 en montos fantasma. Se hará vía herramienta de inserción/actualización:

```sql
UPDATE public.ventas
   SET monto_efectivo = 0,
       monto_tarjeta = 0,
       monto_transferencia = 0,
       comisiones_bancarias = 0
 WHERE estado = 'cancelada'
   AND (monto_efectivo > 0 OR monto_tarjeta > 0 OR monto_transferencia > 0);
```

### Verificación esperada
- Cualquier consulta agregada futura sobre `ventas.monto_*` ya no inflará efectivo por cancelaciones.
- El reporte de Caja sigue idéntico (ya filtraba por `estado='completada'`).
- Histórico: cero ventas canceladas con monto > 0.

---

## Acción 2 — Filtro de turnos por solape

### Cambio en `src/lib/cajaUtils.ts`

Reemplazar el filtro actual:
```ts
.gte('fecha_apertura', desdeISO)
.lte('fecha_apertura', hastaISO)
```

por un filtro de solape con el rango (un turno entra si su intervalo `[fecha_apertura, COALESCE(fecha_cierre, now())]` se cruza con `[desde, hasta]`):

```ts
.lte('fecha_apertura', hastaISO)
.or(`fecha_cierre.gte.${desdeISO},fecha_cierre.is.null`)
```

### Por qué importa
Hoy un turno abierto el 30/abr y cerrado el 1/may **NO aparece** al consultar mayo, aunque sus ventas sí caen en mayo. Con el cambio, los turnos transversales aparecen en ambos meses (lo correcto contablemente; el operador puede ver la trazabilidad completa).

### Verificación
- Selecciono un mes que termina/empieza con un turno cruzado: aparece en ambos rangos.
- El conteo "X turnos en periodo" refleja la realidad operativa, no el accidente de cuándo se abrió.

---

## Acción 3 — Robustez de carga (paridad con Fase I2)

### Cambios en `src/lib/cajaUtils.ts`

1. **Aceptar `AbortSignal` opcional** en `fetchCajaResumen(desde, hasta, signal?)`. Pasarlo a cada query con `.abortSignal(signal)`.
2. **Throwing en errores**: hoy se hace `const { data } = await …` ignorando `error`. Cambiar a destructurar `{ data, error }` y `throw error` para que el caller pueda mostrar toast.
3. **Límites explícitos**:
   - `cajas`: `.limit(500)`
   - `movimientos_caja`: `.limit(5000)`
   - `ventas` (por turno): `.limit(5000)`
4. **Devolver flag de truncamiento**: cambiar el retorno a `{ turnos: CajaTurnoResumen[]; truncated: boolean }` (o adjuntar `truncated` en el array). Truncated=true si **alguna** query alcanzó su límite.

### Cambios en `src/components/reportes/CajaTab.tsx`

1. **AbortController por efecto**:
   ```ts
   useEffect(() => {
     const ctrl = new AbortController();
     (async () => {
       setLoading(true);
       try {
         const { turnos, truncated } = await fetchCajaResumen(desde, hasta, ctrl.signal);
         if (ctrl.signal.aborted) return;
         setTurnos(turnos);
         setTruncated(truncated);
         // selección activa…
       } catch (err: any) {
         if (ctrl.signal.aborted || err?.name === 'AbortError') return;
         toast.error('No se pudo cargar el reporte de caja', { description: err?.message });
       } finally {
         if (!ctrl.signal.aborted) setLoading(false);
       }
     })();
     return () => ctrl.abort();
   }, [desde, hasta]);
   ```
2. **Banner de truncamiento** (mismo estilo ámbar que VentasTab/MenuTab) cuando `truncated === true`.
3. **Import de `toast` desde `sonner`** (ya está disponible en el proyecto).

### Verificación
- Cambiar fechas rápido: solo gana el último fetch (sin parpadeos de datos viejos).
- Forzar un error de red (con DevTools offline): aparece toast en vez de quedarse en spinner eterno.
- Rangos enormes: aparece el banner ámbar avisando que se alcanzó el límite.

---

## Archivos afectados

- **Migración**: nueva, crea `zero_montos_on_cancel` + trigger.
- **Update de datos**: backfill 18 filas en `ventas`.
- `src/lib/cajaUtils.ts` — solape, abort signal, errores, límites, `truncated`.
- `src/components/reportes/CajaTab.tsx` — AbortController, toast, banner de truncamiento.

No se modifica `CancelVentaDialog.tsx` (el trigger lo hace todo a nivel BD, blindando también edge functions y futuros callers).

## Lo que NO entra en este plan (queda para fases siguientes)

- Eliminar N+1 (acción 4 de la auditoría) — refactor mayor; va aparte.
- Alerta visual de turnos prolongados (>24h).
- Presets de fecha y skeletons finos.
- Mostrar usuario en movimientos, totales por método de pago, export PDF.
