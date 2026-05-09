import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CategoriaAmbito = 'insumo' | 'producto' | 'paquete';

export function useCategorias(ambito?: CategoriaAmbito) {
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategorias = async () => {
    setLoading(true);
    let q = supabase.from('categorias_maestras').select('nombre').order('nombre');
    if (ambito) q = q.eq('ambito', ambito);
    const { data } = await q;
    setCategorias((data ?? []).map((c: any) => c.nombre));
    setLoading(false);
  };

  useEffect(() => { fetchCategorias(); }, [ambito]);

  return { categorias, loading, refetch: fetchCategorias };
}
