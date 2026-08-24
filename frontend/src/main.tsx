import '@/bootstrap/polyfills';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import '@/i18n';
import { applyServerDefaultLanguage } from '@/i18n';
import ProtectedRoute from '@/routes/ProtectedRoute';
import './index.css';
import App from './App.tsx';
import Home from '@/pages/Home';
import LoginPage from '@/pages/auth/Login';
import RegisterPage from '@/pages/auth/Register';
import LinglongRegisterPage from '@/pages/auth/LinglongRegisterPage';
import OSSDemo from '@/pages/OSSDemo';
import Admin from '@/pages/Admin';
import MyCredits from '@/pages/MyCredits';
import MembershipSubscribePage from '@/pages/MembershipSubscribePage';
import TermsOfService from '@/pages/legal/TermsOfService';
import PrivacyPolicy from '@/pages/legal/PrivacyPolicy';
import CommunityGuidelines from '@/pages/legal/CommunityGuidelines';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { refreshTeams } from '@/stores/teamStore';
import Workspace from '@/pages/Workspace';
import { initializeRuntimeStability } from '@/bootstrap/runtimeStability';
import { SHOW_ENTERPRISE_CONSOLE } from '@/config/featureFlags';
import EnterpriseLoginPage from '@/pages/enterprise/EnterpriseLoginPage';
import EnterpriseLayout from '@/pages/enterprise/EnterpriseLayout';
import EnterpriseDashboard from '@/pages/enterprise/EnterpriseDashboard';
import EnterpriseMembersPage from '@/pages/enterprise/EnterpriseMembersPage';
import EnterpriseAssetsPage from '@/pages/enterprise/EnterpriseAssetsPage';
import EnterpriseSettingsPage from '@/pages/enterprise/EnterpriseSettingsPage';
import EnterpriseJoinRequestsPage from '@/pages/enterprise/EnterpriseJoinRequestsPage';
import EnterpriseProjectsPage from '@/pages/enterprise/EnterpriseProjectsPage';

function RootRoutes() {
  const user = useAuthStore((s) => s.user);
  const loadProjects = useProjectStore((s) => s.load);
  // Lazy init is triggered by protected routes/login flow to avoid auto /api/auth/me on every load.
  useEffect(() => {
    if (!user) return;
    void refreshTeams()
      .catch(() => {})
      .finally(() => {
        void loadProjects();
      });
  }, [user, loadProjects]);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/register" element={<RegisterPage />} />
      <Route path="/auth/register/linglong" element={<LinglongRegisterPage />} />
      <Route path="/legal/terms" element={<TermsOfService />} />
      <Route path="/legal/privacy" element={<PrivacyPolicy />} />
      <Route path="/legal/community" element={<CommunityGuidelines />} />
      <Route path="/oss" element={<OSSDemo />} />
      {SHOW_ENTERPRISE_CONSOLE ? (
        <Route path="/enterprise" element={<EnterpriseLoginPage />} />
      ) : null}
      <Route element={<ProtectedRoute />}>
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/app" element={<App />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/my-credits" element={<MyCredits />} />
        <Route path="/membership" element={<MembershipSubscribePage />} />
        {SHOW_ENTERPRISE_CONSOLE ? (
          <Route path="/enterprise/:teamId" element={<EnterpriseLayout />}>
            <Route index element={<Navigate to="projects" replace />} />
            <Route path="overview" element={<EnterpriseDashboard />} />
            <Route path="projects" element={<EnterpriseProjectsPage />} />
            <Route path="members" element={<EnterpriseMembersPage />} />
            <Route path="requests" element={<EnterpriseJoinRequestsPage />} />
            <Route path="assets" element={<EnterpriseAssetsPage />} />
            <Route path="credits" element={<Navigate to=".." replace />} />
            <Route path="settings" element={<EnterpriseSettingsPage />} />
          </Route>
        ) : null}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

initializeRuntimeStability();
void applyServerDefaultLanguage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RootRoutes />
    </BrowserRouter>
  </StrictMode>,
);
