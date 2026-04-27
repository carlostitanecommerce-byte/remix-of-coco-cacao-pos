# Coworking — Cronómetro en vivo + Modo "Sin cobro de fracción extra"

## Hallazgos de la auditoría de tiempo

Revisé el ciclo completo entrada → salida y el tiempo **se está registrando correctamente** a nivel de datos:

- **Entrada**: `CheckInDialog` guarda `fecha_inicio = new Date()` con offset `-06:00` vía `dateToCDMX()`. La función está correcta tanto si el usuario está en CDMX como en otro huso horario (verificado matemáticamente).
- **Salida**: `CoworkingPage.handleCheckOut` congela `fecha_salida_real = new Date().toISOString()` antes de calcular el cobro, y desde ahí todo el flujo (POS, Checkout, exportes) lee ese mismo timestamp inmutable.
- **Cálculo**: `(salidaReal - inicio) / 60000` da los minutos reales correctamente. La tolerancia y el método de fracción se aplican bien sobre `tiempoExcedidoMin = real − contratado`.

**Lo que sí falta** y suena a la preocupación del usuario: no hay un **cronómetro visible** en pantalla mientras la sesión está activa. Hoy solo se ven la hora de entrada y la hora estimada de salida, pero el cliente/operador no ve cuánto tiempo lleva transcurrido en vivo. Eso da la sensación de que "el tiempo no se está marcando".

## Cambios a implementar

### 1) Cronómetro en vivo en sesiones activas

Agregar un contador que se actualice cada segundo mostrando:

- **Tiempo transcurrido** desde `fecha_inicio` (HH:MM:SS).
- **Tiempo restante** vs. `fecha_fin_estimada` (o **"+MM min excedido"** en rojo si ya se pasó).

Lugares donde se mostrará:

- **`ActiveSessionsTable`** — nueva columna "Tiempo" entre "Entrada" y "Salida Est." con el cronómetro y badge de estado (En curso / Por terminar / Excedido).
- **`OccupancyGrid`** — pequeña línea bajo el nombre del cliente con el tiempo transcurrido, para verlo de un vistazo en cada tarjeta de área.

Implementación: hook compartido `useLiveClock(intervalMs = 1000)` que devuelve `Date.now()` reactivo, y un componente `<SessionTimer session={s} />` que formatea transcurrido/restante con colores semánticos (verde, ámbar, destructive).

### 2) Modo "Sin cobro de fracción extra" en tarifas

Agregar un nuevo valor `sin_cobro` al selector **Modo de fracción** dentro de `TarifasConfig`, junto a los actuales (Hora cerrada / 30 min / 15 min / Minuto exacto).

Comportamiento al hacer checkout cuando la tarifa tiene `metodo_fraccion = 'sin_cobro'`:

- **Sin importar cuánto se exceda**, el cargo extra es **$0**.
- Se cobra únicamente la tarifa contratada original.
- En el resumen de checkout aparece "Tiempo excedido sin cargo" como nota informativa.

Archivos afectados (4 puntos donde vive el switch del método de fracción):

- `src/components/coworking/TarifasConfig.tsx` → agregar `sin_cobro: 'Sin cobrar fracción extra'` al `METODO_FRACCION_LABELS`.
- `src/pages/CoworkingPage.tsx` → en el `switch` de `handleCheckOut`, manejar `'sin_cobro'` forzando `cargoExtraUnidad = 0` y `bloquesExtra = 0`.
- `src/components/pos/CoworkingSessionSelector.tsx` → mismo manejo en el `switch` que arma el carrito (no se agrega línea de tiempo excedido).
- `src/pages/CoworkingPage.tsx` → agregar al `METODO_LABELS` la etiqueta legible para mostrarla en el resumen.

### 3) Detalles de calidad

- El cronómetro respeta `fecha_salida_real` si ya existe (sesiones en `pendiente_pago` muestran tiempo congelado, no siguen contando).
- El `useLiveClock` se desmonta limpiamente para no dejar intervals colgados.
- Tipos TypeScript: `metodo_fraccion` sigue siendo `string` en la BD (no requiere migración), pero el front-end normaliza `'sin_cobro'` como valor válido.

## Resultado esperado

- El operador ve en cada tarjeta de área y en la tabla de sesiones activas un cronómetro corriendo en vivo, con código de color cuando se acerca o supera la hora estimada.
- Al crear/editar una tarifa, una nueva opción permite definirla como "todo incluido" sin penalización por minutos extra, ideal para promociones, eventos privados o bonos de cortesía.
