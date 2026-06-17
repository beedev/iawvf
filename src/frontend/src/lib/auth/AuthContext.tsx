import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type {
  AuthContextValue,
  AuthState,
  LoginCredentials,
} from './types';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: AuthState['user']; accessToken: string } }
  | { type: 'LOGIN_ERROR'; payload: { error: string } }
  | { type: 'LOGOUT' };

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isLoading: false,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true, error: null };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isLoading: false,
        error: null,
        user: action.payload.user,
        accessToken: action.payload.accessToken,
      };
    case 'LOGIN_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload.error,
        user: null,
        accessToken: null,
      };
    case 'LOGOUT':
      return initialState;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const login = useCallback(async (credentials: LoginCredentials) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Do NOT log the body — it contains credentials.
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Login failed (${response.status})`);
      }

      // Expected shape: { accessToken: string, user: AuthUser }
      const data = (await response.json()) as {
        accessToken: string;
        user: AuthState['user'];
      };

      if (!data.accessToken || !data.user) {
        throw new Error('Unexpected response from auth endpoint.');
      }

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user: data.user, accessToken: data.accessToken },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unknown error occurred.';
      dispatch({ type: 'LOGIN_ERROR', payload: { error: message } });
      throw err; // Re-throw so callers can react if needed.
    }
  }, []);

  const logout = useCallback(() => {
    dispatch({ type: 'LOGOUT' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}
