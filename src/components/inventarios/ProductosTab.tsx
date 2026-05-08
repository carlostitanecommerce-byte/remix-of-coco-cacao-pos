import { useState, useEffect, useCallback, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCategorias } from '@/hooks/useCategorias';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, BookOpen, Copy, Search, Download, Upload, X, Loader2, ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface Insumo {
  id: string;
  nombre: string;
  unidad_medida: string;
  costo_unitario: number;
}

interface RecetaLine {
  id?: string;
  insumo_id: string;
  cantidad_necesaria: number;
  insumo?: Insumo;
}

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio_venta: number;
  costo_total: number;
  margen: number;
  imagen_url: string | null;
  instrucciones_preparacion: string | null;
  precio_upsell_coworking: number | null;
  activo: boolean;
  requiere_preparacion: boolean;
}

const emptyForm = { nombre: '', categoria: '', precio_venta: '', imagen_url: '', instrucciones_preparacion: '', precio_upsell_coworking: '', requiere_preparacion: true };

interface Props { isAdmin: boolean; roles: string[] }

const ProductosTab = ({ isAdmin, roles }: Props) => {
  const { categorias: CATEGORIAS } = useCategorias();
  const { user } = useAuth();
  const canEditInstructions = isAdmin || roles.includes('supervisor');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [receta, setReceta] = useState<RecetaLine[]>([]);
  const [newLine, setNewLine] = useState({ insumo_id: '', cantidad: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedRecetas, setExpandedRecetas] = useState<Record<string, RecetaLine[]>>({});
  const [expandedInstrucciones, setExpandedInstrucciones] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('productos').select('*').eq('tipo', 'simple').order('nombre');
    setProductos((data as Producto[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProductos();
    supabase.from('insumos').select('id, nombre, unidad_medida, costo_unitario').order('nombre')
      .then(({ data }) => setInsumos((data as Insumo[]) ?? []));
  }, [fetchProductos]);

  const calcCosto = (lines: RecetaLine[]) =>
    lines.reduce((sum, l) => {
      const ins = insumos.find(i => i.id === l.insumo_id);
      return sum + (ins ? ins.costo_unitario * l.cantidad_necesaria : 0);
    }, 0);

  const calcMargen = (precio: number, costo: number) =>
    precio > 0 ? ((precio - costo) / precio) * 100 : 0;

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setReceta([]);
    setNewLine({ insumo_id: '', cantidad: '' });
    setDialogOpen(true);
  };

  const openEdit = async (producto: Producto) => {
    setEditingId(producto.id);
    setForm({
      nombre: producto.nombre,
      categoria: producto.categoria,
      precio_venta: String(producto.precio_venta),
      imagen_url: producto.imagen_url ?? '',
      instrucciones_preparacion: producto.instrucciones_preparacion ?? '',
      precio_upsell_coworking: producto.precio_upsell_coworking != null ? String(producto.precio_upsell_coworking) : '',
      requiere_preparacion: producto.requiere_preparacion !== false,
    });
    const { data } = await supabase
      .from('recetas')
      .select('id, insumo_id, cantidad_necesaria, insumos(id, nombre, unidad_medida, costo_unitario)')
      .eq('producto_id', producto.id);
    const lines: RecetaLine[] = (data ?? []).map((r: any) => ({
      id: r.id, insumo_id: r.insumo_id, cantidad_necesaria: r.cantidad_necesaria, insumo: r.insumos,
    }));
    setReceta(lines);
    setNewLine({ insumo_id: '', cantidad: '' });
    setDialogOpen(true);
  };

  const handleDuplicate = async (producto: Producto) => {
    // Load recipe for the product
    const { data } = await supabase
      .from('recetas')
      .select('id, insumo_id, cantidad_necesaria, insumos(id, nombre, unidad_medida, costo_unitario)')
      .eq('producto_id', producto.id);
    const lines: RecetaLine[] = (data ?? []).map((r: any) => ({
      insumo_id: r.insumo_id, cantidad_necesaria: r.cantidad_necesaria, insumo: r.insumos,
    }));

    setEditingId(null);
    setForm({
      nombre: `Copia de ${producto.nombre}`,
      categoria: producto.categoria,
      precio_venta: String(producto.precio_venta),
      imagen_url: producto.imagen_url ?? '',
      instrucciones_preparacion: producto.instrucciones_preparacion ?? '',
      precio_upsell_coworking: producto.precio_upsell_coworking != null ? String(producto.precio_upsell_coworking) : '',
      requiere_preparacion: producto.requiere_preparacion !== false,
    });
    setReceta(lines);
    setNewLine({ insumo_id: '', cantidad: '' });
    setDialogOpen(true);

    // Audit log for duplication attempt
    if (user) {
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        accion: 'duplicar_producto',
        descripcion: `Duplicación iniciada desde: ${producto.nombre}`,
        metadata: { producto_base_id: producto.id, producto_base_nombre: producto.nombre },
      });
    }
  };

  const addLine = () => {
    if (!newLine.insumo_id || !newLine.cantidad) { toast.error('Selecciona insumo y cantidad'); return; }
    if (receta.some(l => l.insumo_id === newLine.insumo_id)) { toast.error('Ese insumo ya está en la receta'); return; }
    const ins = insumos.find(i => i.id === newLine.insumo_id)!;
    setReceta(r => [...r, { insumo_id: newLine.insumo_id, cantidad_necesaria: parseFloat(newLine.cantidad), insumo: ins }]);
    setNewLine({ insumo_id: '', cantidad: '' });
  };

  const removeLine = (idx: number) => setReceta(r => r.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    const precio = parseFloat(form.precio_venta) || 0;
    const costo = calcCosto(receta);
    const margen = calcMargen(precio, costo);

    const precioUpsell = parseFloat(form.precio_upsell_coworking) || null;

    const payload = {
      nombre: form.nombre.trim(),
      categoria: form.categoria,
      precio_venta: precio,
      costo_total: costo,
      margen,
      imagen_url: form.imagen_url || null,
      instrucciones_preparacion: form.instrucciones_preparacion.trim() || null,
      precio_upsell_coworking: precioUpsell,
      requiere_preparacion: form.requiere_preparacion,
    };

    let productoId = editingId;

    if (editingId) {
      const { error } = await supabase.from('productos').update(payload).eq('id', editingId);
      if (error) { toast.error('Error al actualizar producto'); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('productos').insert(payload).select('id').single();
      if (error || !data) { toast.error('Error al crear producto'); setSaving(false); return; }
      productoId = data.id;
    }

    await supabase.from('recetas').delete().eq('producto_id', productoId!);
    if (receta.length > 0) {
      await supabase.from('recetas').insert(
        receta.map(l => ({ producto_id: productoId!, insumo_id: l.insumo_id, cantidad_necesaria: l.cantidad_necesaria }))
      );
    }

    await supabase.from('audit_logs').insert({
      user_id: user!.id,
      accion: editingId ? 'actualizar_producto' : 'crear_producto',
      descripcion: `${editingId ? 'Actualización' : 'Creación'} de producto: ${payload.nombre}`,
      metadata: { producto_id: productoId, ...payload, receta_insumos: receta.length },
    });

    toast.success(`Producto ${editingId ? 'actualizado' : 'creado'}`);
    setSaving(false);
    setDialogOpen(false);
    fetchProductos();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato no válido. Usa PNG, JPG o WEBP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen excede el límite de 2 MB.');
      return;
    }

    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('productos')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('productos').getPublicUrl(path);
      setForm(f => ({ ...f, imagen_url: data.publicUrl }));
      toast.success('Imagen subida');
    } catch (err: any) {
      toast.error(err?.message || 'Error al subir imagen');
    } finally {
      setUploadingImage(false);
    }
  };
  const [deleteBlock, setDeleteBlock] = useState<string | null>(null);

  const checkAndPromptDelete = async (p: Producto) => {
    setDeleteBlock(null);

    // Bloqueos por dependencias
    const [paqRes, upsellRes, amenityRes, sesionRes] = await Promise.all([
      supabase.from('paquete_componentes').select('paquete_id').eq('producto_id', p.id),
      supabase.from('tarifa_upsells').select('tarifa_id').eq('producto_id', p.id),
      supabase.from('tarifa_amenities_incluidos').select('tarifa_id').eq('producto_id', p.id),
      supabase.from('coworking_session_upsells')
        .select('session_id, coworking_sessions!inner(estado)')
        .eq('producto_id', p.id)
        .eq('coworking_sessions.estado', 'activo'),
    ]);

    const bloqueos: string[] = [];
    if (paqRes.data && paqRes.data.length > 0) bloqueos.push(`forma parte de ${paqRes.data.length} paquete(s)`);
    if (upsellRes.data && upsellRes.data.length > 0) bloqueos.push(`está configurado como upsell en ${upsellRes.data.length} tarifa(s)`);
    if (amenityRes.data && amenityRes.data.length > 0) bloqueos.push(`es amenity incluido en ${amenityRes.data.length} tarifa(s)`);
    if (sesionRes.data && sesionRes.data.length > 0) bloqueos.push(`está consumido en ${sesionRes.data.length} sesión(es) activa(s) de coworking`);

    if (bloqueos.length > 0) {
      setDeleteBlock(`No se puede eliminar "${p.nombre}" porque ${bloqueos.join(', ')}.`);
      setDeleteCandidate(p);
      return;
    }
    setDeleteCandidate(p);
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    const { error } = await supabase.from('productos').delete().eq('id', deleteCandidate.id);
    if (error) toast.error('Error al eliminar producto');
    else {
      toast.success('Producto eliminado');
      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          accion: 'eliminar_producto',
          descripcion: `Producto eliminado: ${deleteCandidate.nombre}`,
          metadata: { producto_id: deleteCandidate.id, producto_nombre: deleteCandidate.nombre },
        });
      }
      fetchProductos();
    }
    setDeleteCandidate(null);
    setDeleteBlock(null);
  };

  const toggleReceta = async (productoId: string) => {
    if (expandedId === productoId) { setExpandedId(null); return; }
    const { data } = await supabase
      .from('recetas')
      .select('id, insumo_id, cantidad_necesaria, insumos(id, nombre, unidad_medida, costo_unitario)')
      .eq('producto_id', productoId);
    const lines: RecetaLine[] = (data ?? []).map((r: any) => ({
      id: r.id, insumo_id: r.insumo_id, cantidad_necesaria: r.cantidad_necesaria, insumo: r.insumos,
    }));
    setExpandedRecetas(prev => ({ ...prev, [productoId]: lines }));
    // Also load instructions
    const prod = productos.find(p => p.id === productoId);
    setExpandedInstrucciones(prev => ({ ...prev, [productoId]: prod?.instrucciones_preparacion ?? null }));
    setExpandedId(productoId);
  };

  const handleDownloadRecetas = async () => {
    const { data: recetasData } = await supabase
      .from('recetas')
      .select('cantidad_necesaria, producto_id, productos(nombre, categoria, precio_venta, costo_total, instrucciones_preparacion), insumos(nombre, unidad_medida, costo_unitario)');

    // Group by product
    const grouped: Record<string, { producto: any; lines: any[] }> = {};
    for (const r of (recetasData ?? []) as any[]) {
      const pid = r.producto_id;
      if (!grouped[pid]) grouped[pid] = { producto: r.productos, lines: [] };
      grouped[pid].lines.push(r);
    }

    // Add products without recipes
    for (const p of productos) {
      if (!grouped[p.id]) grouped[p.id] = { producto: { nombre: p.nombre, categoria: p.categoria, precio_venta: p.precio_venta, costo_total: p.costo_total, instrucciones_preparacion: p.instrucciones_preparacion }, lines: [] };
    }

    const rows: Record<string, any>[] = [];
    for (const g of Object.values(grouped)) {
      const costoTotal = g.producto.costo_total ?? 0;
      const precioVenta = g.producto.precio_venta ?? 0;
      const margenPct = precioVenta > 0 ? +((1 - costoTotal / precioVenta) * 100).toFixed(1) : 0;

      if (g.lines.length === 0) {
        rows.push({
          Producto: g.producto.nombre,
          Categoría: g.producto.categoria,
          'Precio Venta': precioVenta,
          'Costo Total': costoTotal,
          'Margen (%)': margenPct,
          Insumo: 'Sin receta',
          Cantidad: '',
          Unidad: '',
          'Costo Unitario': '',
          'Costo Línea': '',
          'Modo de Preparación': g.producto.instrucciones_preparacion || '—',
        });
      } else {
        g.lines.forEach((l: any, i: number) => {
          const costoLinea = (l.insumos?.costo_unitario ?? 0) * l.cantidad_necesaria;
          rows.push({
            Producto: i === 0 ? g.producto.nombre : '',
            Categoría: i === 0 ? g.producto.categoria : '',
            'Precio Venta': i === 0 ? precioVenta : '',
            'Costo Total': i === 0 ? costoTotal : '',
            'Margen (%)': i === 0 ? margenPct : '',
            Insumo: l.insumos?.nombre ?? '',
            Cantidad: l.cantidad_necesaria,
            Unidad: l.insumos?.unidad_medida ?? '',
            'Costo Unitario': l.insumos?.costo_unitario ?? 0,
            'Costo Línea': costoLinea,
            'Modo de Preparación': i === 0 ? (g.producto.instrucciones_preparacion || '—') : '',
          });
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recetas');
    XLSX.writeFile(wb, 'recetas_productos.xlsx');
    toast.success('Recetas descargadas');
  };

  const costoPreview = calcCosto(receta);
  const precioPreview = parseFloat(form.precio_venta) || 0;
  const margenPreview = calcMargen(precioPreview, costoPreview);
  const precioEspecialPreview = parseFloat(form.precio_upsell_coworking) || 0;
  const margenEspecialPreview = precioEspecialPreview > 0 ? calcMargen(precioEspecialPreview, costoPreview) : null;

  const margenColor = (m: number) =>
    m > 40 ? 'text-green-600' : m >= 20 ? 'text-yellow-600' : 'text-destructive';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-heading font-semibold text-foreground whitespace-nowrap">Productos Finales</h2>
        <div className="flex items-center gap-2">
          <Button onClick={handleDownloadRecetas} size="sm" variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Descargar Recetas
          </Button>
          {isAdmin && (
            <Button onClick={openNew} size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Nuevo Producto
            </Button>
          )}
        </div>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Precio Venta</TableHead>
                {isAdmin && <TableHead className="text-right">Costo</TableHead>}
                {isAdmin && <TableHead className="text-right">Margen</TableHead>}
                <TableHead>Receta</TableHead>
                {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : (() => {
                const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.categoria.toLowerCase().includes(busqueda.toLowerCase()));
                return filtrados.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{busqueda ? 'Sin resultados para la búsqueda' : 'Sin productos registrados'}</TableCell></TableRow>
                ) : filtrados.map(p => (
                <Fragment key={p.id}>
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.categoria}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">${p.precio_venta.toFixed(2)}</TableCell>
                    {isAdmin && <TableCell className="text-right font-mono text-muted-foreground">${p.costo_total.toFixed(2)}</TableCell>}
                    {isAdmin && (
                      <TableCell className="text-right">
                        <span className={`font-mono font-semibold ${p.margen >= 50 ? 'text-green-600' : p.margen >= 25 ? 'text-accent-foreground' : 'text-destructive'}`}>
                          {p.margen.toFixed(1)}%
                        </span>
                      </TableCell>
                    )}
                    <TableCell>
                      <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => toggleReceta(p.id)}>
                        <BookOpen className="h-3 w-3" />
                        {expandedId === p.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleDuplicate(p)} title="Duplicar">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => checkAndPromptDelete(p)} title="Eliminar">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  {expandedId === p.id && (
                    <TableRow key={`${p.id}-receta`}>
                      <TableCell colSpan={7} className="bg-muted/30 py-3 px-6 space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Receta</p>
                          {(expandedRecetas[p.id] ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sin insumos en receta</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {(expandedRecetas[p.id] ?? []).map(l => (
                                <span key={l.insumo_id} className="inline-flex items-center gap-1 rounded-full bg-background border border-border px-3 py-1 text-xs">
                                  {l.insumo?.nombre} — {l.cantidad_necesaria} {l.insumo?.unidad_medida}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {expandedInstrucciones[p.id] && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Modo de Preparación</p>
                            <p className="text-sm whitespace-pre-wrap bg-background border border-border rounded-md p-3">
                              {expandedInstrucciones[p.id]}
                            </p>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ));
              })()}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Producto + Receta */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Nombre del producto *</Label>
                <Input placeholder="ej. Chocolate Maya Grande" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Categoría</Label>
                <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Precio de venta ($)</Label>
                <Input type="number" min="0" step="0.01" value={form.precio_venta} onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Precio Especial Upsell ($)</Label>
                <Input type="number" min="0" step="0.01" placeholder="Opcional" value={form.precio_upsell_coworking} onChange={e => setForm(f => ({ ...f, precio_upsell_coworking: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Precio para paquetes coworking y cortesías admin.</p>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>URL de imagen (opcional)</Label>
                <Input placeholder="https://..." value={form.imagen_url} onChange={e => setForm(f => ({ ...f, imagen_url: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Modo de Preparación Exacto</Label>
                <Textarea
                  placeholder="Paso 1: Calentar leche a 70°C...&#10;Paso 2: Agregar 30g de chocolate...&#10;Paso 3: Batir durante 2 minutos..."
                  rows={4}
                  value={form.instrucciones_preparacion}
                  onChange={e => setForm(f => ({ ...f, instrucciones_preparacion: e.target.value }))}
                  disabled={!canEditInstructions}
                  className={!canEditInstructions ? 'opacity-70' : ''}
                />
                {!canEditInstructions && (
                  <p className="text-xs text-muted-foreground">Solo administradores y supervisores pueden editar las instrucciones.</p>
                )}
              </div>
              <div className="col-span-2 flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="requiere-prep-switch" className="text-sm font-semibold">
                    Enviar a Cocina (KDS)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Activado: el producto aparece en la pantalla de cocina al venderse (bebidas, alimentos preparados).
                    <br />
                    Desactivado: producto retail listo para entregar (embotellados, empaquetados, papelería) — no satura la cocina.
                  </p>
                </div>
                <Switch
                  id="requiere-prep-switch"
                  checked={form.requiere_preparacion}
                  onCheckedChange={(checked) => setForm(f => ({ ...f, requiere_preparacion: checked }))}
                />
              </div>
            </div>

            <Separator />

            {/* Recipe builder */}
            <div className="space-y-3">
              <h3 className="font-heading font-semibold text-sm">Constructor de Receta</h3>

              {/* Cost preview */}
              <div className="grid grid-cols-2 gap-3 rounded-md bg-muted p-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Costo calculado</p>
                  <p className="font-mono font-semibold">${costoPreview.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Precio venta</p>
                  <p className="font-mono font-semibold">${precioPreview.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Margen Público</p>
                  <p className={`font-mono font-bold ${margenColor(margenPreview)}`}>
                    {margenPreview.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Margen Especial</p>
                  {margenEspecialPreview !== null ? (
                    <p className={`font-mono font-bold ${margenColor(margenEspecialPreview)}`}>
                      {margenEspecialPreview.toFixed(1)}%
                      <span className="text-muted-foreground font-normal text-xs ml-1">(${precioEspecialPreview.toFixed(2)})</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground font-mono text-xs">Sin precio especial</p>
                  )}
                </div>
              </div>

              {/* Existing lines */}
              {receta.length > 0 && (
                <div className="space-y-1">
                  {receta.map((l, idx) => {
                    const ins = insumos.find(i => i.id === l.insumo_id) ?? l.insumo;
                    return (
                      <div key={idx} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                        <span className="flex-1">{ins?.nombre}</span>
                        <span className="font-mono text-muted-foreground">{l.cantidad_necesaria} {ins?.unidad_medida}</span>
                        <span className="font-mono text-xs text-muted-foreground">${((ins?.costo_unitario ?? 0) * l.cantidad_necesaria).toFixed(4)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLine(idx)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add line */}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Insumo</Label>
                  <Select value={newLine.insumo_id} onValueChange={v => setNewLine(l => ({ ...l, insumo_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar insumo..." /></SelectTrigger>
                    <SelectContent>
                      {insumos.filter(i => !receta.some(r => r.insumo_id === i.id)).map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.nombre} ({i.unidad_medida})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Cantidad</Label>
                  <Input type="number" min="0.01" step="0.01" placeholder="0" value={newLine.cantidad} onChange={e => setNewLine(l => ({ ...l, cantidad: e.target.value }))} />
                </div>
                <Button type="button" size="icon" onClick={addLine}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Producto'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCandidate} onOpenChange={(o) => { if (!o) { setDeleteCandidate(null); setDeleteBlock(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteBlock ? 'No se puede eliminar' : `¿Eliminar "${deleteCandidate?.nombre}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlock ?? 'Esta acción no se puede deshacer. El producto y su receta serán eliminados permanentemente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
            {!deleteBlock && (
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Eliminar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProductosTab;
