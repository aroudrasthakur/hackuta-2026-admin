import { Route, Routes } from "react-router-dom";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import { AdminLayout } from "./layouts/AdminLayout";
import { ApplicationReviewPage } from "./pages/admin/ApplicationReviewPage";
import { ApplicationsPage } from "./pages/admin/ApplicationsPage";
import { DecisionEmailQueuePage } from "./pages/admin/DecisionEmailQueuePage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { ADMIN_ROUTES } from "./types/routes";
import { VolunteerDashboardPage } from "./pages/admin/VolunteerDashboardPage";
import { StaffWorkflowPage } from "./pages/admin/StaffWorkflowPage";
import { VolunteerScanPage } from "./pages/admin/VolunteerScanPage";
import { MealsPage } from "./pages/admin/MealsPage";

export default function App() {
  return (
    <Routes>
      <Route path={ADMIN_ROUTES.login} element={<AdminLoginPage />} />
      <Route path={ADMIN_ROUTES.volunteer} element={<AdminProtectedRoute />} />
      <Route
        path="/admin"
        element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }
      >
        <Route index element={<AdminProtectedRoute />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="decision-emails" element={<DecisionEmailQueuePage />} />
        <Route path="applications/:applicationId" element={<ApplicationReviewPage />} />
        <Route path="scan" element={<VolunteerDashboardPage />} />
        <Route path="scan/check-in" element={<VolunteerScanPage workflow="check-in" />} />
        <Route path="scan/food" element={<VolunteerScanPage workflow="food" />} />
        <Route path="scan/points" element={<VolunteerScanPage workflow="points" />} />
        <Route path="participants" element={<StaffWorkflowPage workflow="participants" />} />
        <Route path="volunteers" element={<StaffWorkflowPage workflow="volunteers" />} />
        <Route path="meals" element={<MealsPage />} />
      </Route>
      <Route path="*" element={<AdminProtectedRoute />} />
    </Routes>
  );
}
