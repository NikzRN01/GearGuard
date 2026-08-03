import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { getSessionUser } from '../services/session';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import { equipmentRequestsPath } from '../services/workload';

const emptyForm = { name: '', serial_number: '', category: '', department: '', assigned_employee_name: '', location: '', maintenance_team_id: '', status: 'active' };

export default function MachineTools() {
    const navigate = useNavigate();
    const canManage = ['manager', 'admin'].includes(getSessionUser()?.role);
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    const loadEquipment = async () => {
        setError(''); setLoading(true);
        try { const { data } = await api.get('/equipment'); setRows(data?.data || []); }
        catch (e) { setError(e?.response?.data?.message || 'Failed to load equipment'); }
        finally { setLoading(false); }
    };

    // canManage is derived from the session and does not change while mounted,
    // so listing it costs nothing and keeps the dependency list truthful.
    useEffect(() => {
        loadEquipment();
        if (canManage) api.get('/teams').then(({ data }) => setTeams(data?.data || [])).catch(() => setTeams([]));
    }, [canManage]);

    useEffect(() => {
        if (!editing) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [editing]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) => [row.name, row.assigned_employee_name, row.department, row.serial_number, row.team_name, row.category, row.location].join(' ').toLowerCase().includes(q));
    }, [query, rows]);

    const openCreate = () => { setForm(emptyForm); setFormError(''); setEditing({ mode: 'create' }); };
    const openEdit = (row) => {
        setForm({ ...emptyForm, ...row, maintenance_team_id: row.maintenance_team_id ? String(row.maintenance_team_id) : '' });
        setFormError(''); setEditing({ mode: 'edit', id: row.id });
    };
    const saveEquipment = async (event) => {
        event.preventDefault(); setSaving(true); setFormError('');
        const payload = { ...form, name: form.name.trim(), serial_number: form.serial_number.trim(), maintenance_team_id: form.maintenance_team_id ? Number(form.maintenance_team_id) : null };
        try {
            if (editing.mode === 'create') await api.post('/equipment', payload);
            else await api.put(`/equipment/${editing.id}`, payload);
            setEditing(null); await loadEquipment();
        } catch (err) { setFormError(err?.response?.data?.message || 'Unable to save equipment.'); }
        finally { setSaving(false); }
    };
    const deleteEquipment = async (row) => {
        if (!window.confirm(`Delete ${row.name}? Equipment linked to requests cannot be deleted.`)) return;
        setError('');
        try { await api.delete(`/equipment/${row.id}`); await loadEquipment(); }
        catch (err) { setError(err?.response?.data?.message || 'Unable to delete equipment.'); }
    };

    return <div className="container manager-page manager-equipment-page">
        <PageHeader eyebrow={getSessionUser()?.role === 'admin' ? 'Admin operations' : canManage ? 'Manager workspace' : 'Operations reference'} title="Equipment" description={canManage ? 'Manage equipment and open related maintenance requests.' : 'Review the equipment register.'} actions={<div className="manager-equipment-actions"><input className="manager-equipment-search" type="search" placeholder="Search equipment" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search equipment" />{canManage && <Button onClick={openCreate}>Add equipment</Button>}</div>} />
        {error && <Alert tone="danger" title="Equipment action failed" action={<Button variant="secondary" size="small" onClick={loadEquipment}>Try again</Button>}>{error}</Alert>}
        {!error && <Panel eyebrow="Equipment register" title={`${filtered.length} equipment records`} ariaLabel="Equipment register">
            {loading ? <div className="manager-state" role="status">Loading equipment...</div> : filtered.length === 0 ? <EmptyState tone={query ? 'search' : 'neutral'} title={query ? 'No matching equipment' : 'No equipment found'} description={query ? 'Change or clear the search to see other equipment.' : 'Equipment records will appear here when available.'} /> : <div className="table-wrap"><table className="table manager-equipment-table"><thead><tr><th>Equipment Name</th><th>Employee</th><th>Department</th><th>Serial Number</th><th>Team</th><th>Category</th><th>Location</th>{canManage && <th className="manager-equipment-actions-heading">Actions</th>}</tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><th>{canManage ? <button type="button" className="manager-table-link" onClick={() => navigate(equipmentRequestsPath(row.id))}>{row.name}</button> : row.name}</th><td>{row.assigned_employee_name || '-'}</td><td>{row.department || '-'}</td><td>{row.serial_number || '-'}</td><td>{row.team_name || '-'}</td><td>{row.category || '-'}</td><td>{row.location || '-'}</td>{canManage && <td className="manager-equipment-action-cell"><div className="manager-inline-actions"><Button variant="tertiary" size="small" onClick={() => openEdit(row)}>Edit</Button><Button variant="danger" size="small" onClick={() => deleteEquipment(row)}>Delete</Button></div></td>}</tr>)}</tbody></table></div>}
        </Panel>}
        {editing && createPortal(<div className="modal-overlay" onMouseDown={() => !saving && setEditing(null)}><div className="modal-content manager-equipment-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-form-title" onMouseDown={(event) => event.stopPropagation()}><h3 id="equipment-form-title">{editing.mode === 'create' ? 'Add equipment' : 'Edit equipment'}</h3><p>{editing.mode === 'create' ? 'Create a maintainable asset record.' : 'Update this asset record.'}</p><form onSubmit={saveEquipment}>
            <div className="signup-grid"><div className="input-group"><label>Name *</label><input className="modal-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div className="input-group"><label>Serial number *</label><input className="modal-input" required value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div></div>
            <div className="signup-grid"><div className="input-group"><label>Category</label><input className="modal-input" value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div><div className="input-group"><label>Department</label><input className="modal-input" value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div></div>
            <div className="signup-grid"><div className="input-group"><label>Assigned employee</label><input className="modal-input" value={form.assigned_employee_name || ''} onChange={(e) => setForm({ ...form, assigned_employee_name: e.target.value })} /></div><div className="input-group"><label>Location</label><input className="modal-input" value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div></div>
            <div className="signup-grid"><div className="input-group"><label>Maintenance team</label><select className="modal-input" value={form.maintenance_team_id} onChange={(e) => setForm({ ...form, maintenance_team_id: e.target.value })}><option value="">No team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div><div className="input-group"><label>Status</label><select className="modal-input" value={form.status || 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div>
            {formError && <Alert tone="danger" title="Equipment could not be saved">{formError}</Alert>}<div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button type="submit" pending={saving} pendingLabel="Saving...">{editing.mode === 'create' ? 'Add equipment' : 'Save changes'}</Button></div>
        </form></div></div>, document.body)}
    </div>;
}
