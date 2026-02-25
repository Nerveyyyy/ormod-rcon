/**
 * AuthContext.tsx
 *
 * Wraps the app in an auth gate:
 *   1. Checks GET /api/setup — if no users exist, redirect to /setup.
 *   2. Checks current BetterAuth session — if no session, redirect to /login.
 *   3. Provides { user, role, signOut } to all children.
 *
 * The session is fetched once on mount; BetterAuth's HTTP-only cookie handles
 * automatic renewal — no polling needed.
 */

import {
  createContext, useContext, useState, useEffect, type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router';
import { authClient } from '../lib/auth-client.js';
import { clearCsrfToken } from '../api/client.js';

type AuthUser = {
  id:    string;
  name:  string;
  email: string;
  role:  string;  // OWNER | ADMIN | VIEWER
};

type AuthContextValue = {
  user:    AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user:    null,
  loading: true,
  signOut: async () => {},
});

// Public paths that don't require auth — auth guard skips these
const PUBLIC_PATHS = ['/login', '/setup'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate   = useNavigate();
  const location   = useLocation();
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Don't run auth check on public pages
    if (PUBLIC_PATHS.includes(location.pathname)) {
      setLoading(false);
      return;
    }

    async function checkAuth() {
      try {
        // 1. Check if first-run setup is needed
        const setupRes = await fetch('/api/setup');
        const setupData = await setupRes.json().catch(() => ({}));
        if (setupData?.setupRequired) {
          navigate('/setup', { replace: true });
          return;
        }

        // 2. Check current session
        const { data: session } = await authClient.getSession();
        if (!session?.user) {
          navigate('/login', { replace: true });
          return;
        }

        setUser({
          id:    session.user.id,
          name:  session.user.name,
          email: session.user.email,
          role:  (session.user as any).role ?? 'VIEWER',
        });
      } catch {
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [location.pathname]);

  const signOut = async () => {
    await authClient.signOut();
    clearCsrfToken();
    setUser(null);
    navigate('/login', { replace: true });
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
