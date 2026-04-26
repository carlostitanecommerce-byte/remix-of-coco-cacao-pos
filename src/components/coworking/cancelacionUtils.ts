import { supabase } from '@/integrations/supabase/client';

export interface SessionUpsellRow {
  id: string;
  producto_id: string;
  precio_especial: number;
  cantidad: number;
  nombre: string;
  isAmenity: boolean;
}

/**
 * Carga los amenities + extras asociados a una sesión, listos para
 * mostrarse en el diálogo de verificación de entregas.
 */
export async function fetchSessionUpsellsForCancel(
  sessionId: string,
): Promise<SessionUpsellRow[]> {
  const { data, error } = await supabase
    .from('coworking_session_upsells')
    .select('id, producto_id, precio_especial, cantidad, productos:producto_id(nombre)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return (data as any[]).map(u => ({
    id: u.id,
    producto_id: u.producto_id,
    precio_especial: Number(u.precio_especial) || 0,
    cantidad: u.cantidad,
    nombre: u.productos?.nombre ?? 'Producto',
    isAmenity: Number(u.precio_especial) === 0,
  }));
}

export interface EntregaItem {
  producto_id: string;
  nombre: string;
  cantidad: number;
}

/**
 * Por cada item entregado, busca la receta y descuenta el insumo del stock,
 * registrando una merma con motivo trazable. Devuelve resumen para auditoría.
 */
export async function aplicarEntregasComoMermas(params: {
  userId: string;
  clienteNombre: string;
  sessionId: string;
  motivoCancelacion: string;
  entregados: EntregaItem[];
}): Promise<{ mermasCreadas: number; insumosAfectados: number; errores: string[] }> {
  const { userId, clienteNombre, sessionId, motivoCancelacion, entregados } = params;
  const errores: string[] = [];
  let mermasCreadas = 0;
  let insumosAfectados = 0;

  for (const item of entregados) {
    if (item.cantidad <= 0) continue;

    const { data: recetas, error: recetaErr } = await supabase
      .from('recetas')
      .select('insumo_id, cantidad_necesaria, insumos:insumo_id(nombre, stock_actual)')
      .eq('producto_id', item.producto_id);

    if (recetaErr) {
      errores.push(`${item.nombre}: ${recetaErr.message}`);
      continue;
    }
    if (!recetas || recetas.length === 0) continue;

    for (const r of recetas as any[]) {
      const cantidadDescontar = Number(r.cantidad_necesaria) * item.cantidad;
      const stockActual = Number(r.insumos?.stock_actual ?? 0);
      const cantidadFinal = Math.min(cantidadDescontar, Math.max(0, stockActual));

      if (cantidadFinal <= 0) continue;

      const { error: mermaErr } = await supabase.from('mermas').insert({
        insumo_id: r.insumo_id,
        cantidad: cantidadFinal,
        motivo: `Entrega en sesión cancelada — ${clienteNombre} (${item.nombre} ×${item.cantidad})`,
        usuario_id: userId,
      });

      if (mermaErr) {
        errores.push(`${r.insumos?.nombre ?? 'insumo'}: ${mermaErr.message}`);
        continue;
      }

      const { error: stockErr } = await supabase
        .from('insumos')
        .update({ stock_actual: stockActual - cantidadFinal })
        .eq('id', r.insumo_id);

      if (stockErr) {
        errores.push(`stock ${r.insumos?.nombre ?? 'insumo'}: ${stockErr.message}`);
        continue;
      }

      mermasCreadas++;
      insumosAfectados++;
    }
  }

  // Auditoría adicional del descuento por entrega
  if (entregados.length > 0) {
    await supabase.from('audit_logs').insert([{
      user_id: userId,
      accion: 'descuento_inventario_cancelacion_sesion',
      descripcion: `Descuento por entregas reales en sesión cancelada — ${clienteNombre}`,
      metadata: {
        session_id: sessionId,
        motivo_cancelacion: motivoCancelacion,
        entregados,
        mermas_creadas: mermasCreadas,
        errores,
      },
    }]);
  }

  return { mermasCreadas, insumosAfectados, errores };
}

/**
 * Borra todos los upsells de una sesión cancelada (lo que antes hacía el trigger).
 * Se llama tras procesar las entregas reales.
 */
export async function limpiarUpsellsSesion(sessionId: string): Promise<void> {
  await supabase
    .from('coworking_session_upsells')
    .delete()
    .eq('session_id', sessionId);
}
