import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, useTheme } from 'next-themes';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Landing from './pages/Landing.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import TechnicianDashboard from './pages/TechnicianDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import ManagerOverview from './pages/ManagerOverview.jsx';
import ManagerRequests from './pages/ManagerRequests.jsx';
import ManagerWorkload from './pages/ManagerWorkload.jsx';
import Calendar from './pages/Calendar.jsx';
import WorkCenter from './pages/WorkCenter.jsx';
import MachineTools from './pages/MachineTools.jsx';
import Requests from './pages/Requests.jsx';
import UserRequests from './pages/UserRequests.jsx';
import Teams from './pages/Teams.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import RoleRoute from './shared/RoleRoute.jsx';
import { getDefaultAppPath, getSessionUser } from './services/session';
import { applyTheme, resolveInitialTheme, THEME_STORAGE_KEY, transitionTheme } from './services/theme';
import './styles.css';
import './styles/tokens.css';
import './styles/manager-theme.css';
import './styles/auth-theme.css';
import './styles/theme-overrides.css';
import './styles/tailwind.css';

// Paint the stored theme onto <html> before React mounts, so the first frame is
// not the wrong colour. See services/theme.js for why every call in there is
// guarded: this runs at module scope, and a throw here costs the whole app.
const initialTheme = applyTheme(resolveInitialTheme());

const RoleBasedHome = () => {
  const user = getSessionUser();
  return <Navigate to={user ? getDefaultAppPath(user) : '/login'} replace />;
};

const RoleBasedRequests = () => getSessionUser()?.role === 'user' ? <UserRequests /> : <Requests />;

const PublicThemeToggle = () => {
  const location = useLocation();
  const { resolvedTheme: theme, setTheme } = useTheme();
  if (location.pathname.startsWith('/app')) return null;
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    transitionTheme(() => setTheme(next));
  };
  return <button type="button" className="public-theme-toggle" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>{theme === 'dark' ? 'Light' : 'Dark'}</button>;
};

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider attribute="data-theme" storageKey={THEME_STORAGE_KEY} defaultTheme={initialTheme} enableSystem={false}>
      <BrowserRouter>
        <PublicThemeToggle />
        <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/app" element={<RoleRoute><App /></RoleRoute>}>
          <Route index element={<RoleBasedHome />} />
          <Route path="home" element={<RoleRoute allowedRoles={['user']}><DashboardHome /></RoleRoute>} />
          <Route path="admin" element={<RoleRoute allowedRoles={['admin']}><AdminDashboard /></RoleRoute>} />
          <Route path="admin/users" element={<RoleRoute allowedRoles={['admin']}><AdminUsers /></RoleRoute>} />
          <Route path="manager/overview" element={<RoleRoute allowedRoles={['manager', 'admin']}><ManagerOverview /></RoleRoute>} />
          <Route path="manager/requests" element={<RoleRoute allowedRoles={['manager', 'admin']}><ManagerRequests /></RoleRoute>} />
          <Route path="manager/requests/:requestId" element={<RoleRoute allowedRoles={['manager', 'admin']}><ManagerRequests /></RoleRoute>} />
          <Route path="manager/schedule" element={<RoleRoute allowedRoles={['manager', 'admin']}><Calendar /></RoleRoute>} />
          <Route path="manager/workload" element={<RoleRoute allowedRoles={['manager', 'admin']}><ManagerWorkload /></RoleRoute>} />
          <Route path="technician" element={<RoleRoute allowedRoles={['technician']}><TechnicianDashboard /></RoleRoute>} />
          <Route path="calendar" element={<RoleRoute allowedRoles={['user', 'manager', 'technician', 'admin']}><Calendar /></RoleRoute>} />
          <Route path="equipment/work-center" element={<RoleRoute allowedRoles={['user', 'manager', 'technician', 'admin']}><WorkCenter /></RoleRoute>} />
          <Route path="equipment/machine-tools" element={<RoleRoute allowedRoles={['user', 'manager', 'technician', 'admin']}><MachineTools /></RoleRoute>} />
          <Route path="requests" element={<RoleRoute allowedRoles={['user', 'manager', 'technician', 'admin']}><RoleBasedRequests /></RoleRoute>} />
          <Route path="teams" element={<RoleRoute allowedRoles={['user', 'manager', 'technician', 'admin']}><Teams /></RoleRoute>} />
        </Route>

        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
