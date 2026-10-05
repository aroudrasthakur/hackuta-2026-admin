import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider } from "convex/react";
import App from "./App";
import { AdminAuthProvider } from "./contexts/AdminAuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorState } from "./components/states/ErrorState";
import { convexClient } from "./lib/convexClient";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

const app = (
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

ReactDOM.createRoot(root).render(
  convexClient ? (
    <ConvexProvider client={convexClient}>
      <AdminAuthProvider>{app}</AdminAuthProvider>
    </ConvexProvider>
  ) : (
    <ErrorState
      title="Convex not configured"
      message="Set VITE_CONVEX_URL in .env.local (see .env.example), then restart the dev server."
    />
  ),
);
