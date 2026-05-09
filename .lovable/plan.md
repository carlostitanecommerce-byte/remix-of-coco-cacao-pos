## Cambios en `/caja`

### 1. `src/pages/CajaPage.tsx`
- Calcular `puedeOmitirApertura = isAdmin || isSupervisor`.
- Pasar al `AperturaCajaDialog` un nuevo prop `allowSkip` con ese valor; el botón Cancelar del modal pasará a llamarse "Cerrar (revisar historial)" para esos roles y simplemente cerrará el diálogo sin navegar fuera (en vez del `navigate('/')` actual).
- Manejar un nuevo estado local `aperturaCerrada` (bool). Cuando admin/supervisor cierra el modal sin abrir caja, se pone en `true` y se mantiene oculto el modal hasta que el usuario lo reabra manualmente (botón "Abrir caja" en la card de Control de Caja).
- Para roles operativos (caja, recepción, barista), el modal sigue siendo bloqueante: el botón Cancelar mantiene su comportamiento actual (`navigate('/')`).
- En la columna izquierda, cuando NO hay caja abierta:
  - Mostrar `VentasTurnoPanel` SOLO si `isAdmin || isSupervisor`.
  - Ocultar `CoworkingSessionSelector`, `CajaCheckoutPanel` y `MovimientosCajaPanel` (ya están condicionados a `cajaAbierta`, OK).
  - Mostrar en la card "Control de Caja" un botón "Abrir Caja" que vuelva a poner el modal visible.
- `SolicitudesCancelacionPanel` también se mantiene visible para admin/supervisor sin caja abierta (ya cumple la condición).

### 2. `src/components/caja/AperturaCajaDialog.tsx`
- Agregar prop opcional `allowSkip?: boolean` (default `false`).
- Cuando `allowSkip === true`: el botón secundario dice "Cerrar (revisar historial)" en vez de "Cancelar"; al clic ejecuta `onClose?.()` sin navegar fuera de la página.
- Cuando `allowSkip === false`: comportamiento actual ("Cancelar" → `onClose` que en CajaPage hace `navigate('/')`).
- Mantener el bloqueo `if (!v && !saving) onClose?.()` para que solo se pueda cerrar vía botón explícito.

### 3. `src/components/caja/VentasTurnoPanel.tsx`
- Sin cambios funcionales internos. La restricción de visibilidad la aplica `CajaPage` cuando no hay caja abierta. Cuando hay caja abierta el panel sigue visible para todos los roles que ya pueden estar en la página (sin cambios respecto a hoy).

### Comportamiento resultante
- **Admin / Supervisor sin caja abierta**: ven el modal de apertura, pueden cerrarlo y se quedan en `/caja` con acceso al historial (`VentasTurnoPanel`) y a `SolicitudesCancelacionPanel`. Pueden reabrir el modal cuando quieran iniciar turno.
- **Caja / Recepción / Barista sin caja abierta**: el modal sigue siendo obligatorio; al cancelar son redirigidos a `/`. No pueden ver el historial sin abrir caja.
- **Cualquier rol con caja abierta**: experiencia idéntica a la actual.

### Verificación manual
1. Login como admin con caja cerrada → entrar a `/caja` → cerrar modal → confirmar que se ve el historial de ventas y se puede reabrir el modal desde la card.
2. Login como caja con caja cerrada → entrar a `/caja` → cancelar modal → confirmar redirect a `/`.
3. Login como supervisor con caja abierta → confirmar que la página luce idéntica a antes.
