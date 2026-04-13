import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CategoriasTab from '@/components/inventarios/CategoriasTab';
import InsumosTab from '@/components/inventarios/InsumosTab';
import ProductosTab from '@/components/inventarios/ProductosTab';
import ComprasTab from '@/components/inventarios/ComprasTab';

import { useAuth } from '@/hooks/useAuth';

const InventariosPage = () => {
  const { roles } = useAuth();
  const isAdmin = roles.includes('administrador');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Inventarios</h1>
        <p className="text-muted-foreground mt-1">
          Gestión de insumos, productos y recetas de chocolatería
        </p>
      </div>

      <Tabs defaultValue="categorias">
        <TabsList>
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
          <TabsTrigger value="insumos">Insumos</TabsTrigger>
          <TabsTrigger value="productos">Productos & Recetas</TabsTrigger>
          {(isAdmin || roles.includes('supervisor')) && (
            <TabsTrigger value="compras">Compras</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="categorias" className="mt-4">
          <CategoriasTab isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="insumos" className="mt-4">
          <InsumosTab isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="productos" className="mt-4">
          <ProductosTab isAdmin={isAdmin} roles={roles} />
        </TabsContent>

        {(isAdmin || roles.includes('supervisor')) && (
          <TabsContent value="compras" className="mt-4">
            <ComprasTab isAdmin={isAdmin} />
          </TabsContent>
        )}

      </Tabs>
    </div>
  );
};

export default InventariosPage;
