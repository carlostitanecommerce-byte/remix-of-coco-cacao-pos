import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Trash2, Plus, Minus, CreditCard, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useCartStore } from '@/stores/cartStore';
import { useVentaConfig } from '@/components/caja/useVentaConfig';
import { ConfirmVentaDialog } from '@/components/caja/ConfirmVentaDialog';
import type { VentaSummary, MixedPayment } from '@/components/pos/types';

type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';
type TipoConsumo = 'sitio' | 'para_llevar' | 'delivery';

export function CajaCheckoutPanel() {
  const items = useCartStore((s) => s.items);
  const coworkingSessionId = useCartStore((s) => s.coworkingSessionId);
  const clienteNombre = useCartStore((s) => s.clienteNombre);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);

  const { config } = useVentaConfig();

  const [tipoConsumo, setTipoConsumo] = useState<TipoConsumo>('sitio');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [propinaPct, setPropinaPct] = useState<0 | 10 | 15 | 'manual'>(0);
  const [propinaManual, setPropinaManual] = useState('');
  const [propinaEnDigital, setPropinaEnDigital] = useState(false);
  const [mixed, setMixed] = useState<MixedPayment>({ efectivo: 0, tarjeta: 0, transferencia: 0 });
  const [summary, setSummary] = useState<VentaSummary | null>(null);

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.subtotal, 0), [items]);

  const propina = useMemo(() => {
    if (propinaPct === 'manual') return Math.max(0, parseFloat(propinaManual) || 0);
    return +(subtotal * (propinaPct / 100)).toFixed(2);
  }, [propinaPct, propinaManual, subtotal]);

  const comision = metodoPago === 'tarjeta'
    ? +(subtotal * (config.comision_bancaria_porcentaje / 100)).toFixed(2)
    : metodoPago === 'mixto'
      ? +(mixed.tarjeta * (config.comision_bancaria_porcentaje / 100)).toFixed(2)
      : 0;

  const total = +(subtotal + propina).toFixed(2);

  const sumaMixta = +(mixed.efectivo + mixed.tarjeta + mixed.transferencia).toFixed(2);
  const mixtoValido = metodoPago !== 'mixto' || Math.abs(sumaMixta - subtotal) < 0.01;

  // Reset propina_en_digital when method changes
  useEffect(() => {
    if (metodoPago === 'efectivo') setPropinaEnDigital(false);
  }, [metodoPago]);

  const handleCobrar = () => {
    if (items.length === 0) { toast.error('Agrega productos al ticket'); return; }
    if (!mixtoValido) { toast.error(`Pagos mixtos suman $${sumaMixta.toFixed(2)} pero el subtotal es $${subtotal.toFixed(2)}`); return; }

    const ventaSummary: VentaSummary = {
      items,
      subtotal,
      iva: +(subtotal - subtotal / (1 + config.iva_porcentaje / 100)).toFixed(2),
      comision,
      propina,
      total,
      metodo_pago: metodoPago,
      tipo_consumo: tipoConsumo,
      mixed_payment: metodoPago === 'mixto' ? mixed : undefined,
      propina_en_digital: propinaEnDigital,
      coworking_session_id: coworkingSessionId ?? undefined,
    };
    setSummary(ventaSummary);
  };

  const handleSuccess = () => {
    clear();
    setMetodoPago('efectivo');
    setTipoConsumo('sitio');
    setPropinaPct(0);
    setPropinaManual('');
    setMixed({ efectivo: 0, tarjeta: 0, transferencia: 0 });
  };

  return (
    <div className="border border-border rounded-lg bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" /> Ticket activo
        </h2>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear} className="text-destructive hover:text-destructive">
            Limpiar
          </Button>
        )}
      </div>

      {clienteNombre && (
        <div className="px-4 py-2 bg-primary/5 border-b border-border text-xs">
          <Badge variant="outline" className="mr-2">Coworking</Badge>
          <span className="font-medium">{clienteNombre}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 max-h-[40vh]">
        {items.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>El ticket está vacío</p>
            <p className="text-xs mt-1">Agrega productos desde POS o importa una sesión de coworking</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.producto_id} className="flex items-center gap-2 text-sm border border-border rounded-md p-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.nombre}</p>
                <p className="text-xs text-muted-foreground">${item.precio_unitario.toFixed(2)} c/u</p>
              </div>
              {item.tipo_concepto !== 'coworking' && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(item.producto_id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-xs">{item.cantidad}</span>
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(item.producto_id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <span className="font-bold w-16 text-right">${item.subtotal.toFixed(2)}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(item.producto_id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>

      {items.length > 0 && (
        <div className="p-4 border-t border-border space-y-3">
          {/* Tipo consumo */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Consumo</Label>
              <Select value={tipoConsumo} onValueChange={(v) => setTipoConsumo(v as TipoConsumo)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sitio">En sitio</SelectItem>
                  <SelectItem value="para_llevar">Para llevar</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Método de pago</Label>
              <Select value={metodoPago} onValueChange={(v) => setMetodoPago(v as MetodoPago)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="mixto">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {metodoPago === 'mixto' && (
            <div className="space-y-2 p-2 rounded-md bg-muted/30 border border-border">
              <Label className="text-xs">Distribución (debe sumar ${subtotal.toFixed(2)})</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['efectivo', 'tarjeta', 'transferencia'] as const).map((k) => (
                  <div key={k}>
                    <Label className="text-[10px] capitalize">{k}</Label>
                    <Input
                      type="number" min={0} step={0.01}
                      value={mixed[k] || ''}
                      onChange={(e) => setMixed({ ...mixed, [k]: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
              {!mixtoValido && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Suma actual: ${sumaMixta.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Propina */}
          <div className="space-y-1">
            <Label className="text-xs">Propina</Label>
            <div className="grid grid-cols-4 gap-1">
              {([0, 10, 15] as const).map((p) => (
                <Button
                  key={p}
                  variant={propinaPct === p ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPropinaPct(p)}
                  className="h-8 text-xs"
                >
                  {p === 0 ? 'Sin' : `${p}%`}
                </Button>
              ))}
              <Button
                variant={propinaPct === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPropinaPct('manual')}
                className="h-8 text-xs"
              >
                Manual
              </Button>
            </div>
            {propinaPct === 'manual' && (
              <Input
                type="number" min={0} step={0.01} placeholder="0.00"
                value={propinaManual}
                onChange={(e) => setPropinaManual(e.target.value)}
                className="h-8 text-sm mt-1"
              />
            )}
            {metodoPago !== 'efectivo' && propina > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <Checkbox
                  id="propina-digital"
                  checked={propinaEnDigital}
                  onCheckedChange={(v) => setPropinaEnDigital(!!v)}
                />
                <Label htmlFor="propina-digital" className="text-xs cursor-pointer">
                  Propina cobrada por método digital
                </Label>
              </div>
            )}
          </div>

          <Separator />

          {/* Totales */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
            </div>
            {propina > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Propina</span><span>${propina.toFixed(2)}</span>
              </div>
            )}
            {comision > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground italic">
                <span>Comisión bancaria ({config.comision_bancaria_porcentaje}%)</span>
                <span>${comision.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-1">
              <span>Total</span>
              <span className="text-primary">${total.toFixed(2)}</span>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={handleCobrar}
            disabled={!mixtoValido}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Cobrar ${total.toFixed(2)}
          </Button>
        </div>
      )}

      <ConfirmVentaDialog
        summary={summary}
        onClose={() => setSummary(null)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
