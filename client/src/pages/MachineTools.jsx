import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';


export default function MachineTools() {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const loadEquipment = async () => {
        setError('');
        setLoading(true);
        try {
            const { data } = await api.get('/equipment');
            setRows(data?.data || []);
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to load equipment');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEquipment();
    }, []);

    const [showForm, setShowForm] = useState(false);

    const [form, setForm] = useState({
        name: '',
        category: '',
        company: 'My Company (San Francisco)',
        usedBy: 'Employee',
        maintenanceTeam: '',
        assignedDate: '',
        technician: '',
        employee: '',
        scrapDate: '',
        location: '',
        workCenter: '',
        department: '',
        serial: '',
        description: '',
    });

    function openNew() {
        setForm((prev) => ({
            ...prev,
            name: '',
            category: '',
            maintenanceTeam: '',
            assignedDate: '',
            technician: '',
            employee: '',
            scrapDate: '',
            location: '',
            workCenter: '',
            department: '',
            serial: '',
            description: '',
        }));
        setShowForm(true);
    }

    function closeNew() {
        setShowForm(false);
    }

    function onChange(e) {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    }

    function onSubmit(e) {
        e.preventDefault();

        // Keep this modal purely UI-only for now; refresh from backend to stay consistent.
        setShowForm(false);
        loadEquipment();
    }


    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) =>
            [
                r.name,
                r.assigned_employee_name,
                r.department,
                r.serial_number,
                r.team_name,
                r.category,
                r.location,
            ]
                .join(' ')
                .toLowerCase()
                .includes(q)
        );
    }, [query, rows]);

    return (
        <div className="container">
            <div className="page-header">
                <div>
                    <h1>Equipment</h1>
                    <p className="muted">Manage equipment and assignments.</p>
                </div>

                <div className="page-actions">
                    <input
                        className="modal-input page-control page-control-md"
                        type="search"
                        placeholder="Search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search equipment"
                    />

                    <button className="btn-accent" type="button" onClick={openNew}>
                        New
                    </button>
                </div>
            </div>

            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th scope="col">Equipment Name</th>
                            <th scope="col">Employee</th>
                            <th scope="col">Department</th>
                            <th scope="col">Serial Number</th>
                            <th scope="col">Technician</th>
                            <th scope="col">Equipment Category</th>
                            <th scope="col">Company</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filtered.map((r) => (
                            <tr
                                key={r.id}
                                className="table-row-click"
                                onClick={() => navigate(`/app/requests?equipment_id=${r.id}`)}
                                title="Open related requests"
                            >
                                <td style={{ color: 'var(--accent2)', fontWeight: 600 }}>{r.name}</td>
                                <td>{r.assigned_employee_name || '-'}</td>
                                <td>{r.department || '-'}</td>
                                <td>{r.serial_number || '-'}</td>
                                <td>{r.team_name || '-'}</td>
                                <td>{r.category || '-'}</td>
                                <td>{r.location || '-'}</td>
                            </tr>
                        ))}

                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={7} className="table-empty">
                                    {loading ? 'Loading…' : 'No equipment found.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {error && (
                <div className="alert alert-error" style={{ marginTop: 12 }}>
                    {error}
                </div>
            )}

            {showForm &&
                createPortal(
                    <div className="modal-overlay" onMouseDown={closeNew}>
                        <div className="equipment-modal" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="equipment-modal-top">
                                <h2 className="equipment-modal-title">Equipment</h2>

                                <div className="equipment-modal-actions">
                                    <button className="btn-secondary" type="button" onClick={closeNew}>
                                        Cancel
                                    </button>
                                    <button className="btn-accent" type="submit" form="equipmentForm">
                                        Submit
                                    </button>
                                </div>
                            </div>

                            <form id="equipmentForm" className="equipment-form" onSubmit={onSubmit}>
                                <div className="equipment-form-grid">
                                    <div className="field">
                                        <label>Name </label>
                                        <input name="name" value={form.name} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field">
                                        <label>Technician </label>
                                        <input name="technician" value={form.technician} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field">
                                        <label>Equipment Category </label>
                                        <input name="category" value={form.category} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field">
                                        <label>Employee </label>
                                        <input name="employee" value={form.employee} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field">
                                        <label>Company </label>
                                        <input name="company" value={form.company} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field">
                                        <label>Scrap Date </label>
                                        <input name="scrapDate" value={form.scrapDate} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field">
                                        <label>Used in location </label>
                                        <input name="location" value={form.location} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field">
                                        <label>Work Center </label>
                                        <input name="workCenter" value={form.workCenter} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field">
                                        <label>Department</label>
                                        <input name="department" value={form.department} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field">
                                        <label>Serial Number</label>
                                        <input name="serial" value={form.serial} onChange={onChange} className="modal-input" />
                                    </div>

                                    <div className="field field-wide">
                                        <label>Description</label>
                                        <input name="description" value={form.description} onChange={onChange} className="modal-input" />
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}

        </div>
    );
}
