import { SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';

const SidebarBackdrop = () => {
  const { open, setOpen, isMobile } = useSidebar();
  if (isMobile || !open) return null;
  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-30 hidden bg-black/30 backdrop-blur-[1px] md:block animate-in fade-in"
      aria-hidden="true"
    />
  );
};

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarBackdrop />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-4 bg-card">
            <SidebarTrigger />
          </header>
          <div className="flex-1 p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
