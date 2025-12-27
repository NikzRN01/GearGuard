import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import Calendar from './pages/Calendar.jsx';
import WorkCenter from './pages/WorkCenter.jsx';
import MachineTools from './pages/MachineTools.jsx';
import Requests from './pages/Requests.jsx';
import Teams from './pages/Teams.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import './styles.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/app" element={<App />}>
          <Route index element={<DashboardHome />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="equipment/work-center" element={<WorkCenter />} />
          <Route path="equipment/machine-tools" element={<MachineTools />} />
          <Route path="requests" element={<Requests />} />
          <Route path="teams" element={<Teams />} />
        </Route>

      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
