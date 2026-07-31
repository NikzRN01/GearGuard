import React, { useEffect, useMemo, useState } from 'react';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import SelectMenu from '../components/ui/SelectMenu';
import StatusBadge from '../components/ui/StatusBadge';
import { api } from '../services/api';
import { getSessionUser } from '../services/session';

const roleTone = { admin: 'danger', manager: 'warning', technician: 'active', user: 'neutral' };
const roleOptions = [
  { value: 'user', label: 'Standard user' },
  { value: 'technician', label: 'Technician' },
  { value: 'manager', label: 'Manager' }
];

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [draftRoles, setDraftRoles] = useState({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const currentUser = getSessionUser();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/users');
      const nextUsers = response?.data?.data || [];
      setUsers(nextUsers);
      setDraftRoles(Object.fromEntries(nextUsers.map((user) => [user.id, user.role])));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load user access data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredUsers = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return users;
    return users.filter((user) => [user.name, user.email, user.role].some((field) => String(field || '').toLowerCase().includes(value)));
  }, [query, users]);

  const updateRole = async (user) => {
    const role = draftRoles[user.id];
    if (!role || role === user.role) return;
    setSavingUserId(user.id);
    setError('');
    setMessage('');
    try {
      const response = await api.patch(`/admin/users/${user.id}/role`, { role });
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, role } : item));
      setMessage(response?.data?.message || 'Access role updated');
    } catch (err) {
      setDraftRoles((current) => ({ ...current, [user.id]: user.role }));
      setError(err?.response?.data?.message || 'Failed to update access role');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="container manager-page admin-users-page">
      <PageHeader
        eyebrow="Administration"
        title="User access"
        description="Assign operational roles while keeping administrator access isolated and protected."
        actions={<Button variant="secondary" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button>}
      />
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <Panel eyebrow="Access directory" title={`${users.length} accounts`} action={<label className="admin-user-search"><span className="sr-only">Search accounts</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, or role" /></label>}>
        <div className="table-wrap admin-table-wrap">
          <table className="table admin-access-table">
            <thead><tr><th>Account</th><th>Current access</th><th>Assign role</th><th>Action</th></tr></thead>
            <tbody>
              {!loading && filteredUsers.length === 0 && <tr><td colSpan={4} className="table-empty">No matching accounts.</td></tr>}
              {filteredUsers.map((user) => (
                <tr key={user.id} className={user.role === 'admin' ? 'admin-access-row--protected' : ''}>
                  <td><strong>{user.name || 'Unnamed account'}</strong><small className="admin-audit-email">{user.email || 'No email'}</small></td>
                  <td><StatusBadge tone={roleTone[user.role] || 'neutral'}>{user.role || 'user'}</StatusBadge></td>
                  <td>
                    {user.role === 'admin' ? <div className="admin-protected-access"><strong>Protected administrator</strong><span>Not part of operational role assignment</span></div> : <SelectMenu portal value={draftRoles[user.id] || user.role} options={roleOptions} onChange={(role) => setDraftRoles((current) => ({ ...current, [user.id]: role }))} ariaLabel={`Assign role for ${user.name || user.email}`} disabled={savingUserId === user.id} />}
                  </td>
                  <td>
                    {user.role === 'admin' || user.id === currentUser?.id ? <StatusBadge tone="neutral">Locked</StatusBadge> : <Button size="small" onClick={() => updateRole(user)} disabled={savingUserId === user.id || draftRoles[user.id] === user.role}>{savingUserId === user.id ? 'Saving...' : 'Update access'}</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
