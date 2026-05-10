# Compactar botones de acciones en Sesiones Activas

En `src/components/coworking/ActiveSessionsTable.tsx` (columna de acciones, líneas ~115-151), los botones se envuelven a varias filas porque sus labels son largos. Para mantenerlos en una sola fila horizontal:

1. **Acortar labels** de los botones del estado activo:
   - "Gestionar Cuenta" → **"Cuenta"**
   - "Registrar Salida" → **"Salida"**
   - "Cancelar" se mantiene

2. **Forzar alineación horizontal**: cambiar el contenedor de `flex items-center gap-1.5 flex-wrap` a `flex items-center gap-1 flex-nowrap justify-end` para que no se envuelvan y queden compactos.

3. **Conservar tooltips** (`title`) con los nombres completos (p. ej. "Gestionar cuenta de la sesión", "Registrar salida", "Cancelar sesión") para no perder contexto.

4. No se modifica la lógica ni los handlers; tampoco los botones del estado `pendiente_pago` (Reabrir / Cancelar), aunque también recibirán `flex-nowrap` por consistencia.
