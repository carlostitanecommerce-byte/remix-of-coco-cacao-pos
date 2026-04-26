## Diagnóstico

El reporte de Ingeniería de Menú muestra **"No hay productos con ventas en este periodo"** aunque en abril 2026 existen **221 ventas completadas** con **266 detalles tipo `producto`** + **6 `amenity`**.

### Causa raíz

En la Fase I1 introduje este filtro en `MenuTab.tsx`:

```ts
.in('tipo_concepto', ['producto', 'paquete', 'amenity'] as any)
```

Pero el enum real `tipo_concepto` en la base de datos solo acepta tres valores: **`producto`, `coworking`, `amenity`**. **No existe `'paquete'`**.

Postgres rechaza la query con:
```
22P02: invalid input value for enum tipo_concepto: "paquete"
```

El error se silenciaba porque el bloque no validaba `error` (lo arreglamos en I2, pero el `cast as any` evadió la validación de tipos de TypeScript). Resultado: `salesMap` queda vacío → todos los productos con `cantidadVendida = 0` → el scatter no muestra nada.

### Hallazgo adicional

Los paquetes **no** se guardan con un `tipo_concepto` propio. Se almacenan como filas `producto` con el campo `paquete_id` poblado cuando aplica. Hoy `paquete_id` está NULL en todos los registros (los paquetes se desglosan en componentes al cobrar), pero conviene dejar la lógica preparada por si se cambia esa política.

## Cambios

**`src/components/reportes/MenuTab.tsx`** (única edición):

1. Cambiar el filtro a los valores reales del enum:
   ```ts
   .in('tipo_concepto', ['producto', 'amenity'])
   ```
   (eliminando el `as any` que ocultaba el problema).

2. Ajustar la atribución del producto vendido para que, si `paquete_id` viene poblado, se atribuya al paquete maestro:
   ```ts
   const id = d.paquete_id ?? d.producto_id;
   ```

No hace falta tocar `CoworkingAnalysis.tsx` ni `CoworkingOpsMetrics.tsx`: ahí el filtro `.in('tipo_concepto', ['producto', 'amenity'])` ya estaba correcto.

## Verificación post-fix

Tras aplicar, el periodo "Este Mes" en abril 2026 debe mostrar:
- Scatter con productos del catálogo activo que tengan ventas.
- Tabla "Top Impacto Económico" con al menos los productos que aparezcan en los 272 detalles válidos del mes.
- Sin banner de truncamiento (221 ventas << 5000).
