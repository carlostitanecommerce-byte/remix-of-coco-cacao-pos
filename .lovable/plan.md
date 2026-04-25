# Cocina: acceso para supervisor y diálogo solo para barista

## Cambios

### 1. Permitir acceso a supervisor (`src/App.tsx` y `src/components/AppSidebar.tsx`)
- Agregar `'supervisor'` a `allowedRoles` de la ruta `/cocina` y del item del sidebar "Cocina".
- Roles con acceso a Cocina quedan: `administrador`, `supervisor`, `barista`.

### 2. Omitir diálogo "Iniciar turno" para administrador y supervisor (`src/pages/CocinaPage.tsx`)
La activación de audio (y por tanto el diálogo) solo tiene sentido para el barista, que es quien necesita las alertas sonoras. Los roles administrativos solo entran a observar.

- Calcular `isBarista = roles.includes('barista') && !roles.some(r => ['administrador','supervisor'].includes(r))`. Es decir: si el usuario tiene rol administrativo (aunque también sea barista), se considera supervisor/admin y no se le pide el diálogo.
- El `<StartShiftDialog open={!shiftStarted && isBarista} ... />` solo se muestra cuando el usuario es barista puro.
- Para no-baristas: `shiftStarted` se considera implícitamente `true` (no se intenta crear `AudioContext`, no se reproduce sonido, no se persiste en `sessionStorage`).
- En `playNewOrderSound` y el timbre repetitivo de urgentes: ya están protegidos por `audioCtxRef.current?.state !== 'running'`, así que para admin/supervisor (sin AudioContext) no sonará nada — comportamiento deseado.
- Rehidratación desde `sessionStorage` y `startShift` se ejecutan solo si `isBarista`.

## Resultado
- Supervisor ve "Cocina" en el sidebar y puede entrar a la pantalla.
- Admin y supervisor entran directo al tablero, sin diálogo, sin sonido.
- Barista mantiene el flujo actual: diálogo obligatorio una vez por sesión/día y alertas sonoras activas.