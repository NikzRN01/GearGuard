import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';

export default function Teams() {
    const [showForm, setShowForm] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [users, setUsers] = useState([]);

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [memberError, setMemberError] = useState('');
    const [usersError, setUsersError] = useState('');

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
        setLoading(true);
        setError('');
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
            setError(err?.response?.data?.message || 'Unable to load maintenance teams.');
        } finally {
            setLoading(false);
        }
    }

    async function fetchUsers() {
        setUsersError('');
        try {
            // Fetch all users to show in add member dropdown
            const { data } = await api.get('/teams/users/all');
            if (data?.success) {
                setUsers(data.data);
            }
        } catch (err) {
            setUsersError(err?.response?.data?.message || 'Eligible users could not be loaded.');
        }
    }

    function openNew() {
        setForm({ name: '', members: '', company: 'My Company (San Francisco)' });
        setFormError('');
        setShowForm(true);
    }

    function closeNew() {
        setShowForm(false);
    }

    async function onSubmit(e) {
        e.preventDefault();
        setFormError('');
        setSaving(true);
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
            setFormError(err?.response?.data?.message || 'Failed to create team');
        } finally {
            setSaving(false);
        }
    }

    function openAddMember(team) {
        setSelectedTeam(team);
        setMemberForm({ user_id: '' });
        setMemberError(usersError);
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
        setMemberError('');
        setSaving(true);
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
            setMemberError(err?.response?.data?.message || 'Failed to add member to team');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="container manager-page manager-teams-page">
            <PageHeader eyebrow="Manager workspace" title="Teams" description="Manage maintenance teams and their members." actions={<><Button onClick={openNew}>Create team</Button><Button variant="secondary" onClick={fetchTeams} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button></>} />

            {error && <Alert tone="danger" title="Teams could not be loaded" action={<Button variant="secondary" size="small" onClick={fetchTeams}>Try again</Button>}>{error}</Alert>}

            {!error && <Panel eyebrow="Maintenance teams" title={`${rows.length} teams`} ariaLabel="Maintenance teams">
                {loading ? <div className="manager-state" role="status">Loading teams...</div> : rows.length === 0 ? <EmptyState title="No teams yet" description="Create the first maintenance team, then assign eligible users to it." action={<Button onClick={openNew}>Create team</Button>} /> : <div className="table-wrap">
                <table className="table manager-teams-table">
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
                                <th scope="row" data-label="Team name">{r.name}</th>
                                <td data-label="Team members">
                                    {r.members && r.members.length > 0 
                                        ? r.members.map(m => m.name).join(', ')
                                        : 'No members yet'
                                    }
                                </td>
                                <td className="manager-team-action">
                                    <Button variant="secondary" size="small" onClick={() => openAddMember(r)}>Add member</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>}
            </Panel>}

            {showForm && 
                createPortal(
                <div className="modal-overlay manager-teams-overlay" onMouseDown={closeNew}>
                    <div className="modal-content manager-teams-modal" role="dialog" aria-modal="true" aria-labelledby="create-team-title" onMouseDown={(e) => e.stopPropagation()}>
                        <h3 id="create-team-title">Create team</h3>
                        <p>Create the team first. Members are assigned separately after creation.</p>

                        <form id="teamForm" onSubmit={onSubmit} autoComplete="off">
                            <div className="input-group">
                                <label>Team Name *</label>
                                <input
                                    className="modal-input"
                                    name="team_name"
                                    value={form.name}
                                    onChange={(e) => setForm((previous) => ({ ...previous, name: e.target.value }))}
                                    autoComplete="off"
                                    required
                                    placeholder="e.g., Internal Maintenance"
                                />
                            </div>

                            {formError && <Alert tone="danger" title="Team could not be created">{formError}</Alert>}

                            <div className="modal-actions">
                                <Button variant="secondary" type="button" onClick={closeNew} disabled={saving}>Cancel</Button>
                                <Button type="submit" pending={saving} pendingLabel="Creating..." disabled={!form.name.trim()}>Create team</Button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {showAddMember && 
                createPortal(
                <div className="modal-overlay manager-teams-overlay" onMouseDown={closeAddMember}>
                    <div className="modal-content manager-teams-modal" role="dialog" aria-modal="true" aria-labelledby="add-member-title" onMouseDown={(e) => e.stopPropagation()}>
                        <h3 id="add-member-title">Add member to {selectedTeam?.name}</h3>
                        <p>Select a user to add to this team.</p>

                        <form onSubmit={onAddMember}>
                            <div className="input-group">
                                <label>Select User *</label>
                                <select
                                    className="input-select modal-input"
                                    value={memberForm.user_id}
                                    onChange={onMemberChange}
                                    required
                                >
                                    <option value="">-- Select a user --</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>
                                            {user.name} ({user.email}) - {user.role}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {memberError && <Alert tone="danger" title="Member could not be added">{memberError}</Alert>}

                            <div className="modal-actions">
                                <Button variant="secondary" type="button" onClick={closeAddMember} disabled={saving}>Cancel</Button>
                                <Button type="submit" pending={saving} pendingLabel="Adding..." disabled={!memberForm.user_id}>Add member</Button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

        </div>
    );
}
