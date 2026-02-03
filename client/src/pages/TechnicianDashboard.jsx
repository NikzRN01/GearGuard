import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const TechnicianDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const user = useMemo(() => {
    const userData = sessionStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  }, []);

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.get('/maintenance');
      // Filter to show only requests assigned to the technician
      const technicianRequests = (data?.data || []).filter(r => 
        r.assigned_to_user_id === user?.id || r.assigned_to_name
      );
      setRequests(technicianRequests);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const stats = useMemo(() => {
    const total = requests.length;
    const inProgress = requests.filter(r => String(r.status || '').toLowerCase() === 'in progress').length;
    const completed = requests.filter(r => String(r.status || '').toLowerCase() === 'completed').length;
    const pending = requests.filter(r => String(r.status || '').toLowerCase() === 'new').length;
    
    return { total, inProgress, completed, pending };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      const hay = [
        r.subject,
        r.equipment_name,
        r.department,
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
          <h1>My Tasks</h1>
          <p className="muted">Manage your assigned maintenance requests</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="tech-stats-grid">
        <div className="tech-stat-card tech-stat-total">
          <div className="tech-stat-label">Total Tasks</div>
          <div className="tech-stat-value">{stats.total}</div>
        </div>

        <div className="tech-stat-card tech-stat-inprogress">
          <div className="tech-stat-label">In Progress</div>
          <div className="tech-stat-value">{stats.inProgress}</div>
        </div>

        <div className="tech-stat-card tech-stat-completed">
          <div className="tech-stat-label">Completed</div>
          <div className="tech-stat-value">{stats.completed}</div>
        </div>

        <div className="tech-stat-card tech-stat-new">
          <div className="tech-stat-label">New Tasks</div>
          <div className="tech-stat-value">{stats.pending}</div>
        </div>
      </div>

      {/* Search */}
      <div className="tech-search-container">
        <input
          className="modal-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          aria-label="Search"
        />
      </div>

      {/* Requests Table */}
      {loading ? (
        <div className="tech-loading">
          Loading your tasks...
        </div>
      ) : error ? (
        <div className="tech-error">
          {error}
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="tech-empty">
          <p>No tasks assigned yet</p>
        </div>
      ) : (
        <div className="tech-table-wrapper">
          <table className="tech-requests-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Equipment</th>
                <th>Type</th>
                <th>Status</th>
                <th>Scheduled Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <div className="tech-task-name">{request.subject}</div>
                    <div className="tech-task-dept">{request.department}</div>
                  </td>
                  <td>{request.equipment_name || '-'}</td>
                  <td>{request.type}</td>
                  <td>
                    <span className={`tech-status-badge tech-status-${String(request.status || '').toLowerCase().replace(' ', '-')}`}>
                      {request.status}
                    </span>
                  </td>
                  <td>
                    {request.scheduled_date ? new Date(request.scheduled_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="tech-action-cell">
                    <button
                      onClick={() => navigate(`/app/requests`)}
                      className="tech-view-btn"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TechnicianDashboard;
