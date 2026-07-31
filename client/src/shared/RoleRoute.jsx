import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getDefaultAppPath, getSessionUser } from '../services/session';

export default function RoleRoute({ allowedRoles, children }) {
  const location = useLocation();
  const user = React.useMemo(() => getSessionUser(), []);

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDefaultAppPath(user)} replace />;
  }

  return children;
}

