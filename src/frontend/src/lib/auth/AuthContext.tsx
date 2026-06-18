import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { configureApi, ApiError } from '../api';
import { api } from '../api';
import type { VdfRole } from '../types/api';

/**
 * In-memory authentication state. The JWT is held in a React ref (never localStorage / cookies, never
 * logged) so it is unreachable from persisted XSS vectors and is naturally cleared on reload.
 */

export interface AuthSession {
  username: string;
  roles: VdfRole[];
  expiresAt: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Set when a 401 occurred or login failed; surfaced to the login screen. */
  error: string | null;
  /** Authenticate a dev user. The role switcher calls this with a different username. */
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (role: VdfRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const tokenRef = useRef<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    tokenRef.current = null;
    setSession(null);
  }, []);

  // Wire the API client to read the in-memory token and react to 401s exactly once.
  useEffect(() => {
    configureApi({
      getToken: () => tokenRef.current,
      onUnauthorized: () => {
        clear();
        setError('Your session expired. Please sign in again.');
      },
    });
  }, [clear]);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.login({ username, password });
      tokenRef.current = res.token; // memory only
      setSession({ username, roles: res.roles, expiresAt: res.expiresAt });
    } catch (err) {
      tokenRef.current = null;
      setSession(null);
      const message =
        err instanceof ApiError
          ? err.status === 401
            ? 'Invalid credentials. Check the username and password.'
            : err.message
          : 'Sign-in failed unexpectedly.';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clear();
    setError(null);
  }, [clear]);

  const hasRole = useCallback((role: VdfRole) => session?.roles.includes(role) ?? false, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      isLoading,
      error,
      login,
      logout,
      hasRole,
    }),
    [session, isLoading, error, login, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
