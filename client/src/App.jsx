import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';


export default function App() {
  const location = useLocation();
  const isEquipmentPage = location.pathname.startsWith('/app/equipment');
  
  // Get user from sessionStorage to determine if they're a technician
  const user = React.useMemo(() => {
    const userData = sessionStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  }, []);

  const isTechnician = user?.role === 'technician';

  return (
    <div className="app-layout">
      <div className="auth-backdrop">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>
      
      <aside className="app-sidebar">
        <div className="brand" style={{ marginTop: 4 }}>GearGuard</div>
        {isTechnician ? (
          <>
            <NavLink to="/app/technician" end>My Tasks</NavLink>
            <NavLink to="/app/requests">All Requests</NavLink>
            <NavLink to="/app/teams">Teams</NavLink>
          </>
        ) : (
          <>
            <NavLink to="/app" end>Home</NavLink>
            <NavLink to="/app/calendar">Maintenance Calendar</NavLink>
            <details className="sidebar-dropdown" open={isEquipmentPage}>
              <summary>
                <span>Equipment</span>
                <span className="sidebar-caret" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M7.25 4.75L12.5 10L7.25 15.25"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </summary>
              <div className="sidebar-submenu">
                <NavLink to="/app/equipment/work-center">Work Center</NavLink>
                <NavLink to="/app/equipment/machine-tools">Machine & Tools</NavLink>
              </div>
            </details>
            <NavLink to="/app/requests">Requests</NavLink>
            <NavLink to="/app/teams">Teams</NavLink>
          </>
        )}
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>

  );
}
