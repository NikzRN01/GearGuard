import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getDefaultAppPath } from '../services/session';
import { api } from '../services/api';

export default function RoleRoute({ allowedRoles, children }) {
  const location = useLocation();
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    api.get('/auth/me')
      .then(({ data }) => {
        if (!active) return;
        sessionStorage.setItem('user', JSON.stringify(data.user));
        sessionStorage.setItem('csrf_token', data.csrfToken);
        setUser(data.user);
      })
      .catch(() => {
        if (!active) return;
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('csrf_token');
        setUser(null);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  if (loading) return <div className="route-loading" role="status">Checking your session...</div>;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDefaultAppPath(user)} replace />;
  }

  return children;
}
