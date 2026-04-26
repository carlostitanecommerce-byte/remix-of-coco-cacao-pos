## Diagnóstico

Verifiqué `src/components/reportes/MenuTab.tsx` y `VentasTab.tsx`. De las cuatro subtareas de la Fase I3:

| # | Subtarea | Estado actual |
|---|---|---|
| 1 | Navegación períodos pasados (◀ ▶ + "Hoy") | ❌ No implementada — solo botones "Esta Semana" / "Este Mes" sin offset |
| 2 | Tooltip scatter con descripción del cuadrante | ⚠️ Parcial — muestra el label pero no `info.desc` |
| 3 | Loading skeleton fino por sección | ❌ No — pantalla completa "Cargando análisis…" oculta todo el contenido |
| 4 | Etiqueta "Upsell" por ventas reales del período | ❌ No — se calcula desde `precio_upsell_coworking` (config del producto), no desde ventas |

Procede implementar las cuatro.

## Cambios

Edición exclusiva de `src/components/reportes/MenuTab.tsx`. No se tocan `CoworkingAnalysis.tsx` ni `CoworkingOpsMetrics.tsx`.

### 1. Navegación de períodos pasados

- Agregar estado `offset` (default `0`).
- Computar `rango` con `subWeeks(now, offset)` o `subMonths(now, offset)`, igual que VentasTab.
- En el header, junto al toggle Semana/Mes:
  - Botón ◀ `ChevronLeft` → `setOffset(o => o + 1)`.
  - Etiqueta del período (la actual `periodoLabel`).
  - Botón ▶ `ChevronRight` → `setOffset(o => o - 1)`, deshabilitado cuando `offset === 0`.
  - Botón "Hoy" visible solo cuando `offset !== 0` → `setOffset(0)`.
- Al cambiar de modo (Semana/Mes) resetear `offset = 0`.

### 2. Tooltip del scatter con descripción del cuadrante

En `CustomTooltip` añadir, debajo del badge de clasificación, una línea de descripción tomada de `CUADRANTE_LABELS[p.cuadrante].desc` con tipografía `text-[10px] text-muted-foreground` para mantener el chip compacto.

### 3. Loading skeleton fino por sección

- Eliminar el bloque `loading ? <Loader2 …/> : <>…</>` que envuelve toda la vista.
- Renderizar siempre la estructura (scatter card + tabla + Coworking subsecciones).
- Cuando `loading === true`, dentro de cada `Card` mostrar `Skeleton` (de `@/components/ui/skeleton`) en lugar de su contenido:
  - Scatter card: `Skeleton` de `h-[420px] w-full`.
  - Tabla card: 6 filas de `Skeleton` (`h-8 w-full`) y header skeleton.
- Pasar prop opcional `loading?: boolean` a `CoworkingAnalysis` y `CoworkingOpsMetrics`… **no se hará**: para mantener el cambio acotado a MenuTab, esas dos subsecciones conservan su loading interno propio (ya lo tienen por su `useEffect` con `desde/hasta`). El usuario percibe el header y los KPIs estables al cambiar período, mientras cada card carga independientemente.

### 4. Etiqueta "Upsell" basada en ventas reales del período

Reemplazar la heurística actual (`precio_upsell_coworking != null`) por un flag operativo `isUpselled` derivado de los datos del período:

- En `fetchData`, además de `detalle_ventas`, consultar `coworking_session_upsells` filtrando por sesiones cuyo `created_at` cae en el rango (o por `session_id` ligado a sesiones del período):

  ```ts
  const { data: upsellRows } = await supabase
    .from('coworking_session_upsells')
    .select('producto_id, created_at')
    .gte('created_at', desdeISO)
    .lte('created_at', hastaISO)
    .abortSignal(signal);
  ```

- Construir `upsellSet = new Set(upsellRows.map(r => r.producto_id))`.
- En el `map` de productos: `isUpsell: upsellSet.has(p.id)`.
- Renombrar conceptualmente la etiqueta en UI a "Upsell" (sin cambio visual) — semánticamente ahora indica "se vendió como upsell de coworking en este período", no "está configurado como upsellable".
- Conservar también el badge en tooltip y tabla (ya existen).

## Verificación esperada

- Se puede navegar a semanas/meses anteriores y regresar a "Hoy" en la pestaña Menú con la misma UX que Ventas.
- Hover en cualquier punto del scatter muestra el cuadrante y su descripción ("Alta popularidad y alta rentabilidad", etc.).
- Al cambiar de período, el header y KPIs siguen visibles; cada card muestra un skeleton mientras se recargan datos, sin parpadeo de pantalla completa.
- Un producto con `precio_upsell_coworking` configurado pero **sin ventas** como upsell en el período no muestra badge "Upsell". Un producto vendido vía `coworking_session_upsells` en el período sí lo muestra.

## Archivos editados

- `src/components/reportes/MenuTab.tsx` (única edición)
