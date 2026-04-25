/**
 * Helpers para evaluar el rol del usuario.
 *
 * `isKitchenOnlyMode` decide si la app debe presentar el modo "Pantalla cocina"
 * (fullscreen, sin sidebar, redirección automática a /cocina).
 *
 * Regla: el usuario tiene rol `barista` Y NO tiene ningún rol de gestión
 * (administrador, supervisor, caja, recepcion). Esto es más robusto que
 * comprobar `roles.length === 1`, porque permite añadir roles auxiliares en
 * el futuro sin romper el modo cocina.
 */
const MANAGEMENT_ROLES = ['administrador', 'supervisor', 'caja', 'recepcion'];

export function isKitchenOnlyMode(roles: string[]): boolean {
  if (!roles.includes('barista')) return false;
  return !roles.some((r) => MANAGEMENT_ROLES.includes(r));
}
