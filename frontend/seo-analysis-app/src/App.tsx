import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './components/DashboardPage';
import { NewAnalysisPage } from './components/NewAnalysisPage';
import { AnalysisProgress } from './components/AnalysisProgress';
import { AnalysisReport } from './components/AnalysisReport';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/seo/analisis" replace />} />
        <Route path="seo/analisis" element={<DashboardPage />} />
        <Route path="seo/analisis/nuevo" element={<NewAnalysisPage />} />
        <Route path="seo/analisis/:analysisRequestId" element={<AnalysisProgress />} />
        <Route path="seo/analisis/:analysisRequestId/informe" element={<AnalysisReport />} />
        <Route path="*" element={<Navigate to="/seo/analisis" replace />} />
      </Route>
    </Routes>
  );
}
