import { Route, Routes } from "react-router-dom";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import { AdminLayout } from "./layouts/AdminLayout";
import { ApplicationReviewPage } from "./pages/admin/ApplicationReviewPage";
import { ApplicationsPage } from "./pages/admin/ApplicationsPage";
import { DecisionEmailQueuePage } from "./pages/admin/DecisionEmailQueuePage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { ADMIN_ROUTES } from "./types/routes";
import { VolunteerDashboardPage } from "./pages/admin/VolunteerDashboardPage";
import { ParticipantsPage } from "./pages/admin/ParticipantsPage";
import { VolunteerScanPage } from "./pages/admin/VolunteerScanPage";
import { VolunteersPage } from "./pages/admin/VolunteersPage";
import { VolunteerDetailPage } from "./pages/admin/VolunteerDetailPage";
import { EventsPage } from "./pages/admin/EventsPage";
import { MealsPage } from "./pages/admin/MealsPage";
import { ShopPage } from "./pages/admin/ShopPage";
import { VolunteerShopPage } from "./pages/admin/VolunteerShopPage";

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
        <Route path="scan/shop" element={<VolunteerShopPage />} />
        <Route path="participants" element={<ParticipantsPage />} />
        <Route path="volunteers" element={<VolunteersPage />} />
        <Route path="volunteers/:volunteerAdminId" element={<VolunteerDetailPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="meals" element={<MealsPage />} />
        <Route path="shop" element={<ShopPage />} />
      </Route>
      <Route path="*" element={<AdminProtectedRoute />} />
    </Routes>
  );
}
