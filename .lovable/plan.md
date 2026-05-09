# Corrección profesional del Heatmap de Coworking

## Causa raíz

1. **Rango horario insuficiente**: el heatmap solo dibuja de **8 AM a 8 PM** (`HORAS_COWORK = 8..20`). La sesión real de ayer ocurrió a las **21:40 CDMX**, por lo que nunca se renderiza ni se cuenta.
2. **Timezone frágil**: los slots horarios se calculan con `Date.setHours()` en la zona horaria del navegador, pero los timestamps de BD son UTC y los rangos de query están fijados a `-06:00`. Si el navegador no está en CDMX, todo se descuadra.
3. **Estado vacío engañoso**: muestra "No hay sesiones de coworking" incluso cuando sí hubo sesiones pero fuera del rango horario.

## Cambios (frontend, `src/components/reportes/VentasTab.tsx`)

### 1. Ampliar y simetrizar rango horario con el de retail
- Cambiar `HORAS_COWORK` a **7 AM – 11 PM** (7..23) para cubrir toda la operación real del coworking, incluyendo sesiones de noche.
- Mantener `HORAS_RETAIL` igual (6..23 ya lo cubre).

### 2. Calcular slots en CDMX (UTC-6) de forma explícita
- Reemplazar `new Date(day).setHours(hora, …)` por construcción vía string ISO con offset fijo:
  ```
  new Date(`${format(day,'yyyy-MM-dd')}T${HH}:00:00-06:00`)
  ```
- Mismo patrón para `slotEnd` (`:59:59.999-06:00`).
- Esto elimina la dependencia de la TZ del navegador y se alinea con `desdeISO/hastaISO` que ya usan `-06:00` (memoria del proyecto: timezone CDMX global).

### 3. Detección real de sesiones fuera de rango
- Calcular un contador `sessionsCount = sessionsRes.data.length` (sesiones cargadas en el período) y guardarlo en estado.
- Cambiar la condición de estado vacío:
  - Si `sessionsCount === 0` → "No hay sesiones de coworking en este período."
  - Si `sessionsCount > 0` y todas las celdas son 0 → mostrar el grid igualmente (todas las celdas en color base) **y** un aviso amber: "Hay N sesiones registradas que ocurrieron fuera del rango horario mostrado."

### 4. Aviso de capacidad cuando no hay áreas configuradas
- Si `totalCapacidad === 0` y hay sesiones, no calcular `% Ocupación` (ya está protegido) pero ocultar la línea en el tooltip para no mostrar "0%" confuso.

### 5. Pequeñas mejoras de robustez
- Manejar el `signal?.aborted` también después de `setLoadingCowork(false)` para no actualizar estado de un fetch abortado.
- Garantizar que `pax_count` se sume como número (`Number(s.pax_count) || 0`).

## Lo que NO se cambia

- Esquema de BD, RPCs, RLS — el problema es 100% de presentación.
- Lógica de retail heatmap (funciona; ya cubre 6 AM – 11 PM).
- KPIs ni `CoworkingAnalysis.tsx`.

## Verificación post-cambio

1. Recargar `/reportes` → tab "Ventas" → semana actual.
2. La celda **Jueves 9 PM** (`diaIdx=3`, `hora=21`) debe mostrar `1` con color teal.
3. Tooltip: "Personas en sitio: 1 · % Ocupación: 4%" (1/27 cap).
4. Probar `periodo='mes'` → la sesión debe seguir apareciendo (promediada entre los jueves del mes).
