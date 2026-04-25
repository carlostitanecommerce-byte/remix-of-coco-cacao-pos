import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/components/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import PosPage from "@/pages/PosPage";
import UsersPage from "@/pages/UsersPage";
import ReportesPage from "@/pages/ReportesPage";
import CoworkingPage from "@/pages/CoworkingPage";
import InventariosPage from "@/pages/InventariosPage";
import CocinaPage from "@/pages/CocinaPage";
import NotFound from "./pages/NotFound";
import { isKitchenOnlyMode } from "@/lib/roles";

const queryClient = new QueryClient();

/** Redirects kitchen-only users to /cocina */
function HomeRedirect() {
  const { roles, loading } = useAuth();
  if (loading) return null;
  if (isKitchenOnlyMode(roles)) return <Navigate to="/cocina" replace />;
  return (
    <DashboardLayout>
      <DashboardPage />
    </DashboardLayout>
  );
}

/** Renders CocinaPage fullscreen for kitchen-only users, with sidebar for others */
function CocinaRoute() {
  const { roles, loading } = useAuth();
  if (loading) return null;
  if (isKitchenOnlyMode(roles)) return <CocinaPage />;
  return (
    <DashboardLayout>
      <CocinaPage />
    </DashboardLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomeRedirect />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pos"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <PosPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cocina"
              element={
                <ProtectedRoute allowedRoles={['administrador', 'barista']}>
                  <CocinaRoute />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coworking"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <CoworkingPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventarios"
              element={
                <ProtectedRoute allowedRoles={['administrador', 'supervisor']}>
                  <DashboardLayout>
                    <InventariosPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/usuarios"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <UsersPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reportes"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <ReportesPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
