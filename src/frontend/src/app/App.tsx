import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeModeProvider } from './ThemeModeContext';
import { QueryProvider } from './QueryProvider';
import { AuthProvider, useAuth } from '../lib/auth';
import { canAdminVocabulary } from '../lib/vocabulary';
import { AppShell } from './AppShell';
import { LoginScreen } from './LoginScreen';
import { LoadingState, EmptyState } from '../components';

// Route-level code splitting: each feature loads on demand, keeping the initial bundle lean.
const AuthoringPage = lazy(() =>
  import('../features/authoring/AuthoringPage').then((m) => ({ default: m.AuthoringPage })),
);
const RulesPage = lazy(() =>
  import('../features/rules/RulesPage').then((m) => ({ default: m.RulesPage })),
);
const RuleDetailPage = lazy(() =>
  import('../features/rules/RuleDetailPage').then((m) => ({ default: m.RuleDetailPage })),
);
const EvaluatePage = lazy(() =>
  import('../features/evaluate/EvaluatePage').then((m) => ({ default: m.EvaluatePage })),
);
const VocabularyPage = lazy(() =>
  import('../features/vocabulary/VocabularyPage').then((m) => ({ default: m.VocabularyPage })),
);

/**
 * Guards an Admin-only route. A non-admin who navigates here directly (e.g. a bookmarked URL) sees a
 * calm access notice rather than the screen — defense in depth alongside the hidden nav item and the
 * API's own 403.
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  if (!canAdminVocabulary(session?.roles)) {
    return (
      <EmptyState
        title="Admin access required"
        description="The Vocabulary workspace is available to administrators. Switch to an account with the Admin role to manage the controlled vocabulary."
      />
    );
  }
  return <>{children}</>;
}

function AuthenticatedApp() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState label="Loading workspace…" />}>
        <Routes>
          <Route path="/authoring" element={<AuthoringPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/rules/:key" element={<RuleDetailPage />} />
          <Route path="/evaluate" element={<EvaluatePage />} />
          <Route
            path="/vocabulary"
            element={
              <AdminRoute>
                <VocabularyPage />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/authoring" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

function Gate() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AuthenticatedApp /> : <LoginScreen />;
}

export function App() {
  return (
    <ThemeModeProvider>
      <AuthProvider>
        <QueryProvider>
          <BrowserRouter>
            <Gate />
          </BrowserRouter>
        </QueryProvider>
      </AuthProvider>
    </ThemeModeProvider>
  );
}
