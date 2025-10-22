import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { EvaluationOverlayHost } from "./overlayHost";

createRoot(document.getElementById("root")!).render(<>
  <App />
  <EvaluationOverlayHost />
</>);

// Register service worker for PWA installability and offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
