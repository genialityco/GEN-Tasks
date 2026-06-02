'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import type { AuthenticatedUser } from '@gen-task/shared';
import { firebaseAuth } from '../firebase/client';
import { apiClient } from '../api/client';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  /** Perfil + membresias resueltos por el backend (GET /auth/me). */
  profile: AuthenticatedUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Provee el estado de autenticacion a toda la app. Escucha los cambios de
 * sesion de Firebase y, cuando hay usuario, carga su contexto desde la API.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const me = await apiClient.get<AuthenticatedUser>('/auth/me');
          setProfile(me);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      loading,
      login: async (email, password) => {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      },
      logout: async () => {
        await signOut(firebaseAuth);
      },
    }),
    [firebaseUser, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
