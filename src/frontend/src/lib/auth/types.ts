/**
 * Auth domain types for IAW.
 *
 * Tokens are held in memory only — never persisted to localStorage or cookies
 * to avoid XSS-accessible PHI vectors. Each app reload requires re-auth.
 */

export interface AuthUser {
  /** Subject claim from the JWT. */
  sub: string;
  /** Display name. */
  name: string;
  /** Email address — do NOT log. */
  email: string;
  /** IAW roles assigned. */
  roles: IAWRole[];
}

export type IAWRole =
  | 'Accessioner'
  | 'AccessioningLead'
  | 'MedicalReviewer'
  | 'Admin';

export interface AuthState {
  /** Currently authenticated user, or null if unauthenticated. */
  user: AuthUser | null;
  /** In-memory JWT access token — never log. */
  accessToken: string | null;
  /** True while an auth operation is in flight. */
  isLoading: boolean;
  /** Human-readable error from the last failed auth operation. */
  error: string | null;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}
