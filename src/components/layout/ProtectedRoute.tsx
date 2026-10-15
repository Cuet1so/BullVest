import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { useAuth } from "../../features/auth/context/AuthContext";

export function ProtectedRoute() {
  const { user, profile, loading, profileError, refreshProfile } = useAuth();

  const location = useLocation();

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-200"
      >
        <LoaderCircle
          className="mr-3 size-6 animate-spin text-emerald-400"
          aria-hidden="true"
        />
        <span>Cargando tu sesión…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100">
        <div
          role="alert"
          className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-7 text-center"
        >
          <h1 className="text-xl font-semibold">Perfil no disponible</h1>

          <p className="text-sm text-zinc-400">
            {profileError ?? "Estamos preparando tu perfil."}
          </p>

          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
