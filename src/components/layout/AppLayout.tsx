import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import {
  CandlestickChart,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Trophy,
  Wallet,
} from "lucide-react";

import { SubscriptionActions } from "../../features/subscription/components/SubscriptionActions";
import { NotificationCenter } from "../../features/notifications/components/NotificationCenter";
import { PwaControls } from "./PwaControls";
import { Logo } from '../common/Logo';

import { useAuth } from "../../features/auth/context/AuthContext";

const navigation = [
  {
    to: "/dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard,
  },
  {
    to: "/simulador",
    label: "Simulador",
    Icon: CandlestickChart,
  },
  {
    to: "/academia",
    label: "Academia",
    Icon: GraduationCap,
  },
  { to: "/ranking", label: "Ranking", Icon: Trophy },
] as const;

const formatUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AppLayout() {
  const { profile, signOut } = useAuth();

  const [signingOut, setSigningOut] = useState(false);

  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    setSignOutError(null);

    try {
      await signOut();
    } catch {
      setSignOutError("No se pudo cerrar sesión. Inténtalo de nuevo.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <Logo size="sm" />
            <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-zinc-400">
              BETA
            </span>
          </div>

          <nav
            aria-label="Navegación principal"
            className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-2 sm:w-auto"
          >
            {navigation.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400",
                    isActive
                      ? "bg-emerald-400/10 text-emerald-300"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                  ].join(" ")
                }
              >
                <Icon aria-hidden="true" className="size-4" />

                {label}
              </NavLink>
            ))}
          </nav>

          <div className="order-2 flex flex-wrap items-center gap-2 sm:order-3">
            <PwaControls />
            <NotificationCenter key={profile?.id} />
            <SubscriptionActions compact />
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2">
              <Wallet aria-hidden="true" className="size-5 text-emerald-400" />

              <div className="text-right leading-tight">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  Saldo ficticio · {profile?.role === "pro" ? "Pro" : "Free"}
                </p>

                <p className="text-sm font-semibold tabular-nums">
                  {formatUSD.format(Number(profile?.fictional_balance ?? 0))}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {signOutError && (
          <p
            role="alert"
            className="mx-auto max-w-7xl px-4 pb-3 text-sm text-red-300 sm:px-6 lg:px-8"
          >
            {signOutError}
          </p>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-zinc-500 sm:px-6 lg:px-8">
        BullVest es un simulador educativo. No se opera con dinero real.
      </footer>
    </div>
  );
}
