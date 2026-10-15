import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface SignUpResult {
  requiresEmailConfirmation: boolean;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;

  signIn: (email: string, password: string) => Promise<void>;

  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<SignUpResult>;

  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    profileError: null,
  });

  const isMountedRef = useRef(false);
  const currentUserRef = useRef<User | null>(null);
  const profileRequestRef = useRef(0);

  const loadProfile = useCallback(async (userId: string): Promise<void> => {
    profileRequestRef.current += 1;
    const requestId = profileRequestRef.current;

    setState((previous) => ({
      ...previous,
      loading: true,
      profileError: null,
    }));

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;

      // Ignorar respuestas obsoletas o de otro usuario.
      if (
        !isMountedRef.current ||
        profileRequestRef.current !== requestId ||
        currentUserRef.current?.id !== userId
      ) {
        return;
      }

      setState((previous) => ({
        ...previous,
        profile: data,
        loading: false,
        profileError: null,
      }));
    } catch {
      if (
        !isMountedRef.current ||
        profileRequestRef.current !== requestId ||
        currentUserRef.current?.id !== userId
      ) {
        return;
      }

      setState((previous) => ({
        ...previous,
        profile: null,
        loading: false,
        profileError: "No se pudo cargar tu perfil. Inténtalo de nuevo.",
      }));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMountedRef.current) return;

      const nextUser = session?.user ?? null;
      const previousUserId = currentUserRef.current?.id;

      currentUserRef.current = nextUser;

      if (!nextUser) {
        profileRequestRef.current += 1;

        setState({
          user: null,
          profile: null,
          loading: false,
          profileError: null,
        });

        return;
      }

      // Refrescar el token no requiere releer el perfil.
      if (event === "TOKEN_REFRESHED" && previousUserId === nextUser.id) {
        setState((previous) => ({
          ...previous,
          user: nextUser,
        }));

        return;
      }

      setState((previous) => ({
        user: nextUser,
        profile: previousUserId === nextUser.id ? previous.profile : null,
        loading: true,
        profileError: null,
      }));

      // Evitar consultas asíncronas dentro del callback.
      queueMicrotask(() => {
        if (
          isMountedRef.current &&
          currentUserRef.current?.id === nextUser.id
        ) {
          void loadProfile(nextUser.id);
        }
      });
    });

    return () => {
      isMountedRef.current = false;
      profileRequestRef.current += 1;
      currentUserRef.current = null;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) throw error;
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
    ): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            display_name: displayName.trim(),
          },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) throw error;

      return {
        requiresEmailConfirmation: data.session === null,
      };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = currentUserRef.current?.id;

    if (userId) {
      await loadProfile(userId);
    }
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [state, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de AuthProvider");
  }

  return context;
}
