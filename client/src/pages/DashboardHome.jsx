import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';
import { api } from '../services/api';
import { formatTimestampDate, parseTimestamp } from '../services/datetime';

const statusKey = (status) => String(status || 'new').trim().toLowerCase().replaceAll(' ', '_');
const isResolved = (status) => ['repaired', 'scrap', 'completed', 'closed'].includes(statusKey(status));

export default function DashboardHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await api.get('/maintenance');
      setRequests(response?.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load your requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    open: requests.filter((request) => !isResolved(request.status)).length,
    awaiting: requests.filter((request) => !isResolved(request.status) && !request.assigned_to_user_id && !request.assigned_to_name).length,
    inProgress: requests.filter((request) => statusKey(request.status) === 'in_progress').length,
    resolved: requests.filter((request) => isResolved(request.status)).length
  }), [requests]);

  const visibleRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests
      .filter((request) => !query || [request.subject, request.equipment_name, request.work_center_name, request.status, request.assigned_to_name].some((field) => String(field || '').toLowerCase().includes(query)))
      .sort((a, b) => (parseTimestamp(b.created_at)?.getTime() || 0) - (parseTimestamp(a.created_at)?.getTime() || 0))
      .slice(0, 8);
  }, [requests, search]);

  return (
    <div className="container manager-page user-home-page">
      <PageHeader
        eyebrow="Requester workspace"
        title="My maintenance"
        description="Submit maintenance needs and follow the progress of requests you created."
        actions={<><Button onClick={() => navigate('/app/requests', { state: { openNew: true } })}>New request</Button><Button variant="secondary" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button></>}
      />

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="user-home-stats" aria-label="My request totals">
        <article><span>Open</span><strong>{stats.open}</strong><small>Requests needing attention</small></article>
        <article><span>Awaiting assignment</span><strong>{stats.awaiting}</strong><small>Waiting for an owner</small></article>
        <article><span>In progress</span><strong>{stats.inProgress}</strong><small>Currently being worked</small></article>
        <article><span>Resolved</span><strong>{stats.resolved}</strong><small>Completed requests</small></article>
      </section>

      <Panel
        eyebrow="Request history"
        title="Recent requests"
        action={<div className="user-request-tools"><label><span className="sr-only">Search my requests</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search my requests" /></label><Button variant="tertiary" onClick={() => navigate('/app/requests')}>View all</Button></div>}
      >
        {!loading && visibleRequests.length === 0 ? (
          <EmptyState tone={search ? 'search' : 'selection'} title={search ? 'No matching requests' : 'No requests yet'} description={search ? 'Try a different subject, asset, status, or technician.' : 'Submit your first maintenance request and track it here.'} action={!search && <Button onClick={() => navigate('/app/requests', { state: { openNew: true } })}>Create request</Button>} />
        ) : (
          <div className="table-wrap user-request-table-wrap">
            <table className="table user-request-table">
              <thead><tr><th>Request</th><th>Asset</th><th>Assigned to</th><th>Status</th><th>Submitted</th><th /></tr></thead>
              <tbody>{visibleRequests.map((request) => <tr key={request.id}><td><strong>{request.subject || 'Untitled request'}</strong></td><td>{request.equipment_name || request.work_center_name || 'Not specified'}</td><td>{request.assigned_to_name || 'Awaiting assignment'}</td><td><StatusBadge status={request.status} /></td><td>{formatTimestampDate(request.created_at)}</td><td><Button size="small" variant="tertiary" onClick={() => navigate(`/app/requests?request_id=${request.id}`)}>View</Button></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
