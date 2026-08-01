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
        <Field label="Search"><Input type="search" value={searchParams.get('search') || ''} onChange={(event) => updateParam('search', event.target.value)} placeholder="Request, asset, team..." /></Field>
        <div className="manager-filter-field"><span>Status</span><SelectMenu ariaLabel="Filter by status" value={searchParams.get('status') || ''} onChange={(value) => updateParam('status', value)} options={[{ value: '', label: 'All statuses' }, { value: 'new', label: 'New' }, { value: 'in_progress', label: 'In progress' }, { value: 'repaired', label: 'Repaired' }, { value: 'scrap', label: 'Scrapped' }]} /></div>
        <div className="manager-filter-field"><span>Attention</span><SelectMenu ariaLabel="Filter by attention" value={searchParams.get('view') || ''} onChange={(value) => updateParam('view', value)} options={[{ value: '', label: 'All requests' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'overdue', label: 'Overdue' }]} /></div>
        <Button variant="secondary" onClick={() => setSearchParams({}, { replace: true })}>Clear filters</Button>
      </div>

      {error && <Alert tone="danger" title="Request action failed">{error}</Alert>}

      <div className={`manager-request-layout ${requestId ? 'has-selection' : ''}`}>
        <Panel className="manager-list-panel" ariaLabel="Maintenance requests" eyebrow="Queue" title={`${filtered.length} requests`} action={<Button variant="tertiary" size="small" onClick={loadList}>Refresh</Button>}>
          {loading ? <div className="manager-state" role="status">Loading requests...</div> : filtered.length === 0 ? <EmptyState compact tone="search" title="No matching requests" description="Change or clear the filters to see the full queue." /> : (
            <div className="manager-request-stack manager-scroll-stack">
              {filtered.map((request) => (
                <button key={request.id} type="button" onClick={() => navigate(`/app/manager/requests/${request.id}?${searchParams.toString()}`)} className={`manager-request-row manager-request-button ${Number(requestId) === Number(request.id) ? 'selected' : ''}`}>
                  <div><strong>{request.subject}</strong><span>{request.equipment_name || request.work_center_name || 'No asset'} · {request.assigned_to_name || 'Unassigned'}</span></div>
                  <div className="manager-row-meta">
                    <div className="manager-row-badges">
                      <StatusBadge status={request.status || 'new'} />
                      {isOpen(request) && !request.assigned_to_user_id && <StatusBadge tone="warning">Unassigned</StatusBadge>}
                      {isOpen(request) && request.scheduled_date && dateKey(request.scheduled_date) < todayKey() && <StatusBadge tone="danger">Overdue</StatusBadge>}
                    </div>
                    <span>{formatSchedule(request.scheduled_date)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="manager-detail-panel" ariaLabel="Selected request details">
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
              </dl>

              <div className="manager-form-section" aria-busy={actionSaving}>
                <div><h3>Request controls</h3><p>Edit the request, advance its workflow, or remove it.</p></div>
                <Field label="Subject"><Input value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
                <div className="manager-inline-actions"><Button pending={actionSaving} pendingLabel="Saving..." disabled={!subject.trim() || subject.trim() === detail.subject} onClick={updateRequest}>Save request</Button>{detail.status === 'new' && <Button variant="secondary" onClick={() => updateStatus('in_progress')}>Start work</Button>}{['new', 'in_progress'].includes(detail.status) && <Button variant="secondary" onClick={() => updateStatus('scrap')}>Mark scrapped</Button>}{detail.status === 'in_progress' && <Button variant="secondary" onClick={() => updateStatus('repaired')}>Mark repaired</Button>}<Button variant="danger" onClick={deleteRequest}>Delete request</Button></div>
              </div>

              <div className="manager-form-section" aria-busy={assignmentSaving}>
                <div><h3>Assignment</h3><p>The API validates team eligibility for technicians.</p></div>
                <Field label="Technician or manager"><select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Select an assignee</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></Field>
                <Button pending={assignmentSaving} pendingLabel="Updating assignment..." disabled={!assigneeId || String(detail.assigned_to_user_id || '') === assigneeId} onClick={assign}>Update assignment</Button>
                {assignmentFeedback && <p className="manager-form-feedback" role="status">{assignmentFeedback}</p>}
              </div>

              <div className="manager-form-section" aria-busy={scheduleSaving}>
                <div><h3>Schedule</h3><p>The current API supports a date only; time and timezone scheduling remain backend-dependent.</p></div>
                <Field label="Scheduled date"><Input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></Field>
                <Button variant="secondary" pending={scheduleSaving} pendingLabel="Updating date..." disabled={dateKey(detail.scheduled_date) === scheduledDate} onClick={reschedule}>Update date</Button>
                {scheduleFeedback && <p className="manager-form-feedback" role="status">{scheduleFeedback}</p>}
              </div>

              <div className="manager-history">
                <h3>Notes</h3>
                <div className="manager-note-composer"><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an operational note" /><Button variant="secondary" pending={actionSaving} pendingLabel="Adding..." disabled={!note.trim()} onClick={addNote}>Add note</Button></div>
                {detail.notes?.length ? detail.notes.map((note) => <article key={note.id}><p>{note.message}</p><time>{formatTimestamp(note.created_at, '')}</time></article>) : <EmptyState compact title="No notes yet" description="Notes added to this request will appear here." />}
              </div>
            </>
          ) : <EmptyState tone="error" title="Request unavailable" description="This request could not be displayed." />}
        </Panel>
      </div>
    </div>
  );
}
