# Auditoría End-to-End del Módulo POS

## Veredicto: 🔴 NO PRODUCTION-READY

El POS tiene una arquitectura sólida tras las Fases 1-3, pero contiene **un defecto crítico de integridad de datos** que invalida cualquier despliegue real, además de varios huecos operativos. Detalle abajo.

---

## 🔴 BLOQUEADORES (deben resolverse antes de producir)

### B1. Triggers de base de datos NO existen — el inventario NO se descuenta
Este es el hallazgo más grave. Verifiqué directamente `pg_trigger` y `information_schema.triggers`: **la base de datos no tiene NINGÚN trigger en el esquema public**. Las funciones existen pero están huérfanas:

- `descontar_inventario_venta()` → no se ejecuta al insertar `detalle_ventas` ⇒ **las ventas no descuentan stock**.
- `reintegrar_inventario_cancelacion()` → no se ejecuta al cancelar una venta ⇒ **el stock cancelado no se devuelve**.
- `cleanup_kds_on_venta_cancel()` → no se ejecuta ⇒ **órdenes canceladas siguen en cocina**.
- `sumar_stock_compra()` → no se ejecuta ⇒ **las compras no incrementan stock** (probablemente ya causa fricción operativa).

**Impacto**: el `stock_actual` de `insumos` queda desincronizado desde la primera venta. La validación previa (`validar_stock_carrito`) seguirá viendo el mismo stock siempre, así que en pocas horas el sistema permitirá vender sin existencias reales.

**Causa probable**: una migración previa los eliminó (DROP TRIGGER) o nunca se crearon en este proyecto Cloud aunque las funciones sí.

### B2. Race condition en validación → inserción de venta
Entre `validar_stock_carrito` (línea 53 de `ConfirmVentaDialog.tsx`) y la inserción real puede haber una venta concurrente que consuma el mismo insumo. Sin trigger `descontar_inventario_venta` con `RAISE EXCEPTION` en stock negativo (B1), no hay segunda línea de defensa.

---

## 🟠 RIESGOS ALTOS (corregir antes de operar a escala)

### R1. Si KDS falla, la venta queda sin orden a cocina sin alerta
En `ConfirmVentaDialog.tsx` líneas 310-322, la inserción a `kds_orders` y `kds_order_items` no tiene manejo de error. Si falla por RLS o conexión, la venta se completa pero la cocina nunca recibe la orden y el usuario no se entera.

### R2. Restauración de upsells al limpiar carrito no es atómica
`handleClearCart` (PosPage.tsx 178-213) hace inserts/updates uno por uno sin transacción. Si el usuario cierra el navegador a mitad, la sesión coworking queda en un estado intermedio entre lo que se importó y lo que originalmente tenía.

### R3. Congelar `coworking_sessions` a `pendiente_pago` con `fecha_salida_real` puede perder datos al hacer rollback
Línea 64-69 + 110-114 de `ConfirmVentaDialog`: si la venta falla, se revierte `estado` y `fecha_salida_real = null`. Pero si la sesión ya estaba en `pendiente_pago` (re-cobro), perdemos su `fecha_salida_real` original.

### R4. Sin protección contra doble-clic en "Procesar Venta"
El botón se deshabilita por `saving`, pero si el usuario hace doble clic muy rápido antes de que React aplique el estado, puede generar dos ventas. Falta debounce o lock por `useRef`.

---

## 🟡 MEJORAS RECOMENDADAS (calidad profesional)

### M1. Ticket: información fiscal/comercial faltante
Solo muestra nombre del negocio. Falta:
- RFC / dirección fiscal
- Folio con prefijo (ej. "A-0042")
- Leyenda "Este ticket no es un comprobante fiscal"
- Código QR opcional para validación

### M2. Sin re-impresión de ticket
Una vez cerrado el diálogo, el ticket se pierde. En `VentasTurnoPanel` no hay botón "Re-imprimir ticket" (caso muy común: el cliente lo pide después).

### M3. Inputs numéricos permiten valores negativos
En CartPanel (propinas, mixed payment) se usan `min={0}` pero el navegador permite escribir `-`. Falta `Math.max(0, value)` en el `onChange`.

### M4. El estado `pending_payment` no tiene timeout
Si una sesión queda atorada en `pendiente_pago` (por ejemplo el cobro falló y nadie volvió), no hay job que la regrese a `activo` ni alerta visible. Acumula ruido en el selector.

### M5. Console warning persistente
`SolicitudesCancelacionSesionesPanel` produce warning React de `forwardRef` en cada render (visible en el log de consola actual). Es del módulo coworking pero contamina el log y puede ocultar errores reales del POS.

### M6. Falta indicador de conectividad/realtime
Si la suscripción realtime se cae (red intermitente), el catálogo y las sesiones se desincronizan en silencio. Un badge "🟢 Tiempo real activo" / "🔴 Reconectando" daría confianza.

---

## ✅ FORTALEZAS YA IMPLEMENTADAS

- Validación de stock unificada (cartera completa) vía RPC.
- Índice único parcial `cajas_unique_open` impide doble apertura.
- Realtime en `productos`, `coworking_sessions`, `coworking_session_upsells`, `ventas`, `detalle_ventas`.
- Folios secuenciales, audit logs en cada acción crítica, arqueo ciego.
- RLS correcta para roles `recepcion`, `caja`, `administrador` en KDS.
- Advertencia al cerrar caja con sesiones activas.
- Snapshot de tarifas congeladas en coworking.
- Total neto sin propina (contabilidad correcta).

---

## 📋 PLAN DE REMEDIACIÓN PROPUESTO

### Fase A — Bloqueador (urgente)
**A1.** Crear migración que recree los 4 triggers faltantes:
```text
- trg_descontar_inventario_venta  → AFTER INSERT ON detalle_ventas
- trg_reintegrar_inventario_cancelacion  → AFTER UPDATE OF estado ON ventas
- trg_cleanup_kds_on_venta_cancel  → AFTER UPDATE OF estado ON ventas
- trg_sumar_stock_compra  → AFTER INSERT ON compras_insumos
```
Verificar con `pg_trigger` que quedaron activos.

### Fase B — Riesgos
- B1. Manejar error de KDS con toast + retry + audit log.
- B2. Envolver `handleClearCart` en mensajes claros si falla y deshabilitar botón mientras corre.
- B3. Guardar `fecha_salida_real` original en variable antes del update y restaurarlo en rollback.
- B4. Agregar `useRef` lock en `handleConfirm` para anti-doble-clic.

### Fase C — Pulido (opcional pero recomendado)
- C1. Configuración fiscal (RFC, dirección) editable desde Reportes/Config.
- C2. Botón "Re-imprimir ticket" en VentasTurnoPanel (rearma el ticket desde la BD).
- C3. Sanitizar inputs numéricos.
- C4. Job/cron edge function para liberar sesiones `pendiente_pago` antiguas (>24h).
- C5. Convertir `Badge` en `SolicitudesCancelacionSesionesPanel` para no recibir refs.
- C6. Indicador de salud de realtime.

### Tiempo estimado
- Fase A: ~15 min (1 migración + verificación)
- Fase B: ~45 min
- Fase C: ~1.5 h

---

## Detalles técnicos

**Verificación SQL ejecutada:**
```sql
SELECT tgname FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'public.%';
-- Resultado: 0 filas
```

**Funciones huérfanas confirmadas en `pg_proc`:**
`descontar_inventario_venta`, `reintegrar_inventario_cancelacion`, `cleanup_kds_on_venta_cancel`, `sumar_stock_compra`, `replicate_to_destination`, `handle_new_user`, `update_updated_at_column`.

**Aprueba** este plan si quieres que proceda con la **Fase A** de inmediato (la única estrictamente necesaria para no perder integridad de inventario), o indica si quieres A+B juntas, o el plan completo A+B+C.
