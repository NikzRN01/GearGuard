import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';
import { todayKey } from '../services/datetime';
import { WORKLOAD_SCOPE_NOTE, dateKey, isOpen, isOverdue, isUnassigned, summarizeWorkload } from '../services/workload';

const formatSchedule = (value) => {
  const key = dateKey(value);
  if (!key) return 'Unscheduled';
  const today = todayKey();
  if (key === today) return 'Today';
  const distance = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (distance === 1) return 'Tomorrow';
  if (distance < 0) return `${Math.abs(distance)} day${distance === -1 ? '' : 's'} overdue`;
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ManagerOverview() {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [requestResponse, userResponse] = await Promise.all([
        api.get('/maintenance'),
        api.get('/teams/users/all')
      ]);
      setRequests(requestResponse?.data?.data || []);
      setUsers(userResponse?.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load the manager overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const overview = useMemo(() => {
    const today = todayKey();
    const open = requests.filter(isOpen);
    const unassigned = open.filter(isUnassigned);
    const overdue = open.filter((request) => isOverdue(request, today));
    const inProgress = open.filter((request) => String(request.status).toLowerCase() === 'in_progress');
    const scheduledToday = open
      .filter((request) => dateKey(request.scheduled_date) === today)
      .sort((a, b) => String(a.subject).localeCompare(String(b.subject)));
    const attention = [...new Map([...overdue, ...unassigned].map((request) => [request.id, request])).values()]
      .sort((a, b) => Number(isOverdue(b, today)) - Number(isOverdue(a, today))
        || String(a.scheduled_date || '9999').localeCompare(String(b.scheduled_date || '9999')));

    return { open, unassigned, overdue, inProgress, scheduledToday, attention };
  }, [requests]);

  const workload = useMemo(() => summarizeWorkload(users, overview.open), [overview.open, users]);

  if (loading) {
    return <div className="manager-state" role="status">Loading manager workspace...</div>;
  }

  return (
    <div className="container manager-page manager-overview-page">
      <PageHeader
        eyebrow="Manager workspace"
        title="Maintenance overview"
        description="Prioritize incoming work, review schedules, and balance assigned workload."
        actions={<>{overview.attention.length > 0 && <Button as="link" to={overview.overdue.length ? '/app/manager/requests?view=overdue' : '/app/manager/requests?view=unassigned'}>Review {overview.attention.length} attention item{overview.attention.length === 1 ? '' : 's'}</Button>}<Button variant="secondary" onClick={load}>Refresh</Button></>}
      />

      {error && (
        <Alert tone="danger" title="The overview could not be loaded" action={<Button variant="secondary" size="small" onClick={load}>Try again</Button>}>{error}</Alert>
      )}

      {!error && (
        <>
          <div className="manager-section-heading"><div><p className="gg-eyebrow">Live queue</p><h2>Operational summary</h2></div><span>{overview.open.length} open request{overview.open.length === 1 ? '' : 's'}</span></div>
          <section className="manager-kpi-grid" aria-label="Manager operational summary">
            <Link to="/app/manager/requests?view=unassigned" className={`manager-kpi ${overview.unassigned.length ? 'manager-kpi-danger' : 'manager-kpi-healthy'}`}>
              <span>Unassigned</span><strong>{overview.unassigned.length}</strong><small>Needs ownership</small>
            </Link>
            <Link to="/app/manager/requests?view=overdue" className={`manager-kpi ${overview.overdue.length ? 'manager-kpi-warning' : 'manager-kpi-healthy'}`}>
              <span>Overdue</span><strong>{overview.overdue.length}</strong><small>Past scheduled date</small>
            </Link>
            <Link to="/app/manager/requests?status=in_progress" className="manager-kpi manager-kpi-info">
              <span>In progress</span><strong>{overview.inProgress.length}</strong><small>Work underway</small>
            </Link>
            <Link to="/app/manager/requests" className="manager-kpi manager-kpi-neutral">
              <span>Open requests</span><strong>{overview.open.length}</strong><small>Active workload</small>
            </Link>
          </section>

          <div className="manager-dashboard-grid">
            <Panel eyebrow="Attention queue" title={`${overview.attention.length} requests need attention`} action={overview.attention.length > 0 && <Button as="link" variant="tertiary" size="small" to={overview.overdue.length ? '/app/manager/requests?view=overdue' : '/app/manager/requests?view=unassigned'}>Review queue</Button>}>
              {overview.attention.length === 0 ? (
                <EmptyState compact tone="success" title="No immediate attention needed" description="Open requests are assigned and none are overdue." />
              ) : (
                <div className="manager-request-stack">
                  {overview.attention.slice(0, 6).map((request) => {
                    const overdue = Boolean(request.scheduled_date && dateKey(request.scheduled_date) < todayKey());
                    return (
                    <Link key={request.id} to={`/app/manager/requests/${request.id}`} className="manager-request-row">
                      <div><strong>{request.subject}</strong><span>{request.equipment_name || request.work_center_name || 'No asset'}</span></div>
                      <div className="manager-row-meta"><div className="manager-row-badges">{overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}{!request.assigned_to_user_id && <StatusBadge tone="warning">Unassigned</StatusBadge>}</div><span>{formatSchedule(request.scheduled_date)}</span></div>
                    </Link>
                  );})}
                </div>
              )}
            </Panel>

            <Panel eyebrow="Today" title="Scheduled work" action={<Button as="link" variant="tertiary" size="small" to="/app/manager/schedule">Open schedule</Button>}>
              {overview.scheduledToday.length === 0 ? (
                <EmptyState compact tone="success" title="No work scheduled today" description="Open requests with a scheduled date will appear here." />
              ) : (
                <div className="manager-request-stack">
                  {overview.scheduledToday.slice(0, 6).map((request) => (
                    <Link key={request.id} to={`/app/manager/requests/${request.id}`} className="manager-request-row">
                      <div><strong>{request.subject}</strong><span>{request.assigned_to_name || 'Unassigned'}</span></div>
                      <div className="manager-row-meta"><StatusBadge status={request.status} /><span>Today</span></div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="manager-context-note"><strong>Workload scope</strong><span>{WORKLOAD_SCOPE_NOTE}</span></div>

          <Panel eyebrow="Team" title="Assigned workload" action={<Button as="link" variant="tertiary" size="small" to="/app/manager/workload">View workload</Button>}>
            {workload.length === 0 ? (
              <EmptyState title="No eligible team members" description="Eligible technicians and managers will appear after accounts are available." />
            ) : (
              <div className="manager-workload-grid">
                {workload.slice(0, 6).map((person) => (
                  <article key={person.id} className="manager-person-card">
                    <div className="manager-person-identity">
                      <div className="manager-person-avatar" aria-hidden="true">{person.name?.charAt(0)?.toUpperCase() || '?'}</div>
                      <div className="manager-person-copy"><strong>{person.name}</strong><span>{person.role}</span></div>
                    </div>
                    <dl aria-label={`Workload summary for ${person.name}`}>
                      <div className="manager-person-metric"><dt>Active</dt><dd>{person.active}</dd></div>
                      <div className="manager-person-metric manager-person-metric--working"><dt>Working</dt><dd>{person.inProgress}</dd></div>
                      <div className={`manager-person-metric manager-person-metric--overdue${person.overdue > 0 ? ' has-value' : ''}`}><dt>Overdue</dt><dd>{person.overdue}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
