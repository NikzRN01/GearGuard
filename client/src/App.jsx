import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';


export default function App() {

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <NavLink to="/app">Home</NavLink>
        <NavLink to="/app/calendar">Maintenance Calendar</NavLink>
        <details className="sidebar-dropdown">
          <summary>Equipment</summary>
          <div className="sidebar-submenu">
            <NavLink to="/app/equipment/work-center">Work Center</NavLink>
            <NavLink to="/app/equipment/machine-tools">Machine & Tools</NavLink>
          </div>
        </details>
        <NavLink to="/app/requests">Requests</NavLink>
        <NavLink to="/app/teams">Teams</NavLink>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>

  );
}
