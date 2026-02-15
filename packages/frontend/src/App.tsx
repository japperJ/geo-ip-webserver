import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { SitesPage } from '@/pages/SitesPage';
import { SiteEditorPage } from '@/pages/SiteEditorPage';
import { SiteContentPage } from '@/pages/SiteContentPage';
import { AccessLogsPage } from '@/pages/AccessLogsPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { UsersPage } from '@/pages/UsersPage';
import { SiteUsersPage } from '@/pages/SiteUsersPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/sites" replace />} />
            <Route path="sites" element={<SitesPage />} />
            <Route path="sites/new" element={<SiteEditorPage />} />
            <Route path="sites/:id/edit" element={<SiteEditorPage />} />
            <Route path="sites/:id/content" element={<SiteContentPage />} />
            <Route path="sites/:id/users" element={<SiteUsersPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="logs" element={<AccessLogsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
