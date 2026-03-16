import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { AppProvider } from "./contexts/AppContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Install from "./pages/Install";
import Queue from "./pages/Queue";
import Conversations from "./pages/Conversations";
import InternalChat from "./pages/InternalChat";
import History from "./pages/History";
import QuickMessages from "./pages/QuickMessages";
import Ranking from "./pages/Ranking";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminDepartments from "./pages/admin/AdminDepartments";
import AdminIntegrations from "./pages/admin/AdminIntegrations";
import AdminConversationLogs from "./pages/admin/AdminConversationLogs";
import AdminRobos from "./pages/admin/AdminRobos";
import AdminReports from "./pages/admin/AdminReports";
import AdminRankingConfig from "./pages/admin/AdminRankingConfig";
import AdminStorage from "./pages/admin/AdminStorage";
import AdminAIIntegrations from "./pages/admin/AdminAIIntegrations";
import AdminDeletionLogs from "./pages/admin/AdminDeletionLogs";
import SDRDashboardPage from "./pages/sdr/SDRDashboardPage";
import SDRPipelinePage from "./pages/sdr/SDRPipelinePage";
import SDRContactsPage from "./pages/sdr/SDRContactsPage";
import SDRSchedulingPage from "./pages/sdr/SDRSchedulingPage";
import GoogleCallbackPage from "./pages/sdr/GoogleCallbackPage";
import { SDRRoute } from "./components/sdr/SDRRoute";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import FranqueadoPanel from "./pages/FranqueadoPanel";
import { SuporteAnnouncementProvider } from "./components/chat/ChannelAnnouncementOverlay";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark">
      <SettingsProvider>
        <AuthProvider>
          <AppProvider>
            <SuporteAnnouncementProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/login" element={<Login />} />
                <Route path="/install" element={<Install />} />
                
                {/* Protected routes */}
                <Route path="/" element={<Navigate to="/fila" replace />} />
                <Route path="/fila" element={
                  <ProtectedRoute>
                    <Queue />
                  </ProtectedRoute>
                } />
                <Route path="/conversas" element={
                  <ProtectedRoute>
                    <Conversations />
                  </ProtectedRoute>
                } />
                <Route path="/interno" element={
                  <ProtectedRoute>
                    <InternalChat />
                  </ProtectedRoute>
                } />
                <Route path="/historico" element={
                  <ProtectedRoute>
                    <History />
                  </ProtectedRoute>
                } />
                <Route path="/mensagens-rapidas" element={
                  <ProtectedRoute>
                    <QuickMessages />
                  </ProtectedRoute>
                } />
                <Route path="/ranking" element={
                  <ProtectedRoute>
                    <Ranking />
                  </ProtectedRoute>
                } />
                <Route path="/contatos" element={
                  <ProtectedRoute>
                    <SDRContactsPage />
                  </ProtectedRoute>
                } />
                <Route path="/configuracoes" element={
                  <ProtectedRoute>
                    <Queue />
                  </ProtectedRoute>
                } />

                {/* SDR Routes */}
                <Route path="/comercial" element={
                  <SDRRoute>
                    <SDRDashboardPage />
                  </SDRRoute>
                } />
                <Route path="/comercial/pipeline" element={
                  <SDRRoute>
                    <SDRPipelinePage />
                  </SDRRoute>
                } />
                <Route path="/comercial/contatos" element={<Navigate to="/contatos" replace />} />
                <Route path="/comercial/google-callback" element={
                  <ProtectedRoute>
                    <GoogleCallbackPage />
                  </ProtectedRoute>
                } />
                <Route path="/comercial/agenda" element={
                  <SDRRoute>
                    <SDRSchedulingPage />
                  </SDRRoute>
                } />
                
                {/* Admin routes */}
                <Route path="/admin" element={
                  <ProtectedRoute requireAdmin>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin/conversas" element={
                  <ProtectedRoute requireAdmin>
                    <Conversations />
                  </ProtectedRoute>
                } />
                <Route path="/admin/usuarios" element={
                  <ProtectedRoute requireAdmin>
                    <AdminUsers />
                  </ProtectedRoute>
                } />
                <Route path="/admin/departamentos" element={
                  <ProtectedRoute requireAdmin>
                    <AdminDepartments />
                  </ProtectedRoute>
                } />
                <Route path="/admin/permissoes" element={
                  <ProtectedRoute requireAdmin>
                    <AdminUsers />
                  </ProtectedRoute>
                } />
                <Route path="/admin/robos" element={
                  <ProtectedRoute requireAdmin>
                    <AdminRobos />
                  </ProtectedRoute>
                } />
                <Route path="/admin/whatsapp" element={
                  <ProtectedRoute requireAdmin>
                    <AdminIntegrations />
                  </ProtectedRoute>
                } />
                <Route path="/admin/logs" element={
                  <ProtectedRoute requireAdmin>
                    <AdminConversationLogs />
                  </ProtectedRoute>
                } />
                <Route path="/admin/relatorios" element={
                  <ProtectedRoute requireAdmin>
                    <AdminReports />
                  </ProtectedRoute>
                } />
                <Route path="/admin/ranking-config" element={
                  <ProtectedRoute requireAdmin>
                    <AdminRankingConfig />
                  </ProtectedRoute>
                } />
                <Route path="/admin/armazenamento" element={
                  <ProtectedRoute requireAdmin>
                    <AdminStorage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/ias" element={
                  <ProtectedRoute requireAdmin>
                    <AdminAIIntegrations />
                  </ProtectedRoute>
                } />
                <Route path="/admin/exclusoes" element={
                  <ProtectedRoute requireAdmin>
                    <AdminDeletionLogs />
                  </ProtectedRoute>
                } />
                <Route path="/admin/configuracoes" element={
                  <ProtectedRoute requireAdmin>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                
                {/* Franqueado route */}
                <Route path="/franqueado" element={
                  <ProtectedRoute>
                    <FranqueadoPanel />
                  </ProtectedRoute>
                } />
                
                <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
            </SuporteAnnouncementProvider>
          </AppProvider>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
