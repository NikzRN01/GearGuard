import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';


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
        <div className="container manager-page manager-equipment-page">
            <PageHeader
                eyebrow="Manager workspace"
                title="Equipment"
                description="Review equipment and open its related maintenance requests."
                actions={<div className="manager-equipment-actions">
                    <input
                        className="manager-equipment-search"
                        type="search"
                        placeholder="Search equipment"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search equipment"
                    />

                    <span className="manager-unavailable-action">Creation unavailable</span>
                </div>}
            />

            {error && <Alert tone="danger" title="Equipment could not be loaded" action={<Button variant="secondary" size="small" onClick={loadEquipment}>Try again</Button>}>{error}</Alert>}

            {!error && <Panel eyebrow="Equipment register" title={`${filtered.length} equipment records`} ariaLabel="Equipment register">
                {loading ? <div className="manager-state" role="status">Loading equipment...</div> : filtered.length === 0 ? <EmptyState tone={query ? 'search' : 'neutral'} title={query ? 'No matching equipment' : 'No equipment found'} description={query ? 'Change or clear the search to see other equipment.' : 'Equipment records will appear here when available.'} /> : <div className="table-wrap">
                <table className="table manager-equipment-table">
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
                                <th scope="row" data-label="Equipment name"><button type="button" className="manager-table-link" onClick={() => navigate(`/app/manager/requests?search=${encodeURIComponent(r.name)}`)}>{r.name}</button></th>
                                <td data-label="Employee">{r.assigned_employee_name || '-'}</td>
                                <td data-label="Department">{r.department || '-'}</td>
                                <td data-label="Serial number">{r.serial_number || '-'}</td>
                                <td data-label="Technician">{r.team_name || '-'}</td>
                                <td data-label="Equipment category">{r.category || '-'}</td>
                                <td data-label="Company">{r.location || '-'}</td>
                            </tr>
                        ))}

                    </tbody>
                </table>
            </div>}
            </Panel>}

        </div>
    );
}
