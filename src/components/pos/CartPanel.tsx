import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Trash2, Plus, Minus, ShoppingCart, Package, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { CartItem } from './types';

interface Props {
  items: CartItem[];
  onUpdateQty: (productoId: string, delta: number) => void;
  onUpdateNotas?: (productoId: string, notas: string) => void;
  onRemove: (productoId: string) => void;
  onClear: () => void;
  subtotal: number;
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

export function CartPanel({ items, onUpdateQty, onUpdateNotas, onRemove, onClear, subtotal }: Props) {
  const productoItems = items.filter(i => i.tipo_concepto === 'producto');
  const paqueteItems = items.filter(i => i.tipo_concepto === 'paquete');

  const renderItem = (item: CartItem) => {
    const isPaquete = item.tipo_concepto === 'paquete';
    return (
      <div key={item.producto_id} className="rounded-md border border-border p-2 bg-card">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              {isPaquete && <Package className="h-3 w-3 text-primary shrink-0" />}
              <p className="text-sm font-medium truncate">{item.nombre}</p>
            </div>
            <p className="text-xs text-muted-foreground">${item.precio_unitario.toFixed(2)} c/u</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdateQty(item.producto_id, -1)}>
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-6 text-center text-sm font-medium">{item.cantidad}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdateQty(item.producto_id, 1)}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-sm font-bold w-16 text-right">${item.subtotal.toFixed(2)}</p>
          {onUpdateNotas && (
            <NotesPopover
              value={item.notas ?? ''}
              onChange={(v) => onUpdateNotas(item.producto_id, v)}
            />
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onRemove(item.producto_id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        {item.notas && (
          <p className="mt-1 ml-5 text-[11px] text-primary italic">📝 {item.notas}</p>
        )}
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
          <p className="text-muted-foreground text-sm text-center py-8">Agrega productos al ticket</p>
        ) : (
          <>
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

      <div className="border-t border-border pt-3 mt-3 space-y-1">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Subtotal:</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-lg font-bold">
          <span>Total:</span>
          <span className="text-primary">${subtotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
