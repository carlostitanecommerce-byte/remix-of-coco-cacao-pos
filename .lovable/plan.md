## Objetivo

Reemplazar el campo "URL de imagen" en el diálogo Editar/Nuevo Producto (Inventarios → Productos & Recetas) por un cargador de archivos (PNG/JPG). La imagen se guarda en almacenamiento de Lovable Cloud y su URL pública se persiste en `productos.imagen_url`, que ya consume el grid del POS.

## Cambios

### 1. Backend (migración SQL)
- Crear bucket público `productos` en Storage.
- Políticas RLS sobre `storage.objects` para el bucket:
  - SELECT: público (lectura abierta, necesario para mostrar en POS).
  - INSERT / UPDATE / DELETE: solo administradores (`has_role(auth.uid(), 'administrador')`), alineado con quién puede gestionar productos.

### 2. Frontend — `src/components/inventarios/ProductosTab.tsx`
Reemplazar el `<Input>` de URL (línea 526–529) por un control de carga:

- **Vista previa**: si `form.imagen_url` existe, mostrar miniatura (~80×80, `object-cover`, `rounded-md border`) con botón "Quitar" que limpia el campo.
- **Botón "Subir imagen"** (`<input type="file" accept="image/png,image/jpeg,image/webp">` oculto, disparado por un Button):
  - Validar tipo (PNG/JPG/WEBP) y tamaño (≤ 2 MB) → `toast.error` si falla.
  - Estado local `uploading` que deshabilita el botón y muestra spinner/etiqueta "Subiendo…".
  - Generar nombre único: `${crypto.randomUUID()}.${ext}`.
  - `supabase.storage.from('productos').upload(path, file, { upsert: false, contentType: file.type })`.
  - Obtener URL pública con `getPublicUrl(path)` y asignarla a `form.imagen_url`.
  - Toast de éxito.
- Mantener el campo opcional (sin imagen → se guarda `null`, igual que hoy).
- Sin cambios en la lógica de guardado existente (ya envía `imagen_url`).

### 3. POS
No requiere cambios. `ProductGrid.tsx` ya renderiza `p.imagen_url` cuando existe.

## Notas técnicas
- No se borra la imagen anterior del bucket al reemplazar (evita pérdidas si está reutilizada). Limpieza puede atenderse más adelante si se desea.
- No se redimensiona en cliente; el límite de 2 MB es suficiente para miniaturas de POS.
- Se conserva la firma de `productos.imagen_url` (text nullable) para no romper datos existentes que ya tengan URLs externas.
