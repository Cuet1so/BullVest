import { useState } from "react";
import type { FormEvent } from "react";
import { AuthError } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { Logo } from '../../../components/common/Logo';

import { GoogleSignInButton } from "../components/GoogleSignInButton";

import { useAuth } from "../context/AuthContext";

function getRegistrationErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return "Este correo ya está registrado. Prueba a iniciar sesión.";
    }

    if (error.code === "weak_password") {
      return "La contraseña no cumple los requisitos de seguridad.";
    }

    if (
      error.code === "over_email_send_rate_limit" ||
      error.code === "over_request_rate_limit"
    ) {
      return "Has realizado demasiados intentos. Inténtalo más tarde.";
    }

    if (error.code === "signup_disabled") {
      return "El registro de nuevos usuarios está deshabilitado temporalmente.";
    }
  }

  return "No se pudo crear la cuenta. Comprueba los datos e inténtalo de nuevo.";
}

export function RegisterPage() {
  const { signUp, signInWithGoogle } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);

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

    const name = displayName.trim();

    if (name.length < 1 || name.length > 80) {
      setErrorMessage("El nombre debe tener entre 1 y 80 caracteres.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Utiliza una contraseña de al menos 8 caracteres.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await signUp(email, password, name);

      setConfirmationPending(result.requiresEmailConfirmation);

      // Si no se requiere confirmación, App.tsx
      // redirigirá cuando se reciba SIGNED_IN.
    } catch (error: unknown) {
      setErrorMessage(getRegistrationErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center"><Logo size="lg" /></div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-7 shadow-2xl shadow-black/30 sm:p-9">
          <h1 className="text-2xl font-semibold tracking-tight">
            Crear cuenta gratis
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Empieza con 10.000 $ ficticios y tres vidas.
          </p>

          {!confirmationPending && <GoogleSignInButton disabled={submitting || googleLoading} loading={googleLoading} onClick={() => void handleGoogle()} />}

          {confirmationPending ? (
            <div
              role="status"
              className="mt-8 space-y-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-sm text-emerald-100"
            >
              <h2 className="font-semibold">Comprueba tu correo</h2>

              <p>
                Si la dirección puede registrarse, recibirás un enlace para
                confirmar tu cuenta. Revisa también la carpeta de spam.
              </p>

              <Link
                to="/login"
                className="inline-block font-semibold text-emerald-300 underline underline-offset-4"
              >
                Ir al inicio de sesión
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(event) => void handleSubmit(event)}
              className="mt-8 space-y-5"
            >
              <div>
                <label
                  htmlFor="register-name"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Nombre visible
                </label>

                <input
                  id="register-name"
                  type="text"
                  autoComplete="nickname"
                  required
                  minLength={1}
                  maxLength={80}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Tu nombre"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="register-email"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Correo electrónico
                </label>

                <input
                  id="register-email"
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
                  htmlFor="register-password"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Contraseña
                </label>

                <input
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 8 caracteres"
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
                {submitting ? "Creando cuenta…" : "Crear mi cuenta"}
              </button>
            </form>
          )}
        </section>

        <p className="mt-6 text-center text-sm text-zinc-400">
          ¿Ya tienes cuenta?{" "}
          <Link
            to="/login"
            className="font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Iniciar sesión
          </Link>
        </p>

        <p className="mt-8 text-center text-xs text-zinc-500">
          Simulación educativa. No se invierte dinero real.
        </p>
      </div>
    </main>
  );
}
