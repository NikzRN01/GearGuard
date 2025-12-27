import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';

export default function WorkCenter() {
    const [rows, setRows] = useState([]);
    const [altMap, setAltMap] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showNew, setShowNew] = useState(false);
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
            const { data } = await api.post('/work-centers', payload);
            if (data?.success) {
                const newId = data?.data?.id;
                const selectedAltIds = Array.from(new Set(form.alternative_ids || []))
                    .map((v) => Number(v))
                    .filter((n) => Number.isFinite(n));

                if (newId && selectedAltIds.length) {
                    await Promise.all(
                        selectedAltIds.map((altId) =>
                            api.post(`/work-centers/${newId}/alternatives`, { alternative_work_center_id: altId })
                        )
                    );
                }

                setFormSuccess('Work center created successfully');
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

    return (
        <div className="container">
            <div className="page-header">
                <div>
                    <h1>Work Center</h1>
                    <p className="muted">Work center list view</p>
                </div>
                <div className="page-actions">
                    <button type="button" className="btn-accent" onClick={openNew}>
                        New
                    </button>
                    <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-error animate-shake" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Work Center</th>
                            <th>Code</th>
                            <th>Tag</th>
                            <th>Alternative Workcenters</th>
                            <th style={{ textAlign: 'right' }}>Cost per hour</th>
                            <th style={{ textAlign: 'right' }}>Capacity</th>
                            <th style={{ textAlign: 'right' }}>Time Efficiency</th>
                            <th style={{ textAlign: 'right' }}>OEE Target</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!loading && rows.length === 0 && (
                            <tr>
                                <td colSpan={8} className="table-empty">No work centers yet.</td>
                            </tr>
                        )}
                        {rows.map((wc) => (
                            <tr key={wc.id}>
                                <td>{wc.name}</td>
                                <td>{wc.code || '-'}</td>
                                <td>{wc.tag || '-'}</td>
                                <td className="muted">
                                    {(altMap[wc.id] || []).length
                                        ? (altMap[wc.id] || []).map((a) => a.alt_name).join(', ')
                                        : '-'}
                                </td>
                                <td style={{ textAlign: 'right' }}>{Number(wc.cost_per_hour ?? 0).toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>{Number(wc.capacity_per_hour ?? 0).toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>{Number(wc.time_efficiency_pct ?? 100).toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>{Number(wc.oee_target_pct ?? 0).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showNew &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Create work center">
                        <div className="modal-content" style={{ maxWidth: 520 }}>
                            <h3>Create Work Center</h3>
                            <p>Must create a work center proper form view with respective fields used in maintenance requests.</p>
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

                                <div className="signup-grid" style={{ marginTop: 12 }}>
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

                                <div className="signup-grid" style={{ marginTop: 12 }}>
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

                                <div className="signup-grid" style={{ marginTop: 12 }}>
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

                                <div className="input-group" style={{ marginTop: 12 }}>
                                    <label>Alternative Workcenters</label>
                                    <select
                                        className="modal-input"
                                        multiple
                                        value={form.alternative_ids}
                                        onChange={(e) => {
                                            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                                            updateForm('alternative_ids', selected);
                                        }}
                                        style={{ height: 120, paddingTop: 10, paddingBottom: 10 }}
                                    >
                                        {rows.map((wc) => (
                                            <option key={wc.id} value={String(wc.id)}>
                                                {wc.name}{wc.code ? ` (${wc.code})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {formError && (
                                    <div
                                        className="alert alert-error animate-shake"
                                        style={{ marginTop: 12, whiteSpace: 'pre-line' }}
                                    >
                                        {formError}
                                    </div>
                                )}
                                {formSuccess && (
                                    <div className="alert alert-success" style={{ marginTop: 12 }}>
                                        {formSuccess}
                                    </div>
                                )}

                                <div className="modal-actions" style={{ marginTop: 16 }}>
                                    <button type="button" className="btn-secondary" onClick={closeNew} disabled={saving}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-accent" disabled={saving}>
                                        {saving && <span className="spinner" />} Create
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
