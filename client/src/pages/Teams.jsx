<<<<<<< HEAD
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
=======
import React, { useState } from 'react';
>>>>>>> cc0b8745e139c3e64b7eee205506beefdf0eafed

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

                <div className="page-actions">
                    <button className="btn-accent" type="button" onClick={openNew}>
                        New
                    </button>
                </div>
            </div>

            <div className="table-wrap">
                <table className="table" style={{ minWidth: 720 }}>
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

            {showForm && 
                createPortal(
                <div className="modal-overlay" onMouseDown={closeNew}>
                    <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <h3>New Team</h3>
                        <p>Create a maintenance team.</p>

                        <form id="teamForm" onSubmit={onSubmit}>
                            <div className="input-group">
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

                            <div className="input-group">
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

                            <div className="input-group">
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

                            <div className="modal-actions">
                                <button className="btn-secondary" type="button" onClick={closeNew}>
                                    Cancel
                                </button>
                                <button className="btn-accent" type="submit">
                                    Submit
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
