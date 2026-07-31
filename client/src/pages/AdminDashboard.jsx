import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import SelectMenu from '../components/ui/SelectMenu';
import StatusBadge from '../components/ui/StatusBadge';
import { api } from '../services/api';
import { parseTimestamp } from '../services/datetime';

const auditFilters = [
  { value: 'all', label: 'All activity' },
  { value: 'access', label: 'Access changes' },
  { value: 'authentication', label: 'Authentication' },
  { value: 'operations', label: 'Operational changes' }
];

// Keys must match the action strings the API writes in middleware/auth.js
// callers; an unlisted action still renders, just without a friendly label.
const describeAction = (action) => {
  const labels = {
    'auth.login': 'Signed in',
    'auth.logout': 'Signed out',
    'auth.password_reset': 'Password reset completed',
    'admin.user.role.update': 'User access changed',
    'maintenance.create': 'Maintenance request created',
    'maintenance.update': 'Maintenance request edited',
    'maintenance.delete': 'Maintenance request deleted',
    'maintenance.assign': 'Request assignment changed',
    'maintenance.status': 'Request status changed',
    'maintenance.note.create': 'Request note added'
  };
  return labels[action] || String(action || 'System activity').replaceAll('.', ' / ').replaceAll('_', ' ');
};

const eventCategory = (action) => {
  if (String(action).startsWith('admin.')) return 'access';
  if (String(action).startsWith('auth.')) return 'authentication';
  return 'operations';
};

const categoryTone = { access: 'danger', authentication: 'active', operations: 'neutral' };
const categoryLabel = { access: 'Access', authentication: 'Authentication', operations: 'Operations' };

const parseAuditDate = parseTimestamp;
const relativeTime = (value) => {
  const date = parseAuditDate(value);
  if (!date) return 'Unknown time';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const ranges = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day']];
  let amount = seconds;
  for (const [limit, unit] of ranges) {
    if (Math.abs(amount) < limit) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(amount, unit);
    amount = Math.round(amount / limit);
  }
  return date.toLocaleDateString();
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState({ totalUsers: 0, roles: {}, activeSessions: 0, recentAuditEvents: 0, pendingPasswordResets: 0 });
  const [events, setEvents] = useState([]);
  const [auditFilter, setAuditFilter] = useState('all');
  const [auditQuery, setAuditQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewResponse, auditResponse] = await Promise.all([api.get('/admin/overview'), api.get('/admin/audit')]);
      setOverview(overviewResponse?.data?.data || {});
      setEvents(auditResponse?.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load administration data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visibleEvents = useMemo(() => {
    const query = auditQuery.trim().toLowerCase();
    return events.filter((event) => {
      const category = eventCategory(event.action);
      const matchesCategory = auditFilter === 'all' || auditFilter === category;
      const matchesQuery = !query || [describeAction(event.action), event.actor_name, event.actor_email, event.resource_type, event.resource_id].some((field) => String(field || '').toLowerCase().includes(query));
      return matchesCategory && matchesQuery;
    });
  }, [auditFilter, auditQuery, events]);

  return (
    <div className="container manager-page admin-overview-page">
      <PageHeader eyebrow="System administration" title="Control center" description="Review identity, access, active sessions, and security activity across GearGuard." actions={<Button variant="secondary" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh security data'}</Button>} />
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="admin-kpi-grid" aria-label="Administration totals">
        <div className="admin-kpi-card admin-kpi-card--users"><p>User accounts</p><strong>{overview.totalUsers || 0}</strong><span>Across all system roles</span></div>
        <div className="admin-kpi-card admin-kpi-card--equipment"><p>Active sessions</p><strong>{overview.activeSessions || 0}</strong><span>Authenticated sessions now</span></div>
        <div className="admin-kpi-card admin-kpi-card--requests"><p>Security activity</p><strong>{overview.recentAuditEvents || 0}</strong><span>Audit events in 24 hours</span></div>
        <div className="admin-kpi-card admin-kpi-card--teams"><p>Password resets</p><strong>{overview.pendingPasswordResets || 0}</strong><span>Valid unused reset tokens</span></div>
      </section>

      <section className="admin-governance-strip" aria-label="Role distribution">
        <div><p className="gg-eyebrow">Access governance</p><h2>System roles</h2><span>Administrative access is separate from maintenance operations.</span></div>
        <dl className="admin-role-counts"><div><dt>Administrators</dt><dd>{overview.roles?.admin || 0}</dd></div><div><dt>Managers</dt><dd>{overview.roles?.manager || 0}</dd></div><div><dt>Technicians</dt><dd>{overview.roles?.technician || 0}</dd></div></dl>
        <Button variant="secondary" onClick={() => navigate('/app/admin/users')}>Open user access</Button>
      </section>

      <Panel eyebrow="Security audit" title="Recent administrative activity" className="admin-audit-panel" action={<StatusBadge tone="neutral">Latest 50 events</StatusBadge>}>
        <div className="admin-audit-toolbar">
          <label className="admin-audit-search"><span className="sr-only">Search audit activity</span><input value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="Search actor, action, or resource" /></label>
          <div className="admin-audit-filter"><SelectMenu portal value={auditFilter} options={auditFilters} onChange={setAuditFilter} ariaLabel="Filter audit activity" /></div>
          <span className="admin-audit-count" aria-live="polite">Showing {visibleEvents.length} of {events.length}</span>
        </div>
        <div className="table-wrap admin-table-wrap">
          <table className="table admin-audit-table">
            <thead><tr><th>Activity</th><th>Actor</th><th>Target</th><th>When</th></tr></thead>
            <tbody>
              {!loading && visibleEvents.length === 0 && <tr><td colSpan={4} className="table-empty">No activity matches these filters.</td></tr>}
              {visibleEvents.map((event) => {
                const category = eventCategory(event.action);
                const date = parseAuditDate(event.created_at);
                return <tr key={event.id}><td><div className="admin-audit-event"><span className={`admin-audit-event__mark admin-audit-event__mark--${category}`} aria-hidden="true" /><div><strong>{describeAction(event.action)}</strong><StatusBadge tone={categoryTone[category]}>{categoryLabel[category]}</StatusBadge></div></div></td><td><strong>{event.actor_name || 'System'}</strong><small className="admin-audit-email">{event.actor_email || 'Automated event'}</small></td><td><span className="admin-audit-resource">{event.resource_type || 'system'}{event.resource_id ? ` #${event.resource_id}` : ''}</span></td><td><time dateTime={date?.toISOString()} title={date?.toLocaleString()}>{relativeTime(event.created_at)}</time><small className="admin-audit-email">{date?.toLocaleDateString()}</small></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
