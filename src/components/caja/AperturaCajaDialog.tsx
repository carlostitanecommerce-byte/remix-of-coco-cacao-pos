import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onAbrirCaja: (monto: number) => Promise<{ error: string | null }>;
  onClose?: () => void;
}

export function AperturaCajaDialog({ open, onAbrirCaja, onClose }: Props) {
  const [monto, setMonto] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const val = parseFloat(monto);
    if (isNaN(val) || val < 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    setSaving(true);
    const { error } = await onAbrirCaja(val);
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Caja abierta exitosamente');
      setMonto('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose?.(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Apertura de Caja
          </DialogTitle>
          <DialogDescription>
            Para iniciar operaciones, ingresa el fondo fijo (efectivo inicial en caja).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fondo-fijo">Fondo fijo ($)</Label>
            <Input
              id="fondo-fijo"
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={saving} className="flex-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Abrir Caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
