import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getSessionUser } from './services/session';


export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isManagerMenuOpen, setIsManagerMenuOpen] = React.useState(false);
  const managerMenuButtonRef = React.useRef(null);
  const managerSidebarRef = React.useRef(null);
  const isEquipmentPage = location.pathname.startsWith('/app/equipment');
  
  const user = React.useMemo(() => getSessionUser(), []);

  const isTechnician = user?.role === 'technician';
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';

  const handleLogout = React.useCallback(() => {
    sessionStorage.removeItem('user');
    navigate('/login');
  }, [navigate]);

  React.useEffect(() => {
    setIsManagerMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (!isManagerMenuOpen) return undefined;

    const sidebar = managerSidebarRef.current;
    const focusable = sidebar?.querySelectorAll('a[href], button:not([disabled])') || [];
    focusable[0]?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsManagerMenuOpen(false);
        managerMenuButtonRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab' || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isManagerMenuOpen]);

  return (
    <div className={`app-layout ${isManager ? 'manager-shell' : ''}`}>
      {isManager && (
        <header className="manager-mobile-header">
          <div className="manager-mobile-header__brand">
            <span className="manager-sidebar__mark" aria-hidden="true">G</span>
            <span><strong>GearGuard</strong><small>Manager workspace</small></span>
          </div>
          <button
            ref={managerMenuButtonRef}
            type="button"
            className="manager-mobile-menu-button"
            aria-label={isManagerMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-controls="manager-navigation"
            aria-expanded={isManagerMenuOpen}
            onClick={() => setIsManagerMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{isManagerMenuOpen ? 'Close' : 'Menu'}</span>
          </button>
        </header>
      )}
      {isManager && isManagerMenuOpen && (
        <button
          className="manager-sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => {
            setIsManagerMenuOpen(false);
            managerMenuButtonRef.current?.focus();
          }}
        />
      )}
      {!isManager && (
        <div className="auth-backdrop">
          <span className="orb orb-a" />
          <span className="orb orb-b" />
          <span className="orb orb-c" />
        </div>
      )}
      
      <aside
        ref={isManager ? managerSidebarRef : null}
        id={isManager ? 'manager-navigation' : undefined}
        aria-label={isManager ? 'Manager navigation' : 'Primary navigation'}
        className={`app-sidebar ${isManager ? `manager-sidebar ${isManagerMenuOpen ? 'is-open' : ''}` : ''}`}
      >
        {isManager ? (
          <div className="manager-sidebar__brand">
            <span className="manager-sidebar__mark" aria-hidden="true">G</span>
            <span className="manager-sidebar__brand-copy"><strong>GearGuard</strong><span>Maintenance operations</span></span>
          </div>
        ) : (
          <div className="brand" style={{ marginTop: 4 }}>GearGuard</div>
        )}
        {isTechnician ? (
          <>
            <NavLink to="/app/technician" end>My Tasks</NavLink>
            <NavLink to="/app/requests">All Requests</NavLink>
            <NavLink to="/app/teams">Teams</NavLink>
          </>
        ) : isManager ? (
          <>
            <p className="manager-sidebar__group-label">Work</p>
            <NavLink to="/app/manager/overview">Overview</NavLink>
            <NavLink to="/app/manager/requests">Requests</NavLink>
            <NavLink to="/app/manager/schedule">Schedule</NavLink>
            <NavLink to="/app/manager/workload">Team Workload</NavLink>
            <p className="manager-sidebar__group-label">Operations</p>
            <NavLink to="/app/equipment/machine-tools">Equipment</NavLink>
            <NavLink to="/app/equipment/work-center">Work Centers</NavLink>
            <NavLink to="/app/teams">Teams</NavLink>
          </>
        ) : (
          <>
            <NavLink to={isAdmin ? '/app/admin' : '/app/home'} end>{isAdmin ? 'Admin Dashboard' : 'Home'}</NavLink>
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

        {isManager ? (
          <div className="manager-sidebar__footer">
            <div className="manager-sidebar__user"><strong>{user?.name || 'Manager'}</strong><span>{user?.email || 'Manager account'}</span></div>
            <button type="button" className="sidebar-logout" onClick={handleLogout}>Log out</button>
          </div>
        ) : (
          <button type="button" className="sidebar-logout" onClick={handleLogout}>Logout</button>
        )}
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>

  );
}
