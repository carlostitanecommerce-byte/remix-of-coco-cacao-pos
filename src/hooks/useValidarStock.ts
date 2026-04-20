import { supabase } from '@/integrations/supabase/client';

export async function verificarStock(productoId: string, cantidad: number): Promise<{ valido: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('validar_stock_disponible' as any, {
    p_producto_id: productoId,
    p_cantidad: cantidad,
  });

  if (error) {
    console.error('Error validando stock:', error);
    return { valido: false, error: 'Error de conexión al validar stock' };
  }

  const resultado = data as { valido: boolean; error?: string };
  return resultado;
}
