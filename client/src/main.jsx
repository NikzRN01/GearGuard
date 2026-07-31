import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import './styles.css';
import './styles/tokens.css';
import './styles/manager-theme.css';
import './styles/auth-theme.css';

const RoleBasedHome = () => {
  const user = getSessionUser();
  return <Navigate to={user ? getDefaultAppPath(user) : '/login'} replace />;
};

const RoleBasedRequests = () => getSessionUser()?.role === 'user' ? <UserRequests /> : <Requests />;

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
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
          <Route path="manager/overview" element={<RoleRoute allowedRoles={['manager']}><ManagerOverview /></RoleRoute>} />
          <Route path="manager/requests" element={<RoleRoute allowedRoles={['manager']}><ManagerRequests /></RoleRoute>} />
          <Route path="manager/requests/:requestId" element={<RoleRoute allowedRoles={['manager']}><ManagerRequests /></RoleRoute>} />
          <Route path="manager/schedule" element={<RoleRoute allowedRoles={['manager']}><Calendar /></RoleRoute>} />
          <Route path="manager/workload" element={<RoleRoute allowedRoles={['manager']}><ManagerWorkload /></RoleRoute>} />
          <Route path="technician" element={<RoleRoute allowedRoles={['technician']}><TechnicianDashboard /></RoleRoute>} />
          <Route path="calendar" element={<RoleRoute allowedRoles={['user', 'manager', 'technician']}><Calendar /></RoleRoute>} />
          <Route path="equipment/work-center" element={<RoleRoute allowedRoles={['user', 'manager', 'technician']}><WorkCenter /></RoleRoute>} />
          <Route path="equipment/machine-tools" element={<RoleRoute allowedRoles={['user', 'manager', 'technician']}><MachineTools /></RoleRoute>} />
          <Route path="requests" element={<RoleRoute allowedRoles={['user', 'manager', 'technician']}><RoleBasedRequests /></RoleRoute>} />
          <Route path="teams" element={<RoleRoute allowedRoles={['user', 'manager', 'technician']}><Teams /></RoleRoute>} />
        </Route>

      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
