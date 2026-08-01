import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import { getSessionUser } from '../services/session';

export default function WorkCenter() {
    const currentUser = getSessionUser();
    const canManage = ['manager', 'admin'].includes(currentUser?.role);
    const [rows, setRows] = useState([]);
    const [altMap, setAltMap] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');
    const [form, setForm] = useState({
        name: '',
        code: '',
        tag: '',
        cost_per_hour: '0',
        capacity_per_hour: '0',
        time_efficiency_pct: '100',
        oee_target_pct: '0',
        alternative_ids: []
    });

    const load = async () => {
        setError('');
        setLoading(true);
        try {
            const { data } = await api.get('/work-centers');
            const list = data?.data || [];
            setRows(list);

            // Load alternatives for display (server list endpoint doesn't include them).
            const pairs = await Promise.all(
                list.map(async (wc) => {
                    try {
                        const resp = await api.get(`/work-centers/${wc.id}/alternatives`);
                        return [wc.id, resp?.data?.data || []];
                    } catch {
                        return [wc.id, []];
                    }
                })
            );
            setAltMap(Object.fromEntries(pairs));
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to load work centers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const openNew = () => {
        setEditingId(null);
        setFormError('');
        setFormSuccess('');
        setForm({
            name: '',
            code: '',
            tag: '',
            cost_per_hour: '0',
            capacity_per_hour: '0',
            time_efficiency_pct: '100',
            oee_target_pct: '0',
            alternative_ids: []
        });
        setShowNew(true);
    };

    const openEdit = (wc) => {
        setEditingId(wc.id);
        setFormError(''); setFormSuccess('');
        setForm({
            name: wc.name || '', code: wc.code || '', tag: wc.tag || '',
            cost_per_hour: String(wc.cost_per_hour ?? 0), capacity_per_hour: String(wc.capacity_per_hour ?? 0),
            time_efficiency_pct: String(wc.time_efficiency_pct ?? 100), oee_target_pct: String(wc.oee_target_pct ?? 0),
            alternative_ids: (altMap[wc.id] || []).map((item) => String(item.alt_id))
        });
        setShowNew(true);
    };

    const closeNew = () => {
        setShowNew(false);
        setFormError('');
        setFormSuccess('');
    };

    const updateForm = (key, value) => setForm((f) => ({ ...f, [key]: value }));

    const validateForm = () => {
        const errs = [];
        if (!form.name.trim()) errs.push('Work Center name is required');
        const num = (v) => Number(v);
        if (Number.isNaN(num(form.cost_per_hour)) || num(form.cost_per_hour) < 0) errs.push('Cost per hour must be >= 0');
        if (Number.isNaN(num(form.capacity_per_hour)) || num(form.capacity_per_hour) < 0) errs.push('Capacity must be >= 0');
        if (Number.isNaN(num(form.time_efficiency_pct)) || num(form.time_efficiency_pct) < 0 || num(form.time_efficiency_pct) > 100) {
            errs.push('Time Efficiency must be between 0 and 100');
        }
        if (Number.isNaN(num(form.oee_target_pct)) || num(form.oee_target_pct) < 0 || num(form.oee_target_pct) > 100) {
            errs.push('OEE Target must be between 0 and 100');
        }
        return errs;
    };

    const submitNew = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormSuccess('');
        const errs = validateForm();
        if (errs.length) {
            setFormError(errs.join('\n'));
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                code: form.code.trim() || null,
                tag: form.tag.trim() || null,
                cost_per_hour: Number(form.cost_per_hour),
                capacity_per_hour: Number(form.capacity_per_hour),
                time_efficiency_pct: Number(form.time_efficiency_pct),
                oee_target_pct: Number(form.oee_target_pct),
                status: 'active'
            };
            const { data } = editingId ? await api.put(`/work-centers/${editingId}`, payload) : await api.post('/work-centers', payload);
            if (data?.success) {
                const newId = editingId || data?.data?.id;
                const selectedAltIds = Array.from(new Set(form.alternative_ids || []))
                    .map((v) => Number(v))
                    .filter((n) => Number.isFinite(n));

                if (editingId) {
                    const existing = altMap[editingId] || [];
                    const currentIds = existing.map((item) => Number(item.alt_id));
                    await Promise.all(existing.filter((item) => !selectedAltIds.includes(Number(item.alt_id))).map((item) => api.delete(`/work-centers/${editingId}/alternatives/${item.id}`)));
                    await Promise.all(selectedAltIds.filter((id) => !currentIds.includes(id)).map((id) => api.post(`/work-centers/${editingId}/alternatives`, { alternative_work_center_id: id })));
                } else if (newId && selectedAltIds.length) {
                    await Promise.all(selectedAltIds.map((altId) => api.post(`/work-centers/${newId}/alternatives`, { alternative_work_center_id: altId })));
                }

                setFormSuccess(editingId ? 'Work center updated successfully' : 'Work center created successfully');
                await load();
                setTimeout(() => closeNew(), 600);
            } else {
                setFormError(data?.message || 'Create failed');
            }
        } catch (err) {
            setFormError(err?.response?.data?.message || 'Create failed');
        } finally {
            setSaving(false);
        }
    };

    const deactivate = async (wc) => {
        if (!window.confirm(`Deactivate ${wc.name}?`)) return;
        setError('');
        try { await api.delete(`/work-centers/${wc.id}`); await load(); }
        catch (err) { setError(err?.response?.data?.message || 'Unable to deactivate work center.'); }
    };

    return (
        <div className="container manager-page manager-workcenter-page">
            <PageHeader eyebrow={currentUser?.role === 'admin' ? 'Admin operations' : canManage ? 'Manager workspace' : 'Operations reference'} title="Work centers" description={canManage ? 'Manage operational work centers, capacity settings, and alternatives.' : 'Review operational work centers and capacity settings.'} actions={<>{canManage && <Button onClick={openNew}>Add work center</Button>}<Button variant="secondary" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button></>} />

            {error && <Alert tone="danger" title="Work centers could not be loaded" action={<Button variant="secondary" size="small" onClick={load}>Try again</Button>}>{error}</Alert>}

            {!error && <Panel eyebrow="Operations" title={`${rows.length} work centers`} ariaLabel="Work centers">
                {loading ? <div className="manager-state" role="status">Loading work centers...</div> : rows.length === 0 ? <EmptyState title="No work centers yet" description="Create the first work center to make it available in maintenance workflows." action={canManage ? <Button onClick={openNew}>Add work center</Button> : null} /> : <div className="table-wrap">
                <table className="table manager-workcenter-table">
                    <thead>
                        <tr>
                            <th>Work Center</th>
                            <th>Code</th>
                            <th>Tag</th>
                            <th>Alternative Workcenters</th>
                            <th className="manager-number-cell">Cost per hour</th>
                            <th className="manager-number-cell">Capacity</th>
                            <th className="manager-number-cell">Time efficiency</th>
                            <th className="manager-number-cell">OEE target</th>
                            {canManage && <th>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((wc) => (
                            <tr key={wc.id}>
                                <th scope="row" data-label="Work center">{wc.name}</th>
                                <td data-label="Code">{wc.code || '-'}</td>
                                <td data-label="Tag">{wc.tag || '-'}</td>
                                <td data-label="Alternative work centers">
                                    {(altMap[wc.id] || []).length
                                        ? (altMap[wc.id] || []).map((a) => a.alt_name).join(', ')
                                        : '-'}
                                </td>
                                <td data-label="Cost per hour" className="manager-number-cell">{Number(wc.cost_per_hour ?? 0).toFixed(2)}</td>
                                <td data-label="Capacity" className="manager-number-cell">{Number(wc.capacity_per_hour ?? 0).toFixed(2)}</td>
                                <td data-label="Time efficiency" className="manager-number-cell">{Number(wc.time_efficiency_pct ?? 100).toFixed(2)}%</td>
                                <td data-label="OEE target" className="manager-number-cell">{Number(wc.oee_target_pct ?? 0).toFixed(2)}%</td>
                                {canManage && <td data-label="Actions"><div className="manager-inline-actions"><Button variant="tertiary" size="small" onClick={() => openEdit(wc)}>Edit</Button><Button variant="danger" size="small" onClick={() => deactivate(wc)}>Deactivate</Button></div></td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>}
            </Panel>}

            {showNew &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div className="modal-overlay manager-workcenter-overlay" role="dialog" aria-modal="true" aria-label="Create work center">
                        <div className="modal-content manager-workcenter-modal">
                            <h3>{editingId ? 'Edit Work Center' : 'Create Work Center'}</h3>
                            <p>{editingId ? 'Update operational values and alternative work centers.' : 'Add the operational values used when planning and assigning maintenance work.'}</p>
                            <form onSubmit={submitNew}>
                                <div className="input-group">
                                    <label>Work Center Name</label>
                                    <input
                                        className="modal-input"
                                        value={form.name}
                                        onChange={(e) => updateForm('name', e.target.value)}
                                        placeholder="Assembly 1"
                                    />
                                </div>

                                <div className="signup-grid">
                                    <div className="input-group">
                                        <label>Code</label>
                                        <input
                                            className="modal-input"
                                            value={form.code}
                                            onChange={(e) => updateForm('code', e.target.value)}
                                            placeholder="WC-ASM-1"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Tag</label>
                                        <input
                                            className="modal-input"
                                            value={form.tag}
                                            onChange={(e) => updateForm('tag', e.target.value)}
                                            placeholder="assembly"
                                        />
                                    </div>
                                </div>

                                <div className="signup-grid">
                                    <div className="input-group">
                                        <label>Cost per hour</label>
                                        <input
                                            className="modal-input"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={form.cost_per_hour}
                                            onChange={(e) => updateForm('cost_per_hour', e.target.value)}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Capacity</label>
                                        <input
                                            className="modal-input"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={form.capacity_per_hour}
                                            onChange={(e) => updateForm('capacity_per_hour', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="signup-grid">
                                    <div className="input-group">
                                        <label>Time Efficiency (%)</label>
                                        <input
                                            className="modal-input"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            value={form.time_efficiency_pct}
                                            onChange={(e) => updateForm('time_efficiency_pct', e.target.value)}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>OEE Target (%)</label>
                                        <input
                                            className="modal-input"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            value={form.oee_target_pct}
                                            onChange={(e) => updateForm('oee_target_pct', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label>Alternative Workcenters</label>
                                    {rows.length === 0 ? <p className="manager-field-hint">No existing work centers are available as alternatives.</p> : <select
                                            className="modal-input manager-multi-select"
                                            multiple
                                            value={form.alternative_ids}
                                            onChange={(e) => {
                                                const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                                                updateForm('alternative_ids', selected);
                                            }}
                                        >
                                            {rows.filter((wc) => wc.id !== editingId).map((wc) => (
                                                <option key={wc.id} value={String(wc.id)}>
                                                    {wc.name}{wc.code ? ` (${wc.code})` : ''}
                                                </option>
                                            ))}
                                        </select>}
                                </div>

                                {formError && (
                                    <Alert tone="danger" title="Check the form"><span className="manager-pre-line">{formError}</span></Alert>
                                )}
                                {formSuccess && (
                                    <Alert tone="success">{formSuccess}</Alert>
                                )}

                                <div className="modal-actions manager-workcenter-modal-actions">
                                    <Button type="button" variant="secondary" onClick={closeNew} disabled={saving}>Cancel</Button>
                                    <Button type="submit" pending={saving} pendingLabel="Saving...">{editingId ? 'Save changes' : 'Create work center'}</Button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
