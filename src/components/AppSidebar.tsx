import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import {
  ShoppingCart,
  Building2,
  Package,
  Users,
  BarChart3,
  LogOut,
  Coffee,
  ChefHat,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const allMenuItems = [
  { title: 'POS', url: '/pos', icon: ShoppingCart, allowedRoles: ['administrador', 'supervisor', 'caja', 'recepcion'] },
  { title: 'Cocina', url: '/cocina', icon: ChefHat, allowedRoles: ['administrador', 'barista'] },
  { title: 'Coworking', url: '/coworking', icon: Building2, allowedRoles: ['administrador', 'supervisor', 'caja', 'recepcion'] },
  { title: 'Inventarios', url: '/inventarios', icon: Package, allowedRoles: ['administrador', 'supervisor'] },
  { title: 'Usuarios', url: '/usuarios', icon: Users, allowedRoles: ['administrador'] },
  { title: 'Reportes', url: '/reportes', icon: BarChart3, allowedRoles: ['administrador', 'supervisor'] },
];

export function AppSidebar() {
  const { profile, roles, signOut } = useAuth();

  const rolLabel = roles.length > 0
    ? roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')
    : 'Sin rol asignado';

  return (
    <Sidebar className="border-r-0">
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <Coffee className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">
              Coco & Cacao
            </p>
            <p className="text-xs text-sidebar-foreground/60">Kúuchil Meyaj</p>
          </div>
        </div>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            Menú principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {allMenuItems
                .filter((item) => !item.allowedRoles || item.allowedRoles.some(r => roles.includes(r)))
                .map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="mr-3 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {profile?.nombre || 'Usuario'}
            </p>
            <p className="text-xs text-sidebar-foreground/60">{rolLabel}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
