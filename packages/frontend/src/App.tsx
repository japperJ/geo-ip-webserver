import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { SitesPage } from '@/pages/SitesPage';
import { SiteEditorPage } from '@/pages/SiteEditorPage';
import { AccessLogsPage } from '@/pages/AccessLogsPage';
import { LoginPage } from '@/pages/LoginPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/sites" replace />} />
            <Route path="sites" element={<SitesPage />} />
            <Route path="sites/new" element={<SiteEditorPage />} />
            <Route path="sites/:id/edit" element={<SiteEditorPage />} />
            <Route path="logs" element={<AccessLogsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
