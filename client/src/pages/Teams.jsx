import React, { useMemo } from 'react';

export default function Teams() {
  const rows = useMemo(
    () => [
      { id: 1, name: 'Internal Maintenance', members: 'Anas Makari', company: 'My Company (San Francisco)' },
      { id: 2, name: 'Metrology', members: 'Marc Demo', company: 'My Company (San Francisco)' },
      { id: 3, name: 'Subcontractor', members: 'Maggie Davidson', company: 'My Company (San Francisco)' },
    ],
    []
  );

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>Teams</h1>
          <p className="muted">Manage maintenance teams and members.</p>
        </div>

        <button className="btn-accent" type="button">
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
    </div>
  );
}
