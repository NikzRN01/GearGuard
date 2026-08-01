import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import SelectMenu from '../components/ui/SelectMenu';
import { getSessionUser } from '../services/session';

export default function Teams() {
    const currentUser = getSessionUser();
    const canManageTeams = ['manager', 'admin'].includes(currentUser?.role);
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

    // Fetch teams from backend on component mount. canManageTeams is derived
    // from the session and does not change while mounted, so listing it costs
    // nothing and keeps the dependency list truthful.
    useEffect(() => {
        fetchTeams();
        if (canManageTeams) fetchUsers();
    }, [canManageTeams]);

    useEffect(() => {
        if (!showForm && !showAddMember) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [showForm, showAddMember]);

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
                        } catch {
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

    async function renameTeam(team) {
        const name = window.prompt('Enter the new team name', team.name);
        if (!name?.trim() || name.trim() === team.name) return;
        setError('');
        try {
            await api.put(`/teams/${team.id}`, { name: name.trim() });
            await fetchTeams();
        } catch (err) {
            setError(err?.response?.data?.message || 'Unable to rename the team.');
        }
    }

    async function deleteTeam(team) {
        if (!window.confirm(`Delete ${team.name}? This only succeeds when nothing references the team.`)) return;
        setError('');
        try {
            await api.delete(`/teams/${team.id}`);
            await fetchTeams();
        } catch (err) {
            setError(err?.response?.data?.message || 'Unable to delete the team.');
        }
    }

    async function removeMember(member) {
        if (!selectedTeam || !window.confirm(`Remove ${member.name} from ${selectedTeam.name}?`)) return;
        setMemberError('');
        try {
            await api.delete(`/teams/${selectedTeam.id}/members/${member.id}`);
            await fetchTeams();
            setSelectedTeam((team) => ({ ...team, members: team.members.filter((item) => item.id !== member.id) }));
        } catch (err) {
            setMemberError(err?.response?.data?.message || 'Unable to remove the team member.');
        }
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

    function onMemberChange(value) {
        setMemberForm({ user_id: value });
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
            <PageHeader eyebrow={currentUser?.role === 'admin' ? 'Admin operations' : canManageTeams ? 'Manager workspace' : 'Team reference'} title="Teams" description={canManageTeams ? 'Manage maintenance teams and their members.' : 'Review maintenance teams and their members.'} actions={<>{canManageTeams && <Button onClick={openNew}>Create team</Button>}<Button variant="secondary" onClick={fetchTeams} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button></>} />

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
                                    {canManageTeams ? <div className="manager-inline-actions"><Button variant="secondary" size="small" onClick={() => openAddMember(r)}>Members</Button><Button variant="tertiary" size="small" onClick={() => renameTeam(r)}>Rename</Button><Button variant="danger" size="small" onClick={() => deleteTeam(r)}>Delete</Button></div> : <span className="manager-muted-cell">View only</span>}
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

                        {selectedTeam?.members?.length > 0 && <div className="manager-member-list" aria-label="Current team members">
                            {selectedTeam.members.map((member) => <div key={member.id}><span>{member.name}<small>{member.email || member.role}</small></span><Button type="button" variant="tertiary" size="small" onClick={() => removeMember(member)}>Remove</Button></div>)}
                        </div>}

                        <form onSubmit={onAddMember}>
                            <div className="input-group">
                                <label>Select User *</label>
                                <SelectMenu
                                    ariaLabel="Select a user to add"
                                    value={memberForm.user_id}
                                    onChange={onMemberChange}
                                    options={[
                                        { value: '', label: 'Select a user' },
                                        ...users.map((user) => ({ value: String(user.id), label: `${user.name} (${user.email}) - ${user.role}` }))
                                    ]}
                                />
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
