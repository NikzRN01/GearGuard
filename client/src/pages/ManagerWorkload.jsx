import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import { getSessionUser } from '../services/session';
import { ASSIGNABLE_ROLES, WORKLOAD_SCOPE_NOTE, assigneeRequestsPath, summarizeWorkload } from '../services/workload';

export default function ManagerWorkload() {
  const isAdmin = getSessionUser()?.role === 'admin';
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([api.get('/maintenance'), api.get('/teams/users/all')])
      .then(([requestResponse, userResponse]) => {
        setRequests(requestResponse?.data?.data || []);
        setUsers((userResponse?.data?.data || []).filter((user) => ASSIGNABLE_ROLES.includes(user.role)));
      })
      .catch((err) => setError(err?.response?.data?.message || 'Unable to load assigned workload.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => summarizeWorkload(users, requests), [requests, users]);

  return (
    <div className="container manager-page manager-workload-page">
      <PageHeader eyebrow={isAdmin ? 'Admin operations' : 'Manager workspace'} title="Assigned workload" description="Review active work across eligible technicians and managers." actions={<><Button variant="secondary" onClick={load} disabled={loading}>Refresh</Button><Button as="link" variant="secondary" to={isAdmin ? '/app/admin' : '/app/manager/overview'}>Back to overview</Button></>} />
      <Alert tone="info">{WORKLOAD_SCOPE_NOTE}</Alert>
      {error && <Alert tone="danger" title="Workload could not be loaded" action={<Button variant="secondary" size="small" onClick={load}>Try again</Button>}>{error}</Alert>}
      {!error && <Panel eyebrow="Team" title={`${rows.length} eligible team members`} ariaLabel="Assigned workload by team member">
        {loading ? <div className="manager-state" role="status">Loading assigned workload...</div> : rows.length === 0 ? <EmptyState title="No eligible team members" description="Technicians and managers will appear here when accounts are available." /> : (
          <div className="table-wrap manager-workload-table-wrap"><table className="table manager-workload-table">
            <colgroup><col className="workload-col-member" /><col className="workload-col-role" /><col className="workload-col-metric" /><col className="workload-col-metric" /><col className="workload-col-metric" /><col className="workload-col-action" /></colgroup>
            <thead><tr><th scope="col">Team member</th><th scope="col">Role</th><th scope="col">Active assigned</th><th scope="col">In progress</th><th scope="col">Overdue</th><th scope="col" className="manager-workload-action-heading">Action</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>
              <th scope="row" data-label="Team member"><span className="manager-workload-member"><span className="manager-workload-avatar" aria-hidden="true">{row.name?.charAt(0)?.toUpperCase() || '?'}</span><strong>{row.name}</strong></span></th>
              <td data-label="Role" className="manager-role-cell"><span className={`manager-role-badge manager-role-badge--${row.role}`}>{row.role}</span></td>
              <td data-label="Active assigned" className="manager-workload-metric"><strong>{row.active}</strong></td>
              <td data-label="In progress" className="manager-workload-metric"><strong>{row.inProgress}</strong></td>
              <td data-label="Overdue" className={`manager-workload-metric${row.overdue > 0 ? ' has-value' : ''}`}><strong>{row.overdue}</strong></td>
              <td data-label="Action" className="manager-workload-action"><Button as="link" variant="secondary" size="small" to={assigneeRequestsPath(row.id)}>View requests</Button></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </Panel>}
    </div>
  );
}
