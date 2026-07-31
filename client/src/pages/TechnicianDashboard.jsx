import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Input from '../components/ui/Input';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';

const CLOSED_STATUSES = new Set(['repaired', 'scrap', 'completed', 'closed']);
const dateKey = (value) => value ? String(value).slice(0, 10) : '';
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const formatDate = (value) => {
  const key = dateKey(value);
  if (!key) return 'Unscheduled';
  if (key === todayKey()) return 'Today';
  const distance = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${todayKey()}T00:00:00Z`)) / 86400000);
  if (distance < 0) return `${Math.abs(distance)} day${distance === -1 ? '' : 's'} overdue`;
  if (distance === 1) return 'Tomorrow';
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const TechnicianDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const user = useMemo(() => {
    const userData = sessionStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  }, []);

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.get('/maintenance');
      const technicianRequests = (data?.data || []).filter((request) =>
        Number(request.assigned_to_user_id) === Number(user?.id)
      );
      setRequests(technicianRequests);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Without an identity the request can only come back 401, and the filter
    // below would discard everything anyway.
    if (!user?.id) {
      setRequests([]);
      return;
    }
    load();
  }, [user?.id]);

  const stats = useMemo(() => {
    const open = requests.filter((request) => !CLOSED_STATUSES.has(String(request.status || '').toLowerCase()));
    const inProgress = open.filter(r => String(r.status || '').toLowerCase() === 'in_progress').length;
    const pending = open.filter(r => String(r.status || '').toLowerCase() === 'new').length;
    const overdue = open.filter((request) => request.scheduled_date && dateKey(request.scheduled_date) < todayKey()).length;
    
    return { open: open.length, inProgress, pending, overdue };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      const hay = [
        r.subject,
        r.equipment_name,
        r.department,
        r.type,
        r.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [requests, search]);

  return (
    <div className="container manager-page technician-tasks-page">
      <PageHeader eyebrow="Technician workspace" title="My tasks" description="Review maintenance work assigned directly to you." actions={<Button variant="secondary" onClick={load} disabled={loading}>Refresh</Button>} />

      {/* Stats Cards */}
      <div className="tech-stats-grid">
        <div className="tech-stat-card tech-stat-total">
          <div className="tech-stat-label">Open tasks</div>
          <div className="tech-stat-value">{stats.open}</div>
        </div>

        <div className="tech-stat-card tech-stat-inprogress">
          <div className="tech-stat-label">In progress</div>
          <div className="tech-stat-value">{stats.inProgress}</div>
        </div>

        <div className="tech-stat-card tech-stat-new">
          <div className="tech-stat-label">New tasks</div>
          <div className="tech-stat-value">{stats.pending}</div>
        </div>

        <div className="tech-stat-card tech-stat-overdue">
          <div className="tech-stat-label">Overdue</div>
          <div className="tech-stat-value">{stats.overdue}</div>
        </div>
      </div>

      {/* Search */}
      <div className="tech-task-toolbar">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          aria-label="Search assigned tasks"
        />
        {search && <Button variant="tertiary" size="small" onClick={() => setSearch('')}>Clear search</Button>}
      </div>

      {error && <Alert tone="danger" title="Tasks could not be loaded" action={<Button variant="secondary" size="small" onClick={load}>Try again</Button>}>{error}</Alert>}

      {!error && <Panel eyebrow="Assigned work" title={`${filteredRequests.length} task${filteredRequests.length === 1 ? '' : 's'}`} ariaLabel="Assigned maintenance tasks">
        {loading ? <div className="manager-state" role="status">Loading your tasks...</div> : filteredRequests.length === 0 ? <EmptyState tone={search ? 'search' : 'success'} title={search ? 'No matching tasks' : 'No assigned tasks'} description={search ? 'Change or clear your search to see other assigned work.' : 'New work assigned to you will appear here.'} /> : <div className="tech-table-wrapper">
          <table className="tech-requests-table technician-task-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Equipment</th>
                <th>Type</th>
                <th>Status</th>
                <th>Scheduled Date</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id}>
                  <th scope="row" data-label="Task">
                    <div className="tech-task-name">{request.subject}</div>
                    <div className="tech-task-dept">{request.department}</div>
                  </th>
                  <td data-label="Equipment">{request.equipment_name || '-'}</td>
                  <td data-label="Type">{request.type || '-'}</td>
                  <td data-label="Status"><StatusBadge status={request.status} /></td>
                  <td data-label="Scheduled date" className={request.scheduled_date && dateKey(request.scheduled_date) < todayKey() && !CLOSED_STATUSES.has(String(request.status).toLowerCase()) ? 'technician-overdue-date' : ''}>{formatDate(request.scheduled_date)}</td>
                  <td className="tech-action-cell">
                    <Button variant="tertiary" size="small" onClick={() => navigate(`/app/requests?request_id=${request.id}`)}>View task</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </Panel>}
    </div>
  );
};

export default TechnicianDashboard;
