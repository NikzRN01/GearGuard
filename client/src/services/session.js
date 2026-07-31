export function getSessionUser() {
  try {
    const raw = sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getDefaultAppPath(user) {
  if (user?.role === 'technician') return '/app/technician';
  if (user?.role === 'manager') return '/app/manager/overview';
  if (user?.role === 'admin') return '/app/admin';
  return '/app/home';
}

