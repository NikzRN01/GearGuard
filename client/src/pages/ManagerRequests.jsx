import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';
import SelectMenu from '../components/ui/SelectMenu';
import Field from '../components/ui/Field';
import Input from '../components/ui/Input';
import { formatTimestamp } from '../services/datetime';
import { getSessionUser } from '../services/session';

const CLOSED_STATUSES = new Set(['repaired', 'scrap', 'completed', 'closed']);
const isOpen = (request) => !CLOSED_STATUSES.has(String(request.status || '').toLowerCase());
const dateKey = (value) => value ? String(value).slice(0, 10) : '';
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const formatSchedule = (value) => {
  const key = dateKey(value);
  if (!key) return 'Unscheduled';
  const today = todayKey();
  if (key === today) return 'Today';
  const day = 86400000;
  const distance = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / day);
  if (distance === 1) return 'Tomorrow';
  if (distance < 0) return `${Math.abs(distance)} day${distance === -1 ? '' : 's'} overdue`;
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ManagerRequests() {
  const isAdmin = getSessionUser()?.role === 'admin';
  const navigate = useNavigate();
  const { requestId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [error, setError] = useState('');
  const [assignmentFeedback, setAssignmentFeedback] = useState('');
  const [scheduleFeedback, setScheduleFeedback] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const loadList = async () => {
    setLoading(true);
    setError('');
    try {
      const [requestResponse, userResponse] = await Promise.all([
        api.get('/maintenance'),
        api.get('/teams/users/all')
      ]);
      setRequests(requestResponse?.data?.data || []);
      setUsers((userResponse?.data?.data || []).filter((user) => ['technician', 'manager'].includes(user.role)));
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load maintenance requests.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    if (!id) { setDetail(null); return; }
    setDetailLoading(true);
    setError('');
    setAssignmentFeedback('');
    setScheduleFeedback('');
    try {
      const response = await api.get(`/maintenance/${id}`);
      const request = response?.data?.data || null;
      setDetail(request);
      setAssigneeId(request?.assigned_to_user_id ? String(request.assigned_to_user_id) : '');
      setScheduledDate(dateKey(request?.scheduled_date));
      setSubject(request?.subject || '');
    } catch (err) {
      setDetail(null);
      setError(err?.response?.data?.message || 'Unable to load request details.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { loadList(); }, []);
  useEffect(() => { loadDetail(requestId); }, [requestId]);

  const filtered = useMemo(() => {
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const status = searchParams.get('status') || '';
    const view = searchParams.get('view') || '';
    const today = todayKey();
    return requests.filter((request) => {
      if (status && request.status !== status) return false;
      if (view === 'unassigned' && (!isOpen(request) || request.assigned_to_user_id)) return false;
      if (view === 'overdue' && (!isOpen(request) || !request.scheduled_date || dateKey(request.scheduled_date) >= today)) return false;
      if (!search) return true;
      return [request.subject, request.equipment_name, request.work_center_name, request.team_name, request.assigned_to_name, request.status]
        .filter(Boolean).join(' ').toLowerCase().includes(search);
    });
  }, [requests, searchParams]);

  const requestStats = useMemo(() => {
    const today = todayKey();
    return {
      all: requests.length,
      unassigned: requests.filter((request) => isOpen(request) && !request.assigned_to_user_id).length,
      overdue: requests.filter((request) => isOpen(request) && request.scheduled_date && dateKey(request.scheduled_date) < today).length,
      inProgress: requests.filter((request) => request.status === 'in_progress').length
    };
  }, [requests]);

  const activeFilterCount = ['search', 'status', 'view'].filter((key) => searchParams.get(key)).length;

  const applyQuickView = (view) => {
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    next.delete('status');
    if (view === 'unassigned' || view === 'overdue') next.set('view', view);
    if (view === 'in_progress') next.set('status', 'in_progress');
    setSearchParams(next, { replace: true });
  };

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const assign = async () => {
    if (!detail?.id || !assigneeId) return;
    setAssignmentSaving(true); setError(''); setAssignmentFeedback('');
    try {
      await api.patch(`/maintenance/${detail.id}/assign`, { user_id: Number(assigneeId) });
      await Promise.all([loadDetail(detail.id), loadList()]);
      setAssignmentFeedback('Assignment updated.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update the assignment.');
    } finally { setAssignmentSaving(false); }
  };

  const reschedule = async () => {
    if (!detail?.id) return;
    setScheduleSaving(true); setError(''); setScheduleFeedback('');
    try {
      await api.put(`/maintenance/${detail.id}`, {
        type: detail.type,
        subject: detail.subject,
        equipment_id: detail.equipment_id || null,
        work_center_id: detail.work_center_id || null,
        scheduled_date: scheduledDate || null,
        duration_hours: detail.duration_hours ?? null
      });
      await Promise.all([loadDetail(detail.id), loadList()]);
      setScheduleFeedback('Scheduled date updated.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update the schedule.');
    } finally { setScheduleSaving(false); }
  };

  const updateRequest = async () => {
    if (!detail?.id || !subject.trim()) return;
    setActionSaving(true); setError('');
    try {
      await api.put(`/maintenance/${detail.id}`, { type: detail.type, subject: subject.trim(), equipment_id: detail.equipment_id || null, work_center_id: detail.work_center_id || null, scheduled_date: scheduledDate || null, duration_hours: detail.duration_hours ?? null });
      await Promise.all([loadDetail(detail.id), loadList()]);
    } catch (err) { setError(err?.response?.data?.message || 'Unable to update the request.'); }
    finally { setActionSaving(false); }
  };

  const updateStatus = async (status) => {
    setActionSaving(true); setError('');
    try { await api.patch(`/maintenance/${detail.id}/status`, { status }); await Promise.all([loadDetail(detail.id), loadList()]); }
    catch (err) { setError(err?.response?.data?.message || 'Unable to update request status.'); }
    finally { setActionSaving(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setActionSaving(true); setError('');
    try { await api.post(`/maintenance/${detail.id}/notes`, { message: note.trim() }); setNote(''); await loadDetail(detail.id); }
    catch (err) { setError(err?.response?.data?.message || 'Unable to add the note.'); }
    finally { setActionSaving(false); }
  };

  const deleteRequest = async () => {
    if (!window.confirm(`Delete request #${detail.id}? This cannot be undone.`)) return;
    setActionSaving(true); setError('');
    try { await api.delete(`/maintenance/${detail.id}`); navigate('/app/manager/requests'); await loadList(); }
    catch (err) { setError(err?.response?.data?.message || 'Unable to delete the request.'); }
    finally { setActionSaving(false); }
  };

  return (
    <div className="container manager-page">
      <PageHeader
        eyebrow={isAdmin ? 'Admin operations' : 'Manager workspace'}
        title="Requests"
        description="Review, assign, and schedule maintenance work."
        actions={<><Button as="link" to="/app/requests" state={{ openNew: true }}>Create request</Button><Button as="link" variant="secondary" to={isAdmin ? '/app/admin' : '/app/manager/overview'}>Back to overview</Button></>}
      />

      <div className="manager-filter-bar" aria-label="Request filters">
        <div className="manager-filter-heading"><div><span>Find maintenance work</span><small>{activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'Showing the full request queue'}</small></div></div>
        <Field label="Search"><Input type="search" value={searchParams.get('search') || ''} onChange={(event) => updateParam('search', event.target.value)} placeholder="Request, asset, team..." /></Field>
        <div className="manager-filter-field"><span>Status</span><SelectMenu ariaLabel="Filter by status" value={searchParams.get('status') || ''} onChange={(value) => updateParam('status', value)} options={[{ value: '', label: 'All statuses' }, { value: 'new', label: 'New' }, { value: 'in_progress', label: 'In progress' }, { value: 'repaired', label: 'Repaired' }, { value: 'scrap', label: 'Scrapped' }]} /></div>
        <div className="manager-filter-field"><span>Attention</span><SelectMenu ariaLabel="Filter by attention" value={searchParams.get('view') || ''} onChange={(value) => updateParam('view', value)} options={[{ value: '', label: 'All requests' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'overdue', label: 'Overdue' }]} /></div>
        <Button variant="secondary" disabled={activeFilterCount === 0} onClick={() => setSearchParams({}, { replace: true })}>Clear filters</Button>
      </div>

      <p className="manager-filter-results" role="status" aria-live="polite">{loading ? 'Loading request queue.' : `${filtered.length} request${filtered.length === 1 ? '' : 's'} shown.`}</p>

      {error && <Alert tone="danger" title="Request action failed">{error}</Alert>}

      <nav className="manager-request-summary" aria-label="Request queue views">
        <button type="button" aria-current={!searchParams.get('view') && !searchParams.get('status') ? 'page' : undefined} className={!searchParams.get('view') && !searchParams.get('status') ? 'active' : ''} onClick={() => applyQuickView('all')}><span>All requests</span><strong>{requestStats.all}</strong><small>Complete queue</small></button>
        <button type="button" aria-current={searchParams.get('view') === 'unassigned' ? 'page' : undefined} className={searchParams.get('view') === 'unassigned' ? 'active attention' : ''} onClick={() => applyQuickView('unassigned')}><span>Needs owner</span><strong>{requestStats.unassigned}</strong><small>Ready to assign</small></button>
        <button type="button" aria-current={searchParams.get('view') === 'overdue' ? 'page' : undefined} className={searchParams.get('view') === 'overdue' ? 'active danger' : ''} onClick={() => applyQuickView('overdue')}><span>Overdue</span><strong>{requestStats.overdue}</strong><small>Past planned date</small></button>
        <button type="button" aria-current={searchParams.get('status') === 'in_progress' ? 'page' : undefined} className={searchParams.get('status') === 'in_progress' ? 'active progress' : ''} onClick={() => applyQuickView('in_progress')}><span>In progress</span><strong>{requestStats.inProgress}</strong><small>Work underway</small></button>
      </nav>

      <div className={`manager-request-layout ${requestId ? 'has-selection' : ''}`}>
        <Panel className="manager-list-panel" ariaLabel="Maintenance requests. Scrollable region." tabIndex="0" eyebrow="Queue" title={`${filtered.length} requests`} action={<Button variant="tertiary" size="small" onClick={loadList}>Refresh</Button>}>
          {loading ? <div className="manager-state" role="status">Loading requests...</div> : filtered.length === 0 ? <EmptyState compact tone="search" title="No matching requests" description="Change or clear the filters to see the full queue." /> : (
            <ul className="manager-request-stack manager-scroll-stack" aria-label="Filtered maintenance requests">
              {filtered.map((request) => (
                <li key={request.id}><button type="button" aria-pressed={Number(requestId) === Number(request.id)} aria-label={`Request ${request.id}: ${request.subject}. ${request.assigned_to_name || 'Unassigned'}. ${formatSchedule(request.scheduled_date)}.`} onClick={() => navigate(`/app/manager/requests/${request.id}?${searchParams.toString()}`)} className={`manager-request-row manager-request-button ${Number(requestId) === Number(request.id) ? 'selected' : ''}`}>
                  <div className="manager-request-row__primary"><span className="manager-request-row__id">Request #{request.id}</span><strong>{request.subject}</strong><span className="manager-request-row__context">{request.equipment_name || request.work_center_name || 'No asset'} <i aria-hidden="true">·</i> {request.type || 'Unspecified type'}</span><span className={`manager-request-row__owner ${request.assigned_to_name ? '' : 'is-unassigned'}`}>{request.assigned_to_name || 'Unassigned'}</span></div>
                  <div className="manager-row-meta">
                    <div className="manager-row-badges">
                      <StatusBadge status={request.status || 'new'} />
                      {isOpen(request) && !request.assigned_to_user_id && <StatusBadge tone="warning">Unassigned</StatusBadge>}
                      {isOpen(request) && request.scheduled_date && dateKey(request.scheduled_date) < todayKey() && <StatusBadge tone="danger">Overdue</StatusBadge>}
                    </div>
                    <span>{formatSchedule(request.scheduled_date)}</span>
                  </div>
                </button></li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="manager-detail-panel" ariaLabel="Selected request details. Scrollable region." tabIndex="0">
          {!requestId ? <EmptyState tone="selection" title="Select a request" description="Choose an item from the queue to review, assign, or schedule it." /> : detailLoading ? <div className="manager-state" role="status">Loading request details...</div> : detail ? (
            <>
              <div className="manager-detail-heading"><div><p className="manager-eyebrow">Request #{detail.id}</p><h2>{detail.subject}</h2></div><StatusBadge status={detail.status || 'new'} /></div>
              <div className="manager-mobile-detail-nav">
                <Button as="link" variant="tertiary" size="small" to={`/app/manager/requests?${searchParams.toString()}`}>Back to request queue</Button>
              </div>
              <dl className="manager-detail-grid">
                <div><dt>Asset</dt><dd>{detail.equipment_name || detail.work_center_name || 'Not set'}</dd></div>
                <div><dt>Type</dt><dd>{detail.type || 'Not set'}</dd></div>
                <div><dt>Team</dt><dd>{detail.team_name || 'Not set'}</dd></div>
                <div><dt>Reported by</dt><dd>{detail.created_by_name || 'Unknown'}</dd></div>
                <div><dt>Assigned to</dt><dd>{detail.assigned_to_name || 'Unassigned'}</dd></div>
                <div><dt>Scheduled</dt><dd>{formatSchedule(detail.scheduled_date)}</dd></div>
                <div><dt>Duration</dt><dd>{detail.duration_hours != null ? `${detail.duration_hours} hours` : 'Not recorded'}</dd></div>
                <div><dt>Created</dt><dd>{formatTimestamp(detail.created_at, 'Unknown')}</dd></div>
              </dl>

              <form className="manager-form-section manager-form-section--controls" aria-busy={actionSaving} onSubmit={(event) => { event.preventDefault(); updateRequest(); }}>
                <div className="manager-section-intro"><span className="manager-section-number" aria-hidden="true">01</span><div><h3>Request controls</h3><p>Edit the subject or advance this request through its workflow.</p></div></div>
                <Field label="Subject" hint={!isOpen(detail) ? 'Closed requests cannot be edited.' : 'Press Enter to save a changed subject.'}><Input value={subject} disabled={!isOpen(detail) || actionSaving} onChange={(event) => setSubject(event.target.value)} /></Field>
                <div className="manager-inline-actions manager-request-actions"><Button type="submit" pending={actionSaving} pendingLabel="Saving..." disabled={!isOpen(detail) || !subject.trim() || subject.trim() === detail.subject}>Save request</Button>{detail.status === 'new' && <Button disabled={actionSaving} onClick={() => updateStatus('in_progress')}>Start work</Button>}{['new', 'in_progress'].includes(detail.status) && <Button variant="secondary" disabled={actionSaving} onClick={() => updateStatus('scrap')}>Mark scrapped</Button>}{detail.status === 'in_progress' && <Button disabled={actionSaving} onClick={() => updateStatus('repaired')}>Mark repaired</Button>}<Button variant="danger" className="manager-delete-request" disabled={actionSaving} onClick={deleteRequest}>Delete request</Button></div>
              </form>

              <form className="manager-form-section manager-form-section--assignment" aria-busy={assignmentSaving} onSubmit={(event) => { event.preventDefault(); assign(); }}>
                <div className="manager-section-intro"><span className="manager-section-number" aria-hidden="true">02</span><div><h3>Assignment</h3><p>Route work to an eligible technician or manager.</p></div></div>
                <Field label="Technician or manager" hint={!isOpen(detail) ? 'Closed requests cannot be reassigned.' : 'Press Enter to confirm the selected assignee.'}><select value={assigneeId} disabled={!isOpen(detail) || assignmentSaving} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Select an assignee</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></Field>
                <Button type="submit" pending={assignmentSaving} pendingLabel="Updating assignment..." disabled={!isOpen(detail) || !assigneeId || String(detail.assigned_to_user_id || '') === assigneeId}>Update assignment</Button>
                {assignmentFeedback && <p className="manager-form-feedback" role="status">{assignmentFeedback}</p>}
              </form>

              <form className="manager-form-section manager-form-section--schedule" aria-busy={scheduleSaving} onSubmit={(event) => { event.preventDefault(); reschedule(); }}>
                <div className="manager-section-intro"><span className="manager-section-number" aria-hidden="true">03</span><div><h3>Schedule</h3><p>Set the planned work date. Time scheduling is not yet available.</p></div></div>
                <Field label="Scheduled date" hint={!isOpen(detail) ? 'Closed requests cannot be rescheduled.' : 'Press Enter to confirm the date.'}><Input type="date" value={scheduledDate} disabled={!isOpen(detail) || scheduleSaving} onChange={(event) => setScheduledDate(event.target.value)} /></Field>
                <Button type="submit" variant="secondary" pending={scheduleSaving} pendingLabel="Updating date..." disabled={!isOpen(detail) || dateKey(detail.scheduled_date) === scheduledDate}>Update date</Button>
                {scheduleFeedback && <p className="manager-form-feedback" role="status">{scheduleFeedback}</p>}
              </form>

              <div className="manager-history">
                <div className="manager-section-intro"><span className="manager-section-number" aria-hidden="true">04</span><div><h3>Notes</h3><p>Keep a timestamped operational record for the team.</p></div></div>
                <form className="manager-note-composer" onSubmit={(event) => { event.preventDefault(); addNote(); }}><Input aria-label="Operational note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an operational note" /><Button type="submit" variant="secondary" pending={actionSaving} pendingLabel="Adding..." disabled={!note.trim()}>Add note</Button></form>
                {detail.notes?.length ? detail.notes.map((note) => <article key={note.id}><p>{note.message}</p><time>{formatTimestamp(note.created_at, '')}</time></article>) : <EmptyState compact title="No notes yet" description="Notes added to this request will appear here." />}
              </div>
            </>
          ) : <EmptyState tone="error" title="Request unavailable" description="This request could not be displayed." />}
        </Panel>
      </div>
    </div>
  );
}
