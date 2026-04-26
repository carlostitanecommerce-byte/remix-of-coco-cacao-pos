# Auditoría End-to-End — Módulo Inventarios

## Estado: ✅ FASES G1 + G2 COMPLETADAS — Production-ready

### Fase G1 — Integridad (críticos)
- ✅ RPC atómica `registrar_merma` con `FOR UPDATE` (sin race conditions)
- ✅ Validación extendida de borrado de productos (paquetes, tarifa_upsells, tarifa_amenities_incluidos, sesiones activas)
- ✅ `AlertDialog` reemplaza `confirm()` nativo en ProductosTab
- ✅ RLS de `compras_insumos` endurecida (solo admin/supervisor INSERT)

### Fase G2 — Consistencia y pulido
- ✅ RPC `recalcular_costos_productos(insumo_id)` + trigger automático en UPDATE de `insumos.costo_unitario` → costos y márgenes de productos siempre frescos
- ✅ Índices únicos case-insensitive en `insumos.nombre` y `productos.nombre`
- ✅ Manejo amigable de error de unicidad en InsumosTab (mensaje claro al duplicar)
- ✅ MermasTab montado como sub-tab en InventariosPage (visible para admin/supervisor)
- ✅ ComprasTab: paginación de 50 en 50 + filtros por rango de fechas + contador total
- ✅ Fragment con key en ProductosTab (sin warnings React)

## Archivos modificados (G2)
- `supabase/migrations/...recalcular_costos_y_unique_idx.sql`
- `src/pages/InventariosPage.tsx`
- `src/components/inventarios/InsumosTab.tsx`
- `src/components/inventarios/ComprasTab.tsx`
