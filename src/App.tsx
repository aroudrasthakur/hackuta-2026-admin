import { Navigate, Route, Routes } from "react-router-dom";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import { AdminLayout } from "./layouts/AdminLayout";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { ApplicationReviewPage } from "./pages/admin/ApplicationReviewPage";
import { ApplicationsPage } from "./pages/admin/ApplicationsPage";
import { CheckInPage } from "./pages/admin/CheckInPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { ParticipantsPage } from "./pages/admin/ParticipantsPage";
import { ADMIN_ROUTES } from "./types/routes";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={ADMIN_ROUTES.dashboard} replace />} />
      <Route path={ADMIN_ROUTES.login} element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="applications/:applicationId" element={<ApplicationReviewPage />} />
        <Route path="participants" element={<ParticipantsPage />} />
        <Route path="check-in" element={<CheckInPage />} />
      </Route>
      <Route path="*" element={<Navigate to={ADMIN_ROUTES.dashboard} replace />} />
    </Routes>
  );
}
