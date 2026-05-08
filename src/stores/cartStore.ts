import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CartItem } from '@/components/pos/types';

interface CartState {
  items: CartItem[];
  coworkingSessionId: string | null;
  clienteNombre: string | null;
  ownerUserId: string | null;
  ensureOwner: (userId: string | null) => void;
  setItems: (items: CartItem[]) => void;
  addOrIncrementProduct: (item: CartItem) => void;
  addOrIncrementPaquete: (item: CartItem) => void;
  updateQty: (productoId: string, delta: number) => void;
  setQty: (productoId: string, qty: number) => void;
  updateNotas: (productoId: string, notas: string) => void;
  removeItem: (productoId: string) => void;
  clear: () => void;
  importCoworkingSession: (items: CartItem[], sessionId: string, clienteNombre: string) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      coworkingSessionId: null,
      clienteNombre: null,
      ownerUserId: null,
      ensureOwner: (userId) => {
        const current = get().ownerUserId;
        if (userId && current && current !== userId) {
          set({ items: [], coworkingSessionId: null, clienteNombre: null, ownerUserId: userId });
        } else if (userId && !current) {
          set({ ownerUserId: userId });
        } else if (!userId && current) {
          set({ items: [], coworkingSessionId: null, clienteNombre: null, ownerUserId: null });
        }
      },
      setItems: (items) => set({ items }),
      addOrIncrementProduct: (item) => {
        const items = get().items;
        const existing = items.find(
          (i) => i.producto_id === item.producto_id && i.tipo_concepto === 'producto'
        );
        if (existing) {
          set({
            items: items.map((i) =>
              i.producto_id === item.producto_id && i.tipo_concepto === 'producto'
                ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unitario }
                : i
            ),
          });
        } else {
          set({ items: [...items, item] });
        }
      },
      addOrIncrementPaquete: (item) => {
        const items = get().items;
        const existing = items.find(
          (i) => i.producto_id === item.producto_id && i.tipo_concepto === 'paquete'
        );
        if (existing) {
          set({
            items: items.map((i) =>
              i.producto_id === item.producto_id && i.tipo_concepto === 'paquete'
                ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unitario }
                : i
            ),
          });
        } else {
          set({ items: [...items, item] });
        }
      },
      updateQty: (productoId, delta) =>
        set({
          items: get().items.map((i) => {
            if (i.producto_id !== productoId) return i;
            const newQty = Math.max(1, i.cantidad + delta);
            return { ...i, cantidad: newQty, subtotal: newQty * i.precio_unitario };
          }),
        }),
      setQty: (productoId, qty) =>
        set({
          items: get().items.map((i) =>
            i.producto_id === productoId
              ? { ...i, cantidad: qty, subtotal: qty * i.precio_unitario }
              : i
          ),
        }),
      updateNotas: (productoId, notas) =>
        set({
          items: get().items.map((i) =>
            i.producto_id === productoId ? { ...i, notas: notas.trim() || undefined } : i
          ),
        }),
      removeItem: (productoId) =>
        set({ items: get().items.filter((i) => i.producto_id !== productoId) }),
      clear: () => set({ items: [], coworkingSessionId: null, clienteNombre: null }),
      // ownerUserId no se borra en clear() — sólo cambia al cambiar de usuario via ensureOwner.
      importCoworkingSession: (items, sessionId, clienteNombre) =>
        set({ items, coworkingSessionId: sessionId, clienteNombre }),
    }),
    {
      name: 'pos-cart',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
