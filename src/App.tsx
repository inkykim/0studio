import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RecentProjectsProvider } from "@/contexts/RecentProjectsContext";
import { ModelProvider } from "@/contexts/ModelContext";
import { VersionControlProvider } from "@/contexts/VersionControlContext";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Checkout from "./pages/Checkout";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RecentProjectsProvider>
        <HashRouter>
          <VersionControlProvider>
            <ModelProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </TooltipProvider>
            </ModelProvider>
          </VersionControlProvider>
        </HashRouter>
      </RecentProjectsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
