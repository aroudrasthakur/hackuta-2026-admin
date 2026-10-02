import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
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
    <ConvexAuthProvider client={convexClient}>{app}</ConvexAuthProvider>
  ) : (
    <ErrorState
      title="Convex not configured"
      message="Set VITE_CONVEX_URL in .env.local (see .env.example), then restart the dev server."
    />
  ),
);
