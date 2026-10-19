import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Button, ErrorPanel, Spinner } from './components/ui';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const PracticePage = lazy(() =>
  import('./pages/PracticePage').then((m) => ({ default: m.PracticePage })),
);
const SessionPage = lazy(() =>
  import('./pages/SessionPage').then((m) => ({ default: m.SessionPage })),
);
const ReviewPage = lazy(() =>
  import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })),
);

function NotFound() {
  const navigate = useNavigate();
  return (
    <ErrorPanel
      title="Page not found"
      message="That page doesn't exist."
      action={<Button onClick={() => navigate('/')}>Go to dashboard</Button>}
    />
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner label="Loading" />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="practice" element={<PracticePage />} />
            <Route path="practice/:id" element={<SessionPage />} />
            <Route path="sessions/:id" element={<ReviewPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
