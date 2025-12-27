import React, { useMemo, useState } from 'react';

export default function Teams() {
    const [showForm, setShowForm] = useState(false);

    const [rows, setRows] = useState([
        { id: 1, name: 'Internal Maintenance', members: 'Anas Makari', company: 'My Company (San Francisco)' },
        { id: 2, name: 'Metrology', members: 'Marc Demo', company: 'My Company (San Francisco)' },
        { id: 3, name: 'Subcontractor', members: 'Maggie Davidson', company: 'My Company (San Francisco)' },
    ]);

    const [form, setForm] = useState({
        name: '',
        members: '',
        company: 'My Company (San Francisco)',
    });

    function openNew() {
        setForm({ name: '', members: '', company: 'My Company (San Francisco)' });
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

        const newRow = {
            id: Date.now(),
            name: form.name.trim(),
            members: form.members.trim(),
            company: form.company.trim(),
        };

        setRows((prev) => [newRow, ...prev]);
        setShowForm(false);
    }

    return (
        <div className="container">
            <div className="page-header">
                <div>
                    <h1>Teams</h1>
                    <p className="muted">Manage maintenance teams and members.</p>
                </div>

                <button className="btn-secondary" type="button" onClick={openNew}>
                    New
                </button>

            </div>

            <div className="teams-table-wrap">
                <table className="teams-table">
                    <thead>
                        <tr>
                            <th scope="col">Team Name</th>
                            <th scope="col">Team Members</th>
                            <th scope="col">Company</th>
                        </tr>
                    </thead>

                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id}>
                                <td>{r.name}</td>
                                <td>{r.members}</td>
                                <td>{r.company}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <div className="modal-overlay" onMouseDown={closeNew}>
                    <div className="equipment-modal" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="equipment-modal-top">
                            <h2 className="equipment-modal-title">New Team</h2>

                            <div className="equipment-modal-actions">
                                <button className="btn-secondary" type="button" onClick={closeNew}>
                                    Cancel
                                </button>
                                <button className="btn-accent" type="submit" form="teamForm">
                                    Submit
                                </button>
                            </div>
                        </div>

                        <form id="teamForm" className="equipment-form" onSubmit={onSubmit}>
                            <div className="equipment-form-grid">
                                <div className="field">
                                    <label>Team Name *</label>
                                    <input
                                        className="modal-input"
                                        name="name"
                                        value={form.name}
                                        onChange={onChange}
                                        required
                                        placeholder="e.g., Internal Maintenance"
                                    />
                                </div>

                                <div className="field">
                                    <label>Company *</label>
                                    <input
                                        className="modal-input"
                                        name="company"
                                        value={form.company}
                                        onChange={onChange}
                                        required
                                        placeholder="e.g., My Company (San Francisco)"
                                    />
                                </div>

                                <div className="field field-wide">
                                    <label>Team Members *</label>
                                    <input
                                        className="modal-input"
                                        name="members"
                                        value={form.members}
                                        onChange={onChange}
                                        required
                                        placeholder="e.g., Marc Demo, Maggie Davidson"
                                    />
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
