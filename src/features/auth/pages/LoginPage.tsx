import { useState } from "react";
import type { FormEvent } from "react";
import { AuthError } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { LoaderCircle, TrendingUp } from "lucide-react";

import { GoogleSignInButton } from "../components/GoogleSignInButton";

import { useAuth } from "../context/AuthContext";

function getLoginErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.code === "invalid_credentials") {
      return "Correo o contraseña incorrectos.";
    }

    if (error.code === "email_not_confirmed") {
      return "Confirma tu correo electrónico antes de iniciar sesión.";
    }

    if (error.code === "over_request_rate_limit") {
      return "Demasiados intentos. Vuelve a intentarlo más tarde.";
    }
  }

  return "No se pudo iniciar sesión. Inténtalo de nuevo.";
}

export function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogle = async () => {
    if (submitting || googleLoading) return;
    setGoogleLoading(true);
    setErrorMessage(null);
    try { await signInWithGoogle(); }
    catch { setErrorMessage("No se pudo iniciar sesión con Google. Inténtalo de nuevo."); setGoogleLoading(false); }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitting || googleLoading) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await signIn(email, password);
      // App.tsx redirige cuando el perfil está cargado.
    } catch (error: unknown) {
      setErrorMessage(getLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="w-full max-w-md">
        <Link
          to="/login"
          className="mb-10 flex items-center justify-center gap-3 text-2xl font-bold tracking-tight"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950">
            <TrendingUp className="size-6" aria-hidden="true" />
          </span>
          BullVest
        </Link>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-7 shadow-2xl shadow-black/30 sm:p-9">
          <h1 className="text-2xl font-semibold tracking-tight">
            Iniciar sesión
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Accede a tu cartera de inversión ficticia.
          </p>

          <GoogleSignInButton disabled={submitting || googleLoading} loading={googleLoading} onClick={() => void handleGoogle()} />

          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="mt-8 space-y-5"
          >
            <div>
              <label
                htmlFor="login-email"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Correo electrónico
              </label>

              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Contraseña
              </label>

              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tu contraseña"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
              >
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || googleLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              {submitting && (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {submitting ? "Iniciando sesión…" : "Entrar en BullVest"}
            </button>
          </form>
        </section>

        <p className="mt-6 text-center text-sm text-zinc-400">
          ¿Aún no tienes cuenta?{" "}
          <Link
            to="/register"
            className="font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Crear cuenta gratis
          </Link>
        </p>

        <p className="mt-8 text-center text-xs text-zinc-500">
          Simulación educativa. No se invierte dinero real.
        </p>
      </div>
    </main>
  );
}
