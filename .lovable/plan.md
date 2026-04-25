## Contexto

Hoy se marcaron 23 productos como retail (no van al KDS) directamente por SQL. Sin embargo, **el formulario de productos en Inventarios no expone ningún control para esto**: el campo `requiere_preparacion` existe en la base de datos, en el tipo del formulario y en la lógica de guardado/carga, pero **el Switch nunca se renderiza en la UI**.

**Consecuencia actual:** Cualquier producto nuevo que un admin cree desde la app entra al KDS por defecto (`requiere_preparacion=true`). Si mañana agregan "Coca-Cola lata" o "Galletas Marías", saturarán la cocina sin manera de evitarlo desde la interfaz.

**Veredicto objetivo:** Es necesario agregar el control. Toda la plomería ya está hecha (BD, tipos, save, load, filtro en `ConfirmVentaDialog`); solo falta exponer el Switch.

## Cambio a realizar

Un único archivo, una sola edición:

### `src/components/inventarios/ProductosTab.tsx`

Insertar dentro del diálogo de Nuevo/Editar Producto (después del campo "Modo de Preparación Exacto", antes del `Separator`) un bloque con `Switch` que controle `form.requiere_preparacion`.

```tsx
<div className="col-span-2 flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
  <div className="space-y-0.5">
    <Label htmlFor="requiere-prep-switch" className="text-sm font-semibold">
      Enviar a Cocina (KDS)
    </Label>
    <p className="text-xs text-muted-foreground">
      Activado: el producto aparece en la pantalla de cocina al venderse
      (bebidas, alimentos preparados).<br />
      Desactivado: producto retail listo para entregar (embotellados,
      empaquetados, papelería) — no satura la cocina.
    </p>
  </div>
  <Switch
    id="requiere-prep-switch"
    checked={form.requiere_preparacion}
    onCheckedChange={(checked) =>
      setForm(f => ({ ...f, requiere_preparacion: checked }))
    }
  />
</div>
```

## Lo que NO hace falta

- ❌ No requiere migración de base de datos (la columna ya existe).
- ❌ No requiere cambios en `ConfirmVentaDialog` (el filtro ya consulta `requiere_preparacion`).
- ❌ No requiere cambios en `CocinaPage`/`KdsBoard` (el filtrado es upstream).
- ❌ No requiere cambios de tipos ni en `emptyForm` (ya está como `true` por defecto).

## Resultado esperado

- Al crear/editar un producto desde Inventarios, el admin verá un toggle claro "Enviar a Cocina (KDS)".
- Por defecto activado (todos los productos nuevos siguen yendo a cocina, comportamiento seguro).
- El admin puede desactivarlo para retail puro y se respeta inmediatamente en el siguiente ticket.
