## Correcciones rol Barista

### Problema 1 — Sidebar muestra POS y Coworking al barista
El sidebar filtra solo los items que tienen `allowedRoles`. Como POS y Coworking no tienen restricción, se muestran a todos, incluido el barista que no debe operarlos.

**Solución:** Restringir explícitamente cada item del menú con `allowedRoles`, dejando al barista únicamente con acceso a "Cocina".

Visibilidad final por rol:

| Item        | administrador | supervisor | caja | recepción | barista |
|-------------|:-------------:|:----------:|:----:|:---------:|:-------:|
| POS         | ✓             | ✓          | ✓    | ✓         |         |
| Cocina      | ✓             |            |      |           | ✓       |
| Coworking   | ✓             | ✓          | ✓    | ✓         |         |
| Inventarios | ✓             | ✓          |      |           |         |
| Usuarios    | ✓             |            |      |           |         |
| Reportes    | ✓             | ✓          |      |           |         |

Además, blindar la ruta `/coworking` y `/pos` con `allowedRoles` para que el barista no pueda entrar escribiendo la URL manualmente.

### Problema 2 — Diálogo "Iniciar turno" reaparece al cambiar de pestaña/sección
El estado `shiftStarted` vive en el componente `CocinaPage`, así que se reinicia cada vez que el usuario sale y vuelve a `/cocina` (o cuando React desmonta el componente al cambiar de tab del navegador y volver). 

**Solución:** Persistir el inicio de turno por sesión usando `sessionStorage` con una clave ligada al usuario y al día (CDMX). El diálogo se mostrará **una sola vez por sesión de navegador y por día**:

- Mientras la pestaña/ventana siga abierta → no vuelve a pedirlo aunque navegue entre módulos o minimice.
- Si cierra el navegador y vuelve a entrar → pide turno otra vez (correcto: cada nuevo arranque del navegador requiere un gesto del usuario para desbloquear `AudioContext`, es una restricción del navegador, no nuestra).
- Si cambia de día (turno nuevo) → pide turno otra vez (estándar profesional).

Clave: `kds:shift-started:<user_id>:<YYYY-MM-DD CDMX>`.

Al montar `CocinaPage`, si la clave existe, se restaura `shiftStarted=true` y se intenta recrear/resumir el `AudioContext` automáticamente (ya está autorizado dentro de la misma sesión del navegador).

### Archivos a modificar

- `src/components/AppSidebar.tsx` — añadir `allowedRoles` a POS, Coworking y Usuarios (corregir además que Usuarios estaba sin restricción en la ruta).
- `src/App.tsx` — añadir `allowedRoles` a las rutas `/pos`, `/coworking`, `/usuarios`, `/reportes` para defensa en profundidad.
- `src/pages/CocinaPage.tsx` — leer/guardar `shiftStarted` desde `sessionStorage` con clave por usuario y día CDMX; recrear `AudioContext` al rehidratar.
