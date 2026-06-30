import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/auth-store';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { LiveMapPage } from '@/pages/LiveMapPage';
import { FleetPage } from '@/pages/FleetPage';
import { RoutesPage } from '@/pages/RoutesPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { TripsPage } from '@/pages/TripsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center text-muted text-sm">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export function App() {
  const loadCurrentUser = useAuthStore((s) => s.loadCurrentUser);

  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<LiveMapPage />} />
          <Route path="fleet" element={<FleetPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="trips" element={<TripsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
