import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const isOpenStatus = (status) => {
  const s = String(status || '').toLowerCase();
  return s !== 'repaired' && s !== 'scrap' && s !== 'completed';
};

const normalizeStatus = (status) => {
  const s = String(status || 'new').trim().toLowerCase();
  if (s === 'in progress' || s === 'in_progress') return 'in_progress';
  if (s === 'on hold' || s === 'on_hold') return 'on_hold';
  return s.replaceAll(' ', '_');
};

const statusLabel = (statusKey) => statusKey.replaceAll('_', ' ');

const STATUS_COLORS = {
  new: '#f25f7a',
  in_progress: '#f59e0b',
  on_hold: '#7c83ff',
  repaired: '#37c38a',
  completed: '#37c38a',
  scrap: '#8b95a8'
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const [maintenanceRes, equipmentRes, teamsRes, usersRes] = await Promise.all([
        api.get('/maintenance'),
        api.get('/equipment'),
        api.get('/teams'),
        api.get('/teams/users/all')
      ]);

      setRequests(maintenanceRes?.data?.data || []);
      setEquipment(equipmentRes?.data?.data || []);
      setTeams(teamsRes?.data?.data || []);
      setUsers(usersRes?.data?.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load admin dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const openRequests = requests.filter((r) => isOpenStatus(r.status)).length;
    const unassigned = requests.filter((r) => !r.assigned_to_user_id && !r.assigned_to_name).length;
    const activeEquipment = equipment.filter((e) => String(e.status || '').toLowerCase() === 'active').length;
    const technicians = users.filter((u) => String(u.role || '').toLowerCase() === 'technician').length;

    return {
      totalUsers: users.length,
      totalTeams: teams.length,
      openRequests,
      unassigned,
      totalEquipment: equipment.length,
      activeEquipment,
      technicians
    };
  }, [equipment, requests, teams.length, users]);

  const topOpenRequests = useMemo(() => {
    return requests
      .filter((r) => isOpenStatus(r.status))
      .sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 8);
  }, [requests]);

  const statusAnalytics = useMemo(() => {
    const counts = requests.reduce((acc, req) => {
      const key = normalizeStatus(req.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const entries = Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const max = entries.length ? Math.max(...entries.map((e) => e.count)) : 1;

    return { entries, max };
  }, [requests]);

  const statusDonut = useMemo(() => {
    const total = statusAnalytics.entries.reduce((sum, item) => sum + item.count, 0);
    if (!total) {
      return {
        total: 0,
        segments: [],
        gradient: 'conic-gradient(#334155 0deg 360deg)'
      };
    }

    let start = 0;
    const segments = statusAnalytics.entries.map((item) => {
      const pct = item.count / total;
      const deg = pct * 360;
      const from = start;
      const to = start + deg;
      start = to;
      return {
        ...item,
        pct,
        color: STATUS_COLORS[item.status] || '#5aa6ff',
        from,
        to
      };
    });

    const gradient = `conic-gradient(${segments
      .map((s) => `${s.color} ${s.from}deg ${s.to}deg`)
      .join(', ')})`;

    return { total, segments, gradient };
  }, [statusAnalytics.entries]);

  const teamAnalytics = useMemo(() => {
    const counts = requests.reduce((acc, req) => {
      const key = req.team_name || 'Unassigned Team';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const entries = Object.entries(counts)
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const max = entries.length ? Math.max(...entries.map((e) => e.count)) : 1;

    return { entries, max };
  }, [requests]);

  const trendAnalytics = useMemo(() => {
    const now = new Date();
    const days = [];

    for (let offset = 6; offset >= 0; offset -= 1) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - offset);
      days.push(d);
    }

    const countsMap = days.reduce((acc, d) => {
      const key = d.toISOString().slice(0, 10);
      acc[key] = 0;
      return acc;
    }, {});

    for (const req of requests) {
      if (!req.created_at) continue;
      const key = new Date(req.created_at).toISOString().slice(0, 10);
      if (Object.prototype.hasOwnProperty.call(countsMap, key)) {
        countsMap[key] += 1;
      }
    }

    const series = days.map((d) => {
      const key = d.toISOString().slice(0, 10);
      return {
        key,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        count: countsMap[key] || 0
      };
    });

    const max = Math.max(1, ...series.map((item) => item.count));
    const width = 540;
    const height = 180;
    const left = 10;
    const right = width - 10;
    const top = 14;
    const bottom = height - 26;
    const spanX = right - left;
    const spanY = bottom - top;

    const points = series.map((item, index) => {
      const x = left + (spanX * index) / Math.max(1, series.length - 1);
      const y = bottom - (item.count / max) * spanY;
      return { ...item, x, y };
    });

    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${bottom.toFixed(2)} L ${points[0].x.toFixed(2)} ${bottom.toFixed(2)} Z`
      : '';

    return { series, points, linePath, areaPath, width, height, max };
  }, [requests]);

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="muted">System-wide overview of requests, users, teams, and equipment.</p>
        </div>

        <div className="page-actions">
          <button type="button" className="btn-accent" onClick={() => navigate('/app/requests', { state: { openNew: true } })}>
            New Request
          </button>
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card-grid admin-kpi-grid" style={{ marginBottom: 14 }}>
        <div className="card admin-kpi-card">
          <p className="muted">Open Requests</p>
          <h2>{stats.openRequests}</h2>
          <div className="admin-kpi-sub">{stats.unassigned} unassigned</div>
        </div>

        <div className="card admin-kpi-card">
          <p className="muted">Users</p>
          <h2>{stats.totalUsers}</h2>
          <div className="admin-kpi-sub">{stats.technicians} technicians</div>
        </div>

        <div className="card admin-kpi-card">
          <p className="muted">Teams</p>
          <h2>{stats.totalTeams}</h2>
          <div className="admin-kpi-sub">Org-wide coverage</div>
        </div>

        <div className="card admin-kpi-card">
          <p className="muted">Equipment</p>
          <h2>{stats.totalEquipment}</h2>
          <div className="admin-kpi-sub">{stats.activeEquipment} active</div>
        </div>
      </div>

      <div className="admin-analytics-grid">
        <section className="admin-chart-card">
          <div className="admin-chart-head">
            <h3>Requests by Status</h3>
            <span className="muted">Live share</span>
          </div>

          {statusDonut.total === 0 ? (
            <div className="admin-chart-empty">No data yet</div>
          ) : (
            <div className="admin-donut-wrap">
              <div className="admin-donut-shell">
                <div className="admin-donut" style={{ background: statusDonut.gradient }} />
                <div className="admin-donut-center">
                  <div className="admin-donut-total">{statusDonut.total}</div>
                  <div className="admin-donut-sub">Total</div>
                </div>
              </div>

              <div className="admin-legend">
                {statusDonut.segments.map((segment) => (
                  <div key={segment.status} className="admin-legend-item">
                    <span className="admin-legend-dot" style={{ background: segment.color }} />
                    <span className="admin-legend-name">{statusLabel(segment.status)}</span>
                    <span className="admin-legend-pct">{Math.round(segment.pct * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="admin-chart-card admin-trend-card">
          <div className="admin-chart-head">
            <h3>7-Day Request Trend</h3>
            <span className="muted">Daily intake</span>
          </div>

          {trendAnalytics.series.every((item) => item.count === 0) ? (
            <div className="admin-chart-empty">No requests created in the last 7 days</div>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${trendAnalytics.width} ${trendAnalytics.height}`}
                className="admin-trend-svg"
                preserveAspectRatio="none"
                aria-label="7-day request trend"
              >
                <defs>
                  <linearGradient id="adminTrendArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(90,166,255,0.45)" />
                    <stop offset="100%" stopColor="rgba(90,166,255,0.02)" />
                  </linearGradient>
                  <linearGradient id="adminTrendLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#9fd1ff" />
                    <stop offset="100%" stopColor="#4ccf95" />
                  </linearGradient>
                </defs>

                <path d={trendAnalytics.areaPath} fill="url(#adminTrendArea)" />
                <path d={trendAnalytics.linePath} fill="none" stroke="url(#adminTrendLine)" strokeWidth="4" strokeLinecap="round" />

                {trendAnalytics.points.map((point) => (
                  <circle key={point.key} cx={point.x} cy={point.y} r="4.8" className="admin-trend-dot" />
                ))}
              </svg>

              <div className="admin-trend-axis">
                {trendAnalytics.series.map((item) => (
                  <div key={item.key} className="admin-trend-day">
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="admin-chart-card">
          <div className="admin-chart-head">
            <h3>Requests by Team</h3>
            <span className="muted">Load intensity</span>
          </div>

          {teamAnalytics.entries.length === 0 ? (
            <div className="admin-chart-empty">No data yet</div>
          ) : (
            <div className="admin-bars">
              {teamAnalytics.entries.map((item) => (
                <div key={item.team} className="admin-bar-row">
                  <div className="admin-bar-label admin-team-label">{item.team}</div>
                  <div className="admin-bar-track">
                    <div
                      className="admin-bar-fill admin-team-fill"
                      style={{ width: `${Math.max(8, (item.count / teamAnalytics.max) * 100)}%` }}
                    />
                  </div>
                  <div className="admin-bar-value">{item.count}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Team</th>
              <th>Assignee</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {!loading && topOpenRequests.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty">
                  No open requests.
                </td>
              </tr>
            )}

            {topOpenRequests.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 650 }}>{r.subject}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {(r.work_center_name || r.equipment_name) ?? '-'}
                  </div>
                </td>
                <td>{r.team_name || '-'}</td>
                <td>{r.assigned_to_name || '-'}</td>
                <td>
                  <span className="pill">{String(r.status || 'new').replaceAll('_', ' ')}</span>
                </td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboard;