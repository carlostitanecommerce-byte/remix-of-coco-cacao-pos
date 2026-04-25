import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Trash2, Plus, Minus, ShoppingCart, Coffee, Users, RotateCcw, Package, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { CartItem, MixedPayment } from './types';

interface Props {
  items: CartItem[];
  metodoPago: string;
  tipoConsumo: string;
  mixedPayment: MixedPayment;
  propina: number;
  propinaEnDigital: boolean;
  onSetMetodoPago: (v: string) => void;
  onSetTipoConsumo: (v: string) => void;
  onSetMixedPayment: (v: MixedPayment) => void;
  onSetPropina: (v: number) => void;
  onSetPropinaEnDigital: (v: boolean) => void;
  onUpdateQty: (productoId: string, delta: number) => void;
  onUpdateNotas?: (productoId: string, notas: string) => void;
  onRemove: (productoId: string) => void;
  onClear: () => void;
  onConfirm: () => void;
  subtotal: number;
  comisionPct: number;
  missingImportedItems?: (CartItem & { cantidad_faltante: number })[];
  onRestoreItem?: (item: CartItem) => void | Promise<void>;
}

function NotesPopover({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const hasNotes = !!value?.trim();

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(value); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', hasNotes ? 'text-primary' : 'text-muted-foreground')}
          title={hasNotes ? `Nota: ${value}` : 'Agregar nota'}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <Label className="text-xs text-muted-foreground">Nota para cocina</Label>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ej: sin azúcar, leche deslactosada..."
          rows={3}
          maxLength={200}
          className="text-sm mt-1"
          autoFocus
        />
        <div className="flex justify-end gap-1 mt-2">
          <Button variant="ghost" size="sm" onClick={() => { onChange(''); setOpen(false); }}>
            Limpiar
          </Button>
          <Button size="sm" onClick={() => { onChange(draft); setOpen(false); }}>
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CartPanel({
  items, metodoPago, tipoConsumo, mixedPayment, propina, propinaEnDigital,
  onSetMetodoPago, onSetTipoConsumo, onSetMixedPayment, onSetPropina, onSetPropinaEnDigital,
  onUpdateQty, onRemove, onClear, onConfirm, subtotal, comisionPct,
  missingImportedItems = [], onRestoreItem,
}: Props) {
  const coworkingItems = items.filter(i => i.tipo_concepto === 'coworking');
  const amenityItems = items.filter(i => i.tipo_concepto === 'amenity');
  const productoItems = items.filter(i => i.tipo_concepto === 'producto');
  const paqueteItems = items.filter(i => i.tipo_concepto === 'paquete');

  const totalConComision = subtotal + propina;

  const mixedTotal = mixedPayment.efectivo + mixedPayment.tarjeta + mixedPayment.transferencia;
  const mixedValid = metodoPago !== 'mixto' || Math.abs(mixedTotal - totalConComision) < 0.01;

  const handleQuickTip = (pct: number) => {
    const base = subtotal;
    onSetPropina(Math.round(base * pct) / 100);
  };

  const renderItem = (item: CartItem) => {
    const isTarifa = item.tipo_concepto === 'coworking';
    const isAmenityIncluido = item.tipo_concepto === 'amenity' && item.precio_unitario === 0;
    const isPaquete = item.tipo_concepto === 'paquete';
    const lockQty = isTarifa;
    return (
      <div key={item.producto_id} className="rounded-md border border-border p-2 bg-card">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              {item.tipo_concepto === 'coworking' && <Users className="h-3 w-3 text-primary shrink-0" />}
              {item.tipo_concepto === 'amenity' && <Coffee className="h-3 w-3 text-green-500 shrink-0" />}
              {isPaquete && <Package className="h-3 w-3 text-primary shrink-0" />}
              <p className="text-sm font-medium truncate">{item.nombre}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {isAmenityIncluido ? 'Incluido' : `$${item.precio_unitario.toFixed(2)} c/u`}
            </p>
          </div>
          {!lockQty && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdateQty(item.producto_id, -1)}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-6 text-center text-sm font-medium">{item.cantidad}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdateQty(item.producto_id, 1)}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}
          {lockQty && <span className="w-6 text-center text-sm font-medium">{item.cantidad}</span>}
          <p className="text-sm font-bold w-16 text-right">${item.subtotal.toFixed(2)}</p>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onRemove(item.producto_id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        {isPaquete && item.componentes && item.componentes.length > 0 && (
          <ul className="mt-1.5 ml-5 space-y-0.5 border-l border-border pl-2">
            {item.componentes.map((c, idx) => (
              <li key={idx} className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span className="font-mono">{c.cantidad * item.cantidad}x</span>
                <span className="truncate">{c.nombre}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading font-bold text-lg flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" /> Ticket
        </h2>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="text-destructive hover:text-destructive">
            Limpiar
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Agrega productos o sesiones al ticket</p>
        ) : (
          <>
            {coworkingItems.length > 0 && (
              <div className="space-y-1">
                <Badge variant="outline" className="text-xs mb-1">Coworking</Badge>
                {coworkingItems.map(renderItem)}
              </div>
            )}
            {amenityItems.length > 0 && (
              <div className="space-y-1">
                <Badge variant="outline" className="text-xs mb-1 border-green-500 text-green-600">Amenities</Badge>
                {amenityItems.map(renderItem)}
              </div>
            )}
            {paqueteItems.length > 0 && (
              <div className="space-y-1">
                <Badge variant="outline" className="text-xs mb-1 border-primary text-primary">📦 Paquetes</Badge>
                {paqueteItems.map(renderItem)}
              </div>
            )}
            {productoItems.length > 0 && (
              <div className="space-y-1">
                <Badge variant="outline" className="text-xs mb-1">Productos</Badge>
                {productoItems.map(renderItem)}
              </div>
            )}
          </>
        )}

      </div>

      {missingImportedItems && missingImportedItems.length > 0 && (
        <div className="border-t border-border pt-3 mt-3 space-y-2">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Coffee className="h-3.5 w-3.5" /> Consumos de sesión omitidos
          </p>
          <div className="space-y-1.5">
            {missingImportedItems.map((mi, idx) => (
              <div key={idx} className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-md p-2 text-sm">
                <div>
                  <span className="font-medium text-foreground">{mi.nombre}</span>
                  <span className="text-xs text-muted-foreground ml-2">Faltan: {mi.cantidad_faltante}</span>
                </div>
                <Button size="sm" variant="outline" className="h-7 border-primary/30 text-primary hover:bg-primary/10" onClick={() => onRestoreItem && onRestoreItem(mi)}>
                  <Plus className="h-3 w-3 mr-1" /> Reclamar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border pt-3 mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Método de pago</label>
            <Select value={metodoPago} onValueChange={onSetMetodoPago}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="mixto">Mixto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tipo de consumo</label>
            <Select value={tipoConsumo} onValueChange={onSetTipoConsumo}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sitio">En sitio</SelectItem>
                <SelectItem value="para_llevar">Para llevar</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Propina */}
        <div className="space-y-1.5 p-2 rounded-md border border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Propina</label>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => handleQuickTip(10)}>10%</Button>
              <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => handleQuickTip(15)}>15%</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-destructive" onClick={() => onSetPropina(0)}>Limpiar</Button>
            </div>
          </div>
          <Input
            type="number"
            min={0}
            step={0.01}
            className="h-8 text-sm"
            placeholder="$0.00"
            value={propina || ''}
            onChange={e => onSetPropina(parseFloat(e.target.value) || 0)}
          />
          {metodoPago === 'mixto' && propina > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="propina-digital"
                checked={propinaEnDigital}
                onCheckedChange={(v) => onSetPropinaEnDigital(!!v)}
              />
              <Label htmlFor="propina-digital" className="text-[10px] text-muted-foreground cursor-pointer">
                Propina incluida en pago digital (tarjeta/transferencia)
              </Label>
            </div>
          )}
        </div>

        {/* Mixed payment breakdown */}
        {metodoPago === 'mixto' && (
          <div className="space-y-2 p-2 rounded-md border border-border bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground">Desglose de pago mixto</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Efectivo</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  className="h-8 text-sm"
                  value={mixedPayment.efectivo || ''}
                  onChange={e => onSetMixedPayment({ ...mixedPayment, efectivo: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Tarjeta</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  className="h-8 text-sm"
                  value={mixedPayment.tarjeta || ''}
                  onChange={e => onSetMixedPayment({ ...mixedPayment, tarjeta: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Transferencia</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  className="h-8 text-sm"
                  value={mixedPayment.transferencia || ''}
                  onChange={e => onSetMixedPayment({ ...mixedPayment, transferencia: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className={mixedValid ? 'text-green-600' : 'text-destructive'}>
                Suma: ${mixedTotal.toFixed(2)}
              </span>
              <span>Total requerido: ${totalConComision.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Subtotal:</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {propina > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Propina:</span>
              <span className="text-primary">+${propina.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-lg font-bold">
            <span>Total:</span>
            <span className="text-primary">${totalConComision.toFixed(2)}</span>
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={items.length === 0 || (metodoPago === 'mixto' && !mixedValid)}
          onClick={onConfirm}
        >
          Procesar Venta
        </Button>
      </div>
    </div>
  );
}
