## Causa raíz

La tabla `detalle_ventas` tiene **dos triggers idénticos** que ejecutan la misma función `descontar_inventario_venta()` `AFTER INSERT FOR EACH ROW`:

1. `trg_descontar_inventario_venta` (nomenclatura estándar `trg_*` del proyecto)
2. `trigger_descontar_inventario` (duplicado legacy)

Cada inserción en `detalle_ventas` dispara la función dos veces, descontando el doble de cada insumo del stock. Esto explica exactamente el síntoma reportado: una venta de 1 unidad descuenta como si fueran 2.

No es un bug de la app — todo el frontend (`ConfirmVentaDialog`) inserta una sola fila por línea. El problema está en la base de datos.

## Solución

Migración SQL que elimina el trigger duplicado y conserva el que sigue la nomenclatura estándar del proyecto:

```sql
DROP TRIGGER IF EXISTS trigger_descontar_inventario ON public.detalle_ventas;
```

Se conserva `trg_descontar_inventario_venta`, que ejecuta la misma función. No hay cambios de código en la app, no hay cambios en la función `descontar_inventario_venta()`, no hay impacto en otras tablas.

## Validación posterior

Después de aplicar la migración:
1. Hacer una venta de prueba de 1 unidad de un producto con receta conocida.
2. Verificar en `insumos.stock_actual` que el descuento corresponde exactamente a `cantidad_necesaria * 1` (no x2).
3. Confirmar en `pg_trigger` que solo queda un trigger de descuento sobre `detalle_ventas`.

## Nota sobre ventas previas

Las ventas ya procesadas con doble descuento dejaron stock subestimado. Si quieres, en un paso posterior puedo ofrecerte un ajuste manual de inventario (vía el módulo de Compras o una merma negativa) para corregir el stock de los insumos afectados por las pruebas recientes — pero eso depende de cuántas ventas de prueba se hicieron y prefiero confirmarlo contigo antes de tocar inventario histórico.
