import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { OverlayProvider } from "@/components/Sheet";
import { AiPage } from "@/pages/AiPage";
import { BudgetPage } from "@/pages/BudgetPage";
import { ChecklistPage } from "@/pages/ChecklistPage";
import { LoginPage } from "@/pages/LoginPage";
import { NearbyPage } from "@/pages/NearbyPage";
import { PlanPage } from "@/pages/PlanPage";
import { RequireAuth } from "@/pages/RequireAuth";
import { SharePage } from "@/pages/SharePage";
import { HomeRedirect, TripLayout } from "@/pages/TripLayout";

export function App() {
  return (
    <OverlayProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route element={<RequireAuth />}>
            <Route path="/trips" element={<HomeRedirect />} />
            <Route path="/trips/:id" element={<TripLayout />}>
              <Route index element={<Navigate to="plan" replace />} />
              <Route path="plan" element={<PlanPage />} />
              <Route path="nearby" element={<NearbyPage />} />
              <Route path="ai" element={<AiPage />} />
              <Route path="map" element={<Navigate to="../plan" replace />} />
              <Route path="checklist" element={<ChecklistPage />} />
              <Route path="budget" element={<BudgetPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/trips" replace />} />
        </Routes>
      </BrowserRouter>
    </OverlayProvider>
  );
}