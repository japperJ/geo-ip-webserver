import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { SitesPage } from '@/pages/SitesPage';
import { AccessLogsPage } from '@/pages/AccessLogsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/sites" replace />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="logs" element={<AccessLogsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
