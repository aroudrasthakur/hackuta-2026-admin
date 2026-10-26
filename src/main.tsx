import React from "react";
import ReactDOM from "react-dom/client";
import { AdminBrowserRouter } from "./lib/adminBrowserRouter";
import App from "./App";
import { AdminAuthProvider } from "./contexts/AdminAuthProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorState } from "./components/states/ErrorState";
import { isE2eMockEnabled } from "./constants/e2eMock";
import { configureE2eDecisionQueue, configureE2eMeals, dropNextE2eShopPurchaseResponse, resetE2eMockStore } from "../shared/admin/e2e/mockAdminStore.ts";
import { ConvexProvider } from "./convex/reactBindings";
import { convexClient } from "./lib/convexClient";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

const app = (
  <React.StrictMode>
    <ErrorBoundary>
      <AdminBrowserRouter>
        <App />
      </AdminBrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

if (isE2eMockEnabled() && typeof window !== "undefined") {
  (window as Window & { __resetE2eMock?: () => void }).__resetE2eMock = resetE2eMockStore;
  (window as Window & { __setE2eDecisionQueue?: typeof configureE2eDecisionQueue }).__setE2eDecisionQueue = configureE2eDecisionQueue;
  (window as Window & { __setE2eMeals?: typeof configureE2eMeals }).__setE2eMeals = configureE2eMeals;
  (window as Window & { __dropNextE2eShopPurchase?: () => void }).__dropNextE2eShopPurchase = dropNextE2eShopPurchaseResponse;
}

const convexReady = convexClient !== null || isE2eMockEnabled();

ReactDOM.createRoot(root).render(
  convexReady ? (
    <ConvexProvider client={convexClient!}>
      <AdminAuthProvider>{app}</AdminAuthProvider>
    </ConvexProvider>
  ) : (
    <ErrorState
      title="Convex not configured"
      message="Set VITE_CONVEX_URL in .env.local (see .env.example), then restart the dev server."
    />
  ),
);
