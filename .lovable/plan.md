# Auditoría end-to-end del rol Barista y plan de corrección

## Hallazgos de la auditoría

### 1. Causa real del "sidebar fantasma"
Hoy el barista tiene un tratamiento especial: la app detecta `isKitchenOnlyMode(roles)` y conmuta entre dos modos:
- **Fullscreen sin layout** (cuando `roles=['barista']`) → render directo de `<CocinaPage />`.
- **DashboardLayout con sidebar** (cualquier otro caso, incluido el momento en que `roles` aún no llegó).

El destello ocurre porque `useAuth.loading` se marca `false` apenas hay sesión, pero `fetchRoles()` corre en `setTimeout(0)` y resuelve después. Durante esos ~200–500 ms: `loading=false` + `roles=[]` → cae en la rama "DashboardLayout" → cuando llegan los roles, salta a fullscreen. **Es la dualidad del modo lo que causa el bug.**

### 2. Decisión del usuario: unificar el rol barista
El barista debe verse y operar **igual que el resto de roles**: sidebar a la izquierda, header con `SidebarTrigger`, `/cocina` como una página del layout estándar. Esto:
- Elimina por diseño el ghosting (no hay dos modos que conmutar).
- Da al barista navegación coherente y la opción de cerrar sesión desde el footer del sidebar (como todos).
- Simplifica el código: una sola ruta, un solo layout.

### 3. Audio: el problema real con el botón actual
- "Activar sonido" obliga al usuario a saber que tiene que apretarlo.
- En cocina la pantalla suele estar montada y el barista puede no tocarla nunca, así que el audio jamás se desbloquea y la primera orden no suena.
- Solución profesional (estándar Toast/Square/Lightspeed KDS): **diálogo modal "Iniciar turno" obligatorio** al entrar a `/cocina`. Un solo botón grande. El click cumple el requisito de gesto del navegador → desbloquea `AudioContext` → diálogo desaparece y no vuelve a aparecer en la sesión.

### 4. Otros hallazgos del rol barista (correctos, no requieren cambio)
- ✅ RLS endurecido: barista solo puede `UPDATE` estados (no insert/delete).
- ✅ Sidebar ya incluye "Cocina" en `allowedRoles` para barista.
- ✅ Ruta `/cocina` protegida con `allowedRoles=['administrador','barista']`.
- ✅ Realtime, reconexión, polling de respaldo, tiempo CDMX, alertas de urgencia, tiempo promedio de preparación — todo bien.

---

## Cambios propuestos

### A. Eliminar el "modo cocina exclusivo" → barista usa layout estándar

**`src/App.tsx`**
- Quitar `HomeRedirect` y `CocinaRoute`. Reemplazar por:
  - `/` → `<DashboardLayout><DashboardPage /></DashboardLayout>` para todos.
  - `/cocina` → `<DashboardLayout><CocinaPage /></DashboardLayout>` para todos los autorizados.
- Quitar import de `isKitchenOnlyMode`.
- Para que el barista aterrice directo en `/cocina` tras login (en vez de en `/`), añadir un pequeño componente `RoleHomeRedirect` SOLO en `/` que, una vez `loading=false`, redirige al barista a `/cocina`. Pero como ahora ambas rutas tienen el mismo layout, **no hay destello visual** aunque pase un instante por `/`. El usuario ve siempre el sidebar.

**`src/pages/CocinaPage.tsx`**
- Quitar uso de `isKitchenOnlyMode` y `isBaristaOnly`.
- Quitar el botón "Cerrar sesión" del header del KDS (ahora se cierra sesión desde el sidebar como todos los roles).
- Quitar import de `signOut`, `LogOut`, `useAuth` si ya no se usan.

**`src/lib/roles.ts`**
- Marcar `isKitchenOnlyMode` como deprecated o eliminar. Recomendación: **eliminar** el archivo (estamos en desarrollo, sin consumidores externos).

### B. Eliminar el sidebar fantasma de raíz (refuerzo)

**`src/hooks/useAuth.tsx`**
- Hacer que `setLoading(false)` se ejecute **después** de que profile + roles estén cargados:
  ```ts
  const loadUserContext = async (userId: string) => {
    await Promise.all([fetchProfile(userId), fetchRoles(userId)]);
  };
  // dentro de onAuthStateChange y getSession inicial:
  if (session?.user) {
    setTimeout(() => {
      loadUserContext(session.user.id).finally(() => setLoading(false));
    }, 0);
  } else {
    setProfile(null); setRoles([]); setLoading(false);
  }
  ```
- Esto garantiza que cualquier consumidor de `loading` vea `false` solo cuando los roles están listos. Es defensa en profundidad: aunque (A) ya elimina la causa visual, esto evita futuros bugs por la misma asimetría.

`ProtectedRoute` ya muestra "Cargando…" cuando `loading`, así que con (B) el barista verá "Cargando…" → directo a `/cocina` con sidebar. Sin destello.

### C. Reemplazar botón de sonido por diálogo "Iniciar turno"

**Nuevo: `src/components/cocina/StartShiftDialog.tsx`**
- `<Dialog>` de shadcn, modal, no cerrable con ESC ni click fuera (`onOpenChange` controlado).
- Contenido:
  - Ícono grande `<ChefHat>` con fondo primario.
  - Título: "Iniciar turno de cocina".
  - Descripción: "Pulsa el botón para activar las alertas sonoras y comenzar a recibir órdenes en tiempo real."
  - Botón único, grande (`size="lg"`, mínimo 56 px alto), texto "Iniciar turno", con ícono `<Play>`.
- Al hacer click: invoca `onStart()` del padre, que crea/resume el `AudioContext` y cierra el diálogo.

**`src/pages/CocinaPage.tsx`**
- Quitar `<SoundEnabler>` del header y eliminar su import.
- Quitar estado `soundEnabled` y la función `enableSound` separada (la lógica se mueve al diálogo).
- Añadir:
  ```ts
  const [shiftStarted, setShiftStarted] = useState(false);
  const startShift = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx();
      audioCtxRef.current?.resume?.();
    } catch {}
    setShiftStarted(true);
  }, []);
  ```
- Renderizar `<StartShiftDialog open={!shiftStarted} onStart={startShift} />` siempre al inicio.
- El diálogo aparece para **cualquier rol** que entre a `/cocina` (admin o barista) — es coherente: cualquiera que vaya a operar el KDS necesita audio.

**Eliminar: `src/components/cocina/SoundEnabler.tsx`**
- Ya no se usa. Borrar.

---

## Resultado esperado

| Antes | Después |
|---|---|
| Barista login → flash de DashboardLayout → fullscreen sin sidebar | Barista login → "Cargando…" → DashboardLayout con sidebar y `/cocina` adentro. Mismo trato que cualquier rol. |
| Botón "Activar sonido" en header, fácil de ignorar; si no se toca, audio nunca suena | Diálogo modal "Iniciar turno" obligatorio al entrar a `/cocina`. Un click → audio garantizado. |
| Barista cierra sesión desde un botón duplicado en el header del KDS | Barista cierra sesión desde el footer del sidebar, como todos. |

## Archivos afectados

- `src/App.tsx` — simplificado, sin `HomeRedirect`/`CocinaRoute` especiales
- `src/hooks/useAuth.tsx` — `loading=false` solo tras cargar roles
- `src/pages/CocinaPage.tsx` — quita modo barista-only, integra diálogo
- `src/components/cocina/StartShiftDialog.tsx` — **nuevo**
- `src/components/cocina/SoundEnabler.tsx` — **eliminado**
- `src/lib/roles.ts` — **eliminado** (ya no se usa)

## Notas

- Esto es un cambio estructural pequeño aprovechando la fase de desarrollo: unificamos el barista al patrón de los demás roles, lo que simplifica el código y elimina una clase entera de bugs.
- El RLS endurecido del barista permanece intacto: aunque vea el sidebar, las rutas a las que no tiene acceso no aparecen (ya filtradas por `allowedRoles` en `AppSidebar`) y `/cocina` sigue siendo el único módulo donde puede operar.
