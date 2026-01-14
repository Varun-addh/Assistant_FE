import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { EvaluationOverlayHost } from "./overlayHost";
import { AuthProvider } from "./context/AuthContext";
import { setupAuthListener } from "./lib/authHelpers";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Setup global auth listener for logout events
setupAuthListener();

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <ErrorBoundary>
      <App />
      <EvaluationOverlayHost />
    </ErrorBoundary>
  </AuthProvider>
);

// Register service worker for PWA installability and offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Avoid service worker in dev to prevent stale caches and noisy fetch failures.
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => { });
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => { });
  });
}
