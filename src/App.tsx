import { Navigate, Route, Routes } from "react-router-dom";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import { AdminLayout } from "./layouts/AdminLayout";
import { ApplicationReviewPage } from "./pages/admin/ApplicationReviewPage";
import { ApplicationsPage } from "./pages/admin/ApplicationsPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { ADMIN_ROUTES } from "./types/routes";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={ADMIN_ROUTES.applications} replace />} />
      <Route path={ADMIN_ROUTES.login} element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }
      >
        <Route index element={<Navigate to={ADMIN_ROUTES.applications} replace />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="applications/:applicationId" element={<ApplicationReviewPage />} />
      </Route>
      <Route path="*" element={<Navigate to={ADMIN_ROUTES.applications} replace />} />
    </Routes>
  );
}
