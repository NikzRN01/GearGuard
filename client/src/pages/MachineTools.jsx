import React, { useMemo, useState } from 'react';

export default function MachineTools() {
    const [query, setQuery] = useState('');

    const [rows, setRows] = useState([
        {
            id: 1,
            name: 'Samsung Monitor 15"',
            employee: 'Tejas Modi',
            department: 'Admin',
            serial: 'MT/125/22778837',
            technician: 'Mitchell Admin',
            category: 'Monitors',
            company: 'My Company (San Francisco)',
        },
        {
            id: 2,
            name: 'Acer Laptop',
            employee: 'Bhaumik P',
            department: 'Technician',
            serial: 'MT/122/11112222',
            technician: 'Marc Demo',
            category: 'Computers',
            company: 'My Company (San Francisco)',
        },
    ]);

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

        const newRow = {
            id: Date.now(),
            name: form.name || '(Unnamed)',
            employee: form.employee || '-',
            department: form.department || '-',
            serial: form.serial || '-',
            technician: form.technician || '-',
            category: form.category || '-',
            company: form.company || '-',
        };

        setRows((prev) => [newRow, ...prev]);
        setShowForm(false);
    }


    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) =>
            [
                r.name,
                r.employee,
                r.department,
                r.serial,
                r.technician,
                r.category,
                r.company,
            ]
                .join(' ')
                .toLowerCase()
                .includes(q)
        );
    }, [query, rows]);

    return (
        <div className="container">
            <div className="list-toolbar">
                <h1 className="list-title">Equipment</h1>

                <div className="list-search">
                    <input
                        className="list-search-input"
                        type="search"
                        placeholder="Search..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>

                <button className="btn-secondary list-new-btn btn-accent" type="button" onClick={openNew}>
                    New
                </button>

            </div>


            <div className="list-table-wrap">
                <table className="list-table">
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
                            <tr key={r.id}>
                                <td>{r.name}</td>
                                <td>{r.employee}</td>
                                <td>{r.department}</td>
                                <td>{r.serial}</td>
                                <td>{r.technician}</td>
                                <td>{r.category}</td>
                                <td>{r.company}</td>
                            </tr>
                        ))}

                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={7} className="list-empty">
                                    No equipment found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showForm && (
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
                </div>
            )}

        </div>
    );
}
