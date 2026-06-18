import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeModeProvider } from './ThemeModeContext';
import { QueryProvider } from './QueryProvider';
import { AuthProvider, useAuth } from '../lib/auth';
import { AppShell } from './AppShell';
import { LoginScreen } from './LoginScreen';
import { LoadingState } from '../components';

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

function AuthenticatedApp() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState label="Loading workspace…" />}>
        <Routes>
          <Route path="/authoring" element={<AuthoringPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/rules/:key" element={<RuleDetailPage />} />
          <Route path="/evaluate" element={<EvaluatePage />} />
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
