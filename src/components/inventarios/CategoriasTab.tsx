import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
}

interface Props {
  isAdmin: boolean;
}

const CategoriasTab = ({ isAdmin }: Props) => {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '' });
  const [saving, setSaving] = useState(false);

  const fetchCategorias = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('categorias_maestras')
      .select('id, nombre, descripcion')
      .order('nombre');
    setCategorias((data as Categoria[]) ?? []);
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
      const { error } = await supabase.from('categorias_maestras').update(payload).eq('id', editingId);
      if (error) {
        toast.error(error.message.includes('unique') ? 'Ya existe una categoría con ese nombre' : 'Error al actualizar');
      } else {
        toast.success('Categoría actualizada');
      }
    } else {
      const { error } = await supabase.from('categorias_maestras').insert(payload);
      if (error) {
        toast.error(error.message.includes('unique') ? 'Ya existe una categoría con ese nombre' : 'Error al crear');
      } else {
        toast.success('Categoría creada');
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchCategorias();
  };

  const handleDelete = async (cat: Categoria) => {
    if (!confirm(`¿Eliminar la categoría "${cat.nombre}"? Los insumos y productos que la usen quedarán con su texto actual.`)) return;
    const { error } = await supabase.from('categorias_maestras').delete().eq('id', cat.id);
    if (error) toast.error('Error al eliminar categoría');
    else { toast.success('Categoría eliminada'); fetchCategorias(); }
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Cargando...</TableCell>
                </TableRow>
              ) : categorias.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    Sin categorías registradas. Crea la primera.
                  </TableCell>
                </TableRow>
              ) : categorias.map(cat => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      {cat.nombre}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{cat.descripcion || '—'}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(cat)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
    </div>
  );
};

export default CategoriasTab;
