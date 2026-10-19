import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from "react-router-dom";

import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";

import { AuthProvider, useAuth } from "./features/auth/context/AuthContext";

import { LoginPage } from "./features/auth/pages/LoginPage";
import { RegisterPage } from "./features/auth/pages/RegisterPage";

import { DashboardPage } from "./features/dashboard/pages/DashboardPage";
import { SimulatorPage } from "./features/trading/pages/SimulatorPage";
import { AcademyPage } from "./features/academy/pages/AcademyPage";
import { RankingPage } from "./features/ranking/pages/RankingPage";

import { CheckoutSuccessPage } from "./features/subscription/pages/CheckoutSuccessPage";
import { LandingPage } from "./features/landing/LandingPage";

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div role="status" className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">Comprobando sesión…</div>;
  return user ? <Navigate to="/dashboard" replace /> : <LandingPage />;
}

function LoginRoute() {
  const [params] = useSearchParams();
  return params.get('mode') === 'signup' ? <RegisterPage /> : <LoginPage />;
}

function GuestOnlyRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300"
      >
        Comprobando sesión…
      </div>
    );
  }

  if (user) {
    const rawFrom: unknown = (location.state as { from?: unknown } | null)
      ?.from;

    const destination =
      typeof rawFrom === "string" &&
      rawFrom.startsWith("/") &&
      !rawFrom.startsWith("//") &&
      !rawFrom.startsWith("/login") &&
      !rawFrom.startsWith("/register")
        ? rawFrom
        : "/dashboard";

    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        {/* Rutas públicas */}
        <Route element={<GuestOnlyRoute />}>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Rutas que requieren una sesión */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>

            <Route path="/checkout/success" element={<CheckoutSuccessPage />} />

            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/simulador" element={<SimulatorPage />} />
            <Route path="/simulator" element={<Navigate to="/simulador" replace />} />

            <Route path="/academia" element={<AcademyPage />} />
            <Route path="/academy" element={<Navigate to="/academia" replace />} />
            <Route path="/ranking" element={<RankingPage />} />
          </Route>
        </Route>

        {/* Ruta de respaldo */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
