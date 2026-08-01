import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import SelectMenu from '../components/ui/SelectMenu';
import StatusBadge from '../components/ui/StatusBadge';
import { api } from '../services/api';
import { formatDateOnly, formatTimestamp, formatTimestampDate } from '../services/datetime';

const initialForm = { subject: '', type: 'corrective', targetType: 'equipment', targetId: '', scheduledDate: '' };
const statusKey = (status) => String(status || 'new').toLowerCase().replaceAll(' ', '_');
const progressSteps = ['new', 'in_progress', 'repaired'];

export default function UserRequests() {
  const location = useLocation();
  const [requests, setRequests] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Depends only on the query string, so its identity is stable between
  // navigations and the effect below can list it honestly.
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [requestResponse, equipmentResponse, centerResponse] = await Promise.all([
        api.get('/maintenance'), api.get('/equipment'), api.get('/work-centers')
      ]);
      const nextRequests = requestResponse?.data?.data || [];
      setRequests(nextRequests);
      setEquipment(equipmentResponse?.data?.data || []);
      setWorkCenters(centerResponse?.data?.data || []);
      const requestedId = new URLSearchParams(location.search).get('request_id');
      setSelectedId((current) => Number(requestedId) || current || nextRequests[0]?.id || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load your requests');
    } finally { setLoading(false); }
  }, [location.search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (location.state?.openNew) setOpen(true); }, [location.state]);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const selected = requests.find((request) => Number(request.id) === Number(selectedId)) || null;
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return requests.filter((request) => !value || [request.subject, request.status, request.equipment_name, request.work_center_name].some((field) => String(field || '').toLowerCase().includes(value)));
  }, [query, requests]);
  const targetOptions = useMemo(() => [{ value: '', label: form.targetType === 'equipment' ? 'Select equipment' : 'Select work center' }, ...(form.targetType === 'equipment' ? equipment : workCenters).map((item) => ({ value: String(item.id), label: item.serial_number ? `${item.name} / ${item.serial_number}` : item.name }))], [equipment, form.targetType, workCenters]);

  const close = () => { setOpen(false); setForm(initialForm); setFormError(''); };
  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!form.subject.trim()) return setFormError('Tell us what needs attention.');
    if (!form.targetId) return setFormError(`Select ${form.targetType === 'equipment' ? 'an equipment item' : 'a work center'}.`);
    if (form.type === 'preventive' && !form.scheduledDate) return setFormError('Choose a preferred date for a preventive request.');
    setSaving(true);
    try {
      const response = await api.post('/maintenance', { type: form.type, subject: form.subject.trim(), equipment_id: form.targetType === 'equipment' ? Number(form.targetId) : null, work_center_id: form.targetType === 'work-center' ? Number(form.targetId) : null, scheduled_date: form.scheduledDate || null });
      close();
      await load();
      setSelectedId(response?.data?.data?.id || null);
    } catch (err) { setFormError(err?.response?.data?.message || 'Failed to create request'); }
    finally { setSaving(false); }
  };

  // A scrapped request never reaches "Repaired", so it ends the tracker at the
  // last step rather than falling back to step 0 and looking newly submitted.
  const selectedStatus = selected ? statusKey(selected.status) : 'new';
  const isScrapped = selectedStatus === 'scrap';
  const currentStep = isScrapped
    ? progressSteps.length - 1
    : Math.max(0, progressSteps.indexOf(selectedStatus));

  return <div className="container manager-page user-requests-workspace">
    <PageHeader eyebrow="Requester workspace" title="My requests" description="Report an issue and follow every update without internal maintenance complexity." actions={<><Button onClick={() => setOpen(true)}>New request</Button><Button variant="secondary" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button></>} />
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <div className="user-request-workspace-grid">
      <Panel eyebrow="My history" title={`${requests.length} requests`} className="user-request-list-panel" action={<label className="user-request-search"><span className="sr-only">Search requests</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label>}>
        {filtered.length === 0 ? <EmptyState compact tone={query ? 'search' : 'selection'} title={query ? 'No matching requests' : 'Nothing submitted yet'} description={query ? 'Try a different search.' : 'Create your first request to begin tracking it.'} /> : <div className="user-request-cards">{filtered.map((request) => <button type="button" key={request.id} className={`user-request-card ${Number(selectedId) === Number(request.id) ? 'is-selected' : ''}`} onClick={() => setSelectedId(request.id)}><div><strong>{request.subject}</strong><span>{request.equipment_name || request.work_center_name || 'No target'}</span></div><StatusBadge status={request.status} /><time>{formatTimestampDate(request.created_at)}</time></button>)}</div>}
      </Panel>
      <Panel eyebrow="Request details" title={selected?.subject || 'Select a request'} className="user-request-detail-panel">
        {!selected ? <EmptyState tone="selection" title="Choose a request" description="Select an item from your history to see its progress." /> : <div className="user-request-detail"><div className="user-request-progress">{progressSteps.map((step, index) => <div key={step} className={`${index <= currentStep ? 'is-complete' : ''} ${index === currentStep ? 'is-current' : ''}`}><span>{index < currentStep ? '✓' : index + 1}</span><strong>{step === 'new' ? 'Submitted' : step === 'in_progress' ? 'In progress' : isScrapped ? 'Scrapped' : 'Resolved'}</strong></div>)}</div><dl><div><dt>Status</dt><dd><StatusBadge status={selected.status} /></dd></div><div><dt>Maintenance for</dt><dd>{selected.equipment_name || selected.work_center_name || 'Not specified'}</dd></div><div><dt>Type</dt><dd>{selected.type === 'preventive' ? 'Routine checkup' : 'Breakdown'}</dd></div><div><dt>Assigned technician</dt><dd>{selected.assigned_to_name || 'Waiting for assignment'}</dd></div><div><dt>Scheduled date</dt><dd>{formatDateOnly(selected.scheduled_date, 'Not scheduled')}</dd></div><div><dt>Submitted</dt><dd>{formatTimestamp(selected.created_at)}</dd></div></dl></div>}
      </Panel>
    </div>
    {open && createPortal(<div className="user-request-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="user-request-modal" role="dialog" aria-modal="true" aria-labelledby="user-request-modal-title"><header><div><p className="gg-eyebrow">New maintenance request</p><h2 id="user-request-modal-title">What needs attention?</h2></div><button type="button" onClick={close} aria-label="Close">×</button></header><form onSubmit={submit}>{formError && <div className="alert alert-error" role="alert">{formError}</div>}<label className="gg-field"><span className="gg-field__label">Describe the issue</span><input className="gg-input" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="e.g. Printer is making a grinding noise" autoFocus /></label><fieldset><legend>Request type</legend><label><input type="radio" checked={form.type === 'corrective'} onChange={() => setForm((current) => ({ ...current, type: 'corrective', scheduledDate: '' }))} /> Breakdown</label><label><input type="radio" checked={form.type === 'preventive'} onChange={() => setForm((current) => ({ ...current, type: 'preventive' }))} /> Routine checkup</label></fieldset><fieldset><legend>Maintenance target</legend><label><input type="radio" checked={form.targetType === 'equipment'} onChange={() => setForm((current) => ({ ...current, targetType: 'equipment', targetId: '' }))} /> Equipment</label><label><input type="radio" checked={form.targetType === 'work-center'} onChange={() => setForm((current) => ({ ...current, targetType: 'work-center', targetId: '' }))} /> Work center</label></fieldset><label className="gg-field"><span className="gg-field__label">Choose {form.targetType === 'equipment' ? 'equipment' : 'work center'}</span><SelectMenu portal value={form.targetId} options={targetOptions} onChange={(targetId) => setForm((current) => ({ ...current, targetId }))} ariaLabel="Choose maintenance target" /></label>{form.type === 'preventive' && <label className="gg-field"><span className="gg-field__label">Preferred date</span><input type="date" className="gg-input" value={form.scheduledDate} onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))} /></label>}<footer><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" pending={saving} pendingLabel="Submitting...">Submit request</Button></footer></form></section></div>, document.body)}
  </div>;
}
