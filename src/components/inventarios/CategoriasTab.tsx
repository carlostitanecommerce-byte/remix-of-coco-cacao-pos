import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Tag, FlaskConical, Package } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  uso_insumos?: number;
  uso_productos?: number;
}

interface Props {
  isAdmin: boolean;
}

const CategoriasTab = ({ isAdmin }: Props) => {
  const { user } = useAuth();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Categoria | null>(null);

  const fetchCategorias = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('categorias_maestras')
      .select('id, nombre, descripcion')
      .order('nombre');
    const cats = (data as Categoria[]) ?? [];

    // Conteo de uso por categoría
    const [insumosRes, productosRes] = await Promise.all([
      supabase.from('insumos').select('categoria'),
      supabase.from('productos').select('categoria'),
    ]);
    const cuentaIns = new Map<string, number>();
    const cuentaProd = new Map<string, number>();
    (insumosRes.data ?? []).forEach((i: any) => cuentaIns.set(i.categoria, (cuentaIns.get(i.categoria) ?? 0) + 1));
    (productosRes.data ?? []).forEach((p: any) => cuentaProd.set(p.categoria, (cuentaProd.get(p.categoria) ?? 0) + 1));

    cats.forEach(c => {
      c.uso_insumos = cuentaIns.get(c.nombre) ?? 0;
      c.uso_productos = cuentaProd.get(c.nombre) ?? 0;
    });

    setCategorias(cats);
    setLoading(false);
  };

  useEffect(() => { fetchCategorias(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ nombre: '', descripcion: '' });
    setDialogOpen(true);
  };

  const openEdit = (cat: Categoria) => {
    setEditingId(cat.id);
    setForm({ nombre: cat.nombre, descripcion: cat.descripcion ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
    };

    if (editingId) {
      const prev = categorias.find(c => c.id === editingId);
      const { error } = await supabase.from('categorias_maestras').update(payload).eq('id', editingId);
      if (error) {
        toast.error(error.message.includes('unique') ? 'Ya existe una categoría con ese nombre' : 'Error al actualizar');
      } else {
        toast.success('Categoría actualizada');
        if (user) {
          await supabase.from('audit_logs').insert({
            user_id: user.id,
            accion: 'actualizar_categoria',
            descripcion: `Categoría actualizada: "${prev?.nombre ?? ''}" → "${payload.nombre}"`,
            metadata: { categoria_id: editingId, nombre_anterior: prev?.nombre, ...payload },
          });
        }
      }
    } else {
      const { data, error } = await supabase.from('categorias_maestras').insert(payload).select('id').single();
      if (error) {
        toast.error(error.message.includes('unique') ? 'Ya existe una categoría con ese nombre' : 'Error al crear');
      } else {
        toast.success('Categoría creada');
        if (user && data) {
          await supabase.from('audit_logs').insert({
            user_id: user.id,
            accion: 'crear_categoria',
            descripcion: `Categoría creada: ${payload.nombre}`,
            metadata: { categoria_id: data.id, ...payload },
          });
        }
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchCategorias();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('categorias_maestras').delete().eq('id', deleteTarget.id);
    if (error) {
      toast.error('Error al eliminar categoría');
    } else {
      toast.success('Categoría eliminada');
      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          accion: 'eliminar_categoria',
          descripcion: `Categoría eliminada: ${deleteTarget.nombre}`,
          metadata: {
            categoria_id: deleteTarget.id,
            nombre: deleteTarget.nombre,
            uso_insumos: deleteTarget.uso_insumos ?? 0,
            uso_productos: deleteTarget.uso_productos ?? 0,
          },
        });
      }
      fetchCategorias();
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-semibold text-foreground">Categorías Maestras</h2>
        {isAdmin && (
          <Button onClick={openNew} size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> Nueva Categoría
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <TooltipProvider delayDuration={150}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">En uso</TableHead>
                {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Cargando...</TableCell>
                </TableRow>
              ) : categorias.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Sin categorías registradas. Crea la primera.
                  </TableCell>
                </TableRow>
              ) : categorias.map(cat => {
                const usoTotal = (cat.uso_insumos ?? 0) + (cat.uso_productos ?? 0);
                return (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        {cat.nombre}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{cat.descripcion || '—'}</TableCell>
                    <TableCell className="text-right">
                      {usoTotal === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center justify-end gap-4 tabular-nums">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1.5 text-sm">
                                <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className={cn('font-medium text-foreground', (cat.uso_insumos ?? 0) === 0 && 'opacity-40')}>
                                  {cat.uso_insumos ?? 0}
                                </span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {(cat.uso_insumos ?? 0)} insumo{(cat.uso_insumos ?? 0) === 1 ? '' : 's'} en esta categoría
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1.5 text-sm">
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className={cn('font-medium text-foreground', (cat.uso_productos ?? 0) === 0 && 'opacity-40')}>
                                  {cat.uso_productos ?? 0}
                                </span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {(cat.uso_productos ?? 0)} producto{(cat.uso_productos ?? 0) === 1 ? '' : 's'} en esta categoría
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(cat)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </TooltipProvider>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input
                placeholder="ej. Café, Bebidas, Snacks..."
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Descripción (opcional)</Label>
              <Input
                placeholder="Descripción breve de la categoría"
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar categoría</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && ((deleteTarget.uso_insumos ?? 0) + (deleteTarget.uso_productos ?? 0)) > 0 ? (
                <>
                  La categoría <strong>"{deleteTarget.nombre}"</strong> está en uso por{' '}
                  {(deleteTarget.uso_insumos ?? 0) > 0 && `${deleteTarget.uso_insumos} insumo(s)`}
                  {(deleteTarget.uso_insumos ?? 0) > 0 && (deleteTarget.uso_productos ?? 0) > 0 && ' y '}
                  {(deleteTarget.uso_productos ?? 0) > 0 && `${deleteTarget.uso_productos} producto(s)`}.
                  Quedarán con el texto "{deleteTarget.nombre}" como categoría huérfana hasta reasignarse manualmente. ¿Continuar?
                </>
              ) : (
                <>¿Eliminar la categoría "{deleteTarget?.nombre}"? Esta acción no se puede deshacer.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CategoriasTab;
