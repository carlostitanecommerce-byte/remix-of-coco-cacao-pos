import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useCategorias() {
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategorias = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('categorias_maestras')
      .select('nombre')
      .order('nombre');
    setCategorias((data ?? []).map((c: any) => c.nombre));
    setLoading(false);
  };

  useEffect(() => { fetchCategorias(); }, []);

  return { categorias, loading, refetch: fetchCategorias };
}
