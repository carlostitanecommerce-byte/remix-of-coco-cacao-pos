import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TarifasConfig } from './TarifasConfig';
import type { Area } from './types';

interface Props {
  areas: Area[];
}

export function ConfiguracionTab({ areas }: Props) {
  const { toast } = useToast();
  const [fraccion15, setFraccion15] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('configuracion_ventas')
        .select('valor')
        .eq('clave', 'cobro_fraccion_15min')
        .single();
      setFraccion15(data?.valor === 1);
      setLoading(false);
    };
    fetch();
  }, []);

  const handleToggle = async (checked: boolean) => {
    setFraccion15(checked);
    const { error } = await supabase
      .from('configuracion_ventas')
      .update({ valor: checked ? 1 : 0 })
      .eq('clave', 'cobro_fraccion_15min');

    if (error) {
      toast({ variant: 'destructive', title: 'Error al guardar configuración' });
      setFraccion15(!checked);
    } else {
      toast({ title: checked ? 'Cobro en bloques de 15 min activado' : 'Cobro al minuto exacto activado' });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />Configuración General
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="fraccion15">Cobro por fracciones de 15 minutos</Label>
              <p className="text-xs text-muted-foreground">
                {fraccion15
                  ? 'El tiempo excedido se cobra en bloques de 15 min (redondeado al alza)'
                  : 'El tiempo excedido se cobra al minuto exacto (prorrateado)'}
              </p>
            </div>
            <Switch
              id="fraccion15"
              checked={fraccion15}
              onCheckedChange={handleToggle}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>
      <TarifasConfig areas={areas} />
    </div>
  );
}
