import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Runner from "./pages/Runner";
import ArchitecturePage from "./pages/Architecture";
import Auth from "./pages/Auth";
import GoogleCallback from "./pages/GoogleCallback";
import VerifyEmail from "./pages/VerifyEmail";
import ResetPassword from "./pages/ResetPassword";
import Progress from "./pages/Progress";
import { InterviewAssistant } from "./components/InterviewAssistant";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { UpgradeModal } from "./components/UpgradeModal";
import { RateLimitWarning } from "./components/RateLimitWarning";
import { DemoGateModal } from "./components/DemoGateModal";
import { PwaInstallProvider } from "./context/PwaInstallContext";


import { useEffect } from "react";

const queryClient = new QueryClient();

/**
 * Redirects `/` and `/docs` requests to the static docs entrypoint.
 * In production, Firebase Hosting redirects `/` to `/docs` (docs/info opens first).
 * Locally, Vite serves the SPA for `/docs`, so we force-load the static docs HTML.
 */
const DocsRedirect = () => {
  useEffect(() => {
    // Locally, Vite serves the SPA for `/docs`, so force the browser to load the
    // static docs file from `public/docs/index.html`.
    if (window.location.pathname !== '/docs/index.html') {
      window.location.replace('/docs/index.html');
    }
  }, []);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <PwaInstallProvider>
        <Toaster />
        <UpgradeModal />
        <DemoGateModal />
        <RateLimitWarning onUpgradeClick={() => {
          // Trigger upgrade modal
          window.dispatchEvent(new CustomEvent('ratelimit:exceeded', {
            detail: {
              message: 'You are approaching your rate limit.',
              current_usage: 0,
              limit: 0,
              tier: 'free'
            }
          }));
        }} />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={
              <ProtectedRoute requireAuth={false}>
                <Auth />
              </ProtectedRoute>
            } />
            <Route path="/auth/google/callback" element={<GoogleCallback />} />
            <Route path="/auth/verify-email" element={<VerifyEmail />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<DocsRedirect />} />
            {/* Legacy alias for the landing page. */}
            <Route path="/landing" element={<Index />} />
            <Route path="/app" element={
              <InterviewAssistant />
            } />
            <Route path="/run" element={
              <ProtectedRoute>
                <Runner />
              </ProtectedRoute>
            } />
            <Route path="/architecture" element={
              <ProtectedRoute>
                <ArchitecturePage />
              </ProtectedRoute>
            } />
            <Route path="/progress" element={
              <ProtectedRoute>
                <Progress />
              </ProtectedRoute>
            } />
            <Route path="/docs/*" element={<DocsRedirect />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </PwaInstallProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
