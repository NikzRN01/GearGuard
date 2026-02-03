import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';

export default function Teams() {
    const [showForm, setShowForm] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [users, setUsers] = useState([]);

    const [rows, setRows] = useState([]);

    const [form, setForm] = useState({
        name: '',
        members: '',
        company: 'My Company (San Francisco)',
    });

    const [memberForm, setMemberForm] = useState({
        user_id: ''
    });

    // Fetch teams from backend on component mount
    useEffect(() => {
        fetchTeams();
        fetchUsers();
    }, []);

    async function fetchTeams() {
        try {
            const { data } = await api.get('/teams');
            if (data?.success) {
                // Fetch members for each team
                const teamsWithMembers = await Promise.all(
                    data.data.map(async (team) => {
                        try {
                            const memberData = await api.get(`/teams/${team.id}`);
                            return {
                                ...team,
                                members: memberData.data?.data?.members || []
                            };
                        } catch (err) {
                            return { ...team, members: [] };
                        }
                    })
                );
                setRows(teamsWithMembers);
            }
        } catch (err) {
            console.error('Error fetching teams:', err);
        }
    }

    async function fetchUsers() {
        try {
            // Fetch all users to show in add member dropdown
            const { data } = await api.get('/teams/users/all');
            if (data?.success) {
                setUsers(data.data);
            }
        } catch (err) {
            console.error('Error fetching users:', err);
        }
    }

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

    async function onSubmit(e) {
        e.preventDefault();

        try {
            // Create team in backend
            const { data } = await api.post('/teams', {
                name: form.name.trim()
            });

            if (data?.success) {
                // Refresh teams list from backend
                await fetchTeams();
                setShowForm(false);
            }
        } catch (err) {
            console.error('Error creating team:', err);
            alert(err?.response?.data?.message || 'Failed to create team');
        }
    }

    function openAddMember(team) {
        setSelectedTeam(team);
        setMemberForm({ user_id: '' });
        setShowAddMember(true);
    }

    function closeAddMember() {
        setShowAddMember(false);
        setSelectedTeam(null);
    }

    function onMemberChange(e) {
        setMemberForm({ user_id: e.target.value });
    }

    async function onAddMember(e) {
        e.preventDefault();

        if (!selectedTeam || !memberForm.user_id) return;

        try {
            const { data } = await api.post(`/teams/${selectedTeam.id}/members`, {
                user_id: parseInt(memberForm.user_id)
            });

            if (data?.success) {
                await fetchTeams();
                setShowAddMember(false);
                setSelectedTeam(null);
            }
        } catch (err) {
            console.error('Error adding member:', err);
            alert(err?.response?.data?.message || 'Failed to add member to team');
        }
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
                            <th scope="col">Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id}>
                                <td>{r.name}</td>
                                <td>
                                    {r.members && r.members.length > 0 
                                        ? r.members.map(m => m.name).join(', ')
                                        : 'No members yet'
                                    }
                                </td>
                                <td>
                                    <button 
                                        className="btn-secondary" 
                                        style={{ fontSize: '13px', padding: '6px 12px' }}
                                        onClick={() => openAddMember(r)}
                                    >
                                        Add Member
                                    </button>
                                </td>
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

            {showAddMember && 
                createPortal(
                <div className="modal-overlay" onMouseDown={closeAddMember}>
                    <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <h3>Add Member to {selectedTeam?.name}</h3>
                        <p>Select a user to add to this team.</p>

                        <form onSubmit={onAddMember}>
                            <div className="input-group">
                                <label>Select User *</label>
                                <select
                                    className="input-select modal-input"
                                    value={memberForm.user_id}
                                    onChange={onMemberChange}
                                    required
                                    style={{ marginBottom: 0 }}
                                >
                                    <option value="">-- Select a user --</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>
                                            {user.name} ({user.email}) - {user.role}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="modal-actions">
                                <button className="btn-secondary" type="button" onClick={closeAddMember}>
                                    Cancel
                                </button>
                                <button className="btn-accent" type="submit">
                                    Add Member
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
