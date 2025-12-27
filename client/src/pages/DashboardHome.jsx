import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const DEFAULT_COMPANY = 'My Company (San Francisco)';

const isOpenStatus = (status) => {
  const s = String(status || '').toLowerCase();
  return s !== 'repaired' && s !== 'scrap';
};

const DashboardHome = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState(DEFAULT_COMPANY);

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.get('/maintenance');
      setRequests(data?.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openRequests = useMemo(() => requests.filter((r) => isOpenStatus(r.status)), [requests]);

  const criticalEquipmentCount = useMemo(() => {
    const set = new Set();
    for (const r of openRequests) {
      if (r.equipment_id) set.add(r.equipment_id);
    }
    return set.size;
  }, [openRequests]);

  const technicianLoadPct = useMemo(() => {
    const total = openRequests.length;
    if (!total) return 0;
    const assigned = openRequests.filter((r) => r.assigned_to_user_id || r.assigned_to_name).length;
    return Math.round((assigned / total) * 100);
  }, [openRequests]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      const hay = [
        r.subject,
        r.equipment_name,
        r.work_center_name,
        r.department,
        r.assigned_employee_name,
        r.assigned_to_name,
        r.created_by_name,
        r.type,
        r.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [requests, search]);

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">At-a-glance status for maintenance.</p>
        </div>

        <div className="page-actions">
          <input
            className="modal-input"
            style={{ marginBottom: 0, width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search"
          />

          <select
            className="modal-input"
            style={{ marginBottom: 0, width: 260 }}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            aria-label="Company"
          >
            <option value={DEFAULT_COMPANY}>{DEFAULT_COMPANY}</option>
          </select>

          <button type="button" className="btn-accent" onClick={() => navigate('/app/requests')}>
            New Request
          </button>
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error animate-shake" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card-grid" style={{ marginBottom: 14 }}>
        <div className="card" style={{ borderLeft: '3px solid rgba(239, 68, 68, 0.55)' }}>
          <p className="muted">Critical Equipment</p>
          <h2>{criticalEquipmentCount} Units</h2>
        </div>

        <div className="card" style={{ borderLeft: '3px solid rgba(90, 166, 255, 0.55)' }}>
          <p className="muted">Technician Load</p>
          <h2>{technicianLoadPct}% Utilized</h2>
        </div>

        <div className="card" style={{ borderLeft: '3px solid rgba(69, 209, 156, 0.55)' }}>
          <p className="muted">Open Requests</p>
          <h2>{openRequests.length} Pending</h2>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Employee</th>
              <th>Technician</th>
              <th>Category</th>
              <th>Stage</th>
              <th>Company</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filteredRequests.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
                  No requests found.
                </td>
              </tr>
            )}

            {filteredRequests.slice(0, 15).map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 650 }}>{r.subject}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {(r.work_center_name || r.equipment_name) ?? '-'}
                  </div>
                </td>
                <td>{r.assigned_employee_name || r.created_by_name || '-'}</td>
                <td>{r.assigned_to_name || '-'}</td>
                <td>{r.department || r.type || '-'}</td>
                <td>
                  <span className="pill">{String(r.status || 'new').replaceAll('_', ' ')}</span>
                </td>
                <td>{company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DashboardHome;
