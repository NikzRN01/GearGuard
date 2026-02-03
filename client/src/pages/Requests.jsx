import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';

const getSessionUser = () => {
	try {
		const raw = sessionStorage.getItem('user');
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

const DEFAULT_NEW_REQUEST = {
	subject: '',
	maintenanceFor: 'equipment',
	equipment_id: '',
	work_center_id: '',
	type: 'corrective',
	scheduled_date: '',
	category: '',
	maintenance_team_id: '',
	maintenance_team_name: '',
};

export default function Requests() {
	const location = useLocation();
	const user = useMemo(() => getSessionUser(), []);
	const scope = useMemo(() => {
		const sp = new URLSearchParams(location?.search || '');
		const equipment_id = sp.get('equipment_id') || '';
		const work_center_id = sp.get('work_center_id') || '';
		return { equipment_id, work_center_id };
	}, [location?.search]);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [activeRequest, setActiveRequest] = useState(null);
	const [requests, setRequests] = useState([]);
	const [equipmentOptions, setEquipmentOptions] = useState([]);
	const [workCenterOptions, setWorkCenterOptions] = useState([]);
	const [teamOptions, setTeamOptions] = useState([]);

	const [showNewModal, setShowNewModal] = useState(false);
	const [newRequest, setNewRequest] = useState(DEFAULT_NEW_REQUEST);
	const [newError, setNewError] = useState('');
	const [savingNew, setSavingNew] = useState(false);

	const [showCompleteModal, setShowCompleteModal] = useState(false);
	const [durationHours, setDurationHours] = useState('');
	const [completeError, setCompleteError] = useState('');
	const [activeTab, setActiveTab] = useState('notes');
	const [showWorksheet, setShowWorksheet] = useState(false);
	const [currentStatus, setCurrentStatus] = useState('new');
	const [alertStatus, setAlertStatus] = useState('in-progress');
	const [formData, setFormData] = useState({
		subject: '',
		createdBy: '',
		maintenanceFor: 'equipment',
		equipment: '',
		workCenter: '',
		category: '',
		requestDate: '',
		maintenanceType: 'corrective',
		team: '',
		internalMaintenance: '',
		scheduledDate: '',
		duration: '',
		priority: 'medium',
		company: 'My Company (San Francisco)',
	});

	const loadPicklists = async () => {
		try {
			const [eq, wc, teams] = await Promise.all([
				api.get('/equipment'),
				api.get('/work-centers'),
				api.get('/teams')
			]);
			setEquipmentOptions(eq?.data?.data || []);
			setWorkCenterOptions(wc?.data?.data || []);
			setTeamOptions(teams?.data?.data || []);
		} catch {
			// ignore; page can still function with manual inputs
		}
	};

	const loadRequestsList = async (opts = {}) => {
		setError('');
		setLoading(true);
		try {
			const params = {
				...(opts?.equipment_id ? { equipment_id: opts.equipment_id } : {}),
				...(opts?.work_center_id ? { work_center_id: opts.work_center_id } : {}),
			};
			const { data } = await api.get('/maintenance', { params });
			const list = data?.data || [];
			setRequests(list);
			if (activeRequest?.id && list.some((r) => r.id === activeRequest.id)) return;
			setActiveRequest(list[0] || null);
		} catch (e) {
			setError(e?.response?.data?.message || 'Failed to load requests');
		} finally {
			setLoading(false);
		}
	};

	const loadRequestById = async (id) => {
		const { data } = await api.get(`/maintenance/${id}`);
		setActiveRequest(data?.data || null);
	};

	useEffect(() => {
		loadPicklists();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		loadRequestsList(scope);
		// Open New modal if navigated from Dashboard or a deep link
		if (location?.state?.openNew) {
			setNewError('');
			setNewRequest(DEFAULT_NEW_REQUEST);
			setShowNewModal(true);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scope.equipment_id, scope.work_center_id]);

	useEffect(() => {
		if (!activeRequest) {
			setCurrentStatus('new');
			return;
		}
		setCurrentStatus(activeRequest.status || 'new');
		setFormData({
			subject: activeRequest.subject || '',
			createdBy: activeRequest.created_by_name || user?.name || '',
			maintenanceFor: activeRequest.equipment_id ? 'equipment' : 'work-center',
			equipment: activeRequest.equipment_name ? `${activeRequest.equipment_name}${activeRequest.serial_number ? `/${activeRequest.serial_number}` : ''}` : '',
			workCenter: activeRequest.work_center_name || '',
			category: activeRequest.department || activeRequest.type || '',
			requestDate: activeRequest.created_at ? String(activeRequest.created_at).slice(0, 10) : '',
			maintenanceType: activeRequest.type || 'corrective',
			team: activeRequest.team_name || '',
			internalMaintenance: activeRequest.assigned_to_name || '',
			scheduledDate: activeRequest.scheduled_date || '',
			duration: typeof activeRequest.duration_hours === 'number' ? String(activeRequest.duration_hours) : (activeRequest.duration_hours || ''),
			priority: 'medium',
			company: 'My Company (San Francisco)',
		});
	}, [activeRequest, user?.name]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData(prev => ({ ...prev, [name]: value }));
	};

	const statusPhases = [
		{ id: 'new', label: 'New Request' },
		{ id: 'in_progress', label: 'In Progress' },
		{ id: 'repaired', label: 'Repaired' },
		{ id: 'scrap', label: 'Scrapped' }
	];

	const getStatusIndex = (statusId) => statusPhases.findIndex(p => p.id === statusId);
	const currentIndex = getStatusIndex(currentStatus);

	const openNew = () => {
		setNewError('');
		setNewRequest(DEFAULT_NEW_REQUEST);
		setShowNewModal(true);
		if (scope.equipment_id) onSelectEquipment(scope.equipment_id);
		else if (scope.work_center_id) onSelectWorkCenter(scope.work_center_id);
	};
	const closeNew = () => {
		setShowNewModal(false);
		setNewError('');
	};

	const onNewChange = (key, value) => setNewRequest((prev) => ({ ...prev, [key]: value }));

	const onSelectEquipment = async (id) => {
		onNewChange('maintenanceFor', 'equipment');
		onNewChange('equipment_id', id);
		onNewChange('work_center_id', '');
		if (!id) {
			onNewChange('category', '');
			onNewChange('maintenance_team_id', '');
			onNewChange('maintenance_team_name', '');
			return;
		}
		try {
			const { data } = await api.get(`/equipment/${id}`);
			const eq = data?.data;
			onNewChange('category', eq?.category || eq?.department || '');
			onNewChange('maintenance_team_id', eq?.maintenance_team_id ? String(eq.maintenance_team_id) : '');
			onNewChange('maintenance_team_name', eq?.team_name || '');
		} catch {
			// keep going; user can still submit
		}
	};

	const onSelectWorkCenter = (id) => {
		onNewChange('maintenanceFor', 'work-center');
		onNewChange('work_center_id', id);
		onNewChange('equipment_id', '');
		onNewChange('category', '');
		onNewChange('maintenance_team_id', '');
		onNewChange('maintenance_team_name', '');
	};

	const submitNew = async (e) => {
		e.preventDefault();
		setNewError('');
		if (!user?.id) {
			setNewError('Please log in again to create a request.');
			return;
		}
		if (!newRequest.subject.trim()) {
			setNewError('Subject is required.');
			return;
		}
		const hasEq = Boolean(newRequest.equipment_id);
		const hasWc = Boolean(newRequest.work_center_id);
		if ((hasEq && hasWc) || (!hasEq && !hasWc)) {
			setNewError('Select exactly one: Equipment or Work Center.');
			return;
		}
		if (newRequest.type === 'preventive' && !newRequest.scheduled_date) {
			setNewError('Scheduled Date is required for preventive requests.');
			return;
		}
		setSavingNew(true);
		try {
			const payload = {
				type: newRequest.type,
				subject: newRequest.subject.trim(),
				equipment_id: hasEq ? Number(newRequest.equipment_id) : null,
				work_center_id: hasWc ? Number(newRequest.work_center_id) : null,
				team_id: newRequest.maintenance_team_id ? Number(newRequest.maintenance_team_id) : null,
				scheduled_date: newRequest.scheduled_date || null,
				created_by_user_id: user.id,
			};
			const { data } = await api.post('/maintenance', payload);
			if (data?.success) {
				await loadRequestById(data?.data?.id);
				await loadRequestsList(scope);
				closeNew();
			} else {
				setNewError(data?.message || 'Failed to create request');
			}
		} catch (err) {
			setNewError(err?.response?.data?.message || 'Failed to create request');
		} finally {
			setSavingNew(false);
		}
	};

	const assignToMe = async () => {
		if (!activeRequest?.id || !user?.id) return;
		setError('');
		try {
			await api.patch(`/maintenance/${activeRequest.id}/assign`, { user_id: user.id });
			await loadRequestById(activeRequest.id);
			await loadRequestsList(scope);
		} catch (e) {
			setError(e?.response?.data?.message || 'Failed to assign request');
		}
	};

	const updateStatus = async (status, duration) => {
		if (!activeRequest?.id) return;
		setError('');
		try {
			await api.patch(`/maintenance/${activeRequest.id}/status`, {
				status,
				duration_hours: duration,
			});
			await loadRequestById(activeRequest.id);
			await loadRequestsList(scope);
		} catch (e) {
			setError(e?.response?.data?.message || 'Failed to update status');
		}
	};

	const completeRequest = async (e) => {
		e?.preventDefault?.();
		setCompleteError('');
		const parsed = Number(durationHours);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			setCompleteError('Enter a valid number of hours (greater than 0).');
			return;
		}
		await updateStatus('repaired', parsed);
		setShowCompleteModal(false);
		setDurationHours('');
	};

	return (
		<div className="container">
			<div className="page-header">
				<div>
					<h1>Requests</h1>
					<p className="muted">
						Submit, triage, and track maintenance work.
						{scope.equipment_id && <> {' '}• Showing equipment #{scope.equipment_id}</>}
						{scope.work_center_id && <> {' '}• Showing work center #{scope.work_center_id}</>}
					</p>
				</div>
			</div>

			{error && (
				<div className="alert alert-error animate-shake" style={{ marginBottom: 12 }}>
					{error}
				</div>
			)}

			{/* Top action bar with status timeline */}
			<div className="request-top-bar">
				<button className="btn-new" type="button" onClick={openNew}>+ New</button>
				{activeRequest && (
					<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
						{!activeRequest.assigned_to_user_id && (
							<button className="btn-secondary" type="button" onClick={assignToMe}>
								Assign to me
							</button>
						)}
						{activeRequest.assigned_to_user_id === user?.id && activeRequest.status === 'new' && (
							<button className="btn-secondary" type="button" onClick={() => updateStatus('in_progress')}>
								Start Work
							</button>
						)}
						{activeRequest.assigned_to_user_id === user?.id && activeRequest.status === 'in_progress' && (
							<button
								className="btn-secondary"
								type="button"
								onClick={() => {
									setDurationHours('');
									setCompleteError('');
									setShowCompleteModal(true);
								}}
							>
								Complete
							</button>
						)}
					</div>
				)}
				
				<div className="status-timeline">
					{statusPhases.map((phase, idx) => (
						<div key={phase.id} className={`status-phase ${phase.id === currentStatus ? 'active' : idx < currentIndex ? 'completed' : 'pending'}`}>
							<div className="status-phase-dot"></div>
							<span className="status-phase-label">{phase.label}</span>
						</div>
					))}
				</div>

				<button 
					className={`worksheet-btn ${showWorksheet ? 'active' : ''}`}
					onClick={() => setShowWorksheet(!showWorksheet)}
					title="Toggle worksheet comments"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
					</svg>
				</button>
			</div>

			<div className="status-alert-dots">
				<button
					type="button"
					className={`alert-dot in-progress ${alertStatus === 'in-progress' ? 'active' : ''}`}
					onClick={() => setAlertStatus('in-progress')}
					title="In Progress"
					aria-label="In Progress"
				></button>
				<button
					type="button"
					className={`alert-dot blocked ${alertStatus === 'blocked' ? 'active' : ''}`}
					onClick={() => setAlertStatus('blocked')}
					title="Blocked"
					aria-label="Blocked"
				></button>
				<button
					type="button"
					className={`alert-dot ready ${alertStatus === 'ready' ? 'active' : ''}`}
					onClick={() => setAlertStatus('ready')}
					title="Ready"
					aria-label="Ready"
				></button>
			</div>

			<div className="table-wrap" style={{ marginTop: 10 }}>
				<table className="table" style={{ minWidth: 860 }}>
					<thead>
						<tr>
							<th scope="col">Subject</th>
							<th scope="col">Status</th>
							<th scope="col">Type</th>
							<th scope="col">Scheduled</th>
							<th scope="col">Assigned To</th>
						</tr>
					</thead>
					<tbody>
						{requests.map((r) => (
							<tr
								key={r.id}
								className="table-row-click"
								onClick={() => loadRequestById(r.id)}
								title="Open request"
								style={activeRequest?.id === r.id ? { outline: '2px solid rgba(90, 166, 255, 0.35)', outlineOffset: -2 } : undefined}
							>
								<td>{r.subject}</td>
								<td>{r.status}</td>
								<td>{r.type}</td>
								<td>{r.scheduled_date ? String(r.scheduled_date).slice(0, 10) : '-'}</td>
								<td>{r.assigned_to_name || '-'}</td>
							</tr>
						))}
						{requests.length === 0 && (
							<tr>
								<td colSpan={5} className="table-empty">
									{loading ? 'Loading…' : 'No requests found.'}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<div className="request-layout">
				{/* Left panel - Form */}
				<div className="request-form-panel">
					<h2 className="request-title">{formData.subject || (loading ? 'Loading…' : 'No request selected')}</h2>

					<div className="form-section">
						<label>Created By</label>
						<input
							type="text"
							name="createdBy"
							value={formData.createdBy}
							onChange={handleChange}
							className="form-input"
							disabled
						/>
					</div>

					<div className="form-section">
						<label>Maintenance For</label>
						<select
							name="maintenanceFor"
							value={formData.maintenanceFor}
							onChange={handleChange}
							className="form-input"
							disabled
						>
							<option value="equipment">Equipment</option>
							<option value="work-center">Work Center</option>
						</select>
					</div>

					{formData.maintenanceFor === 'equipment' ? (
						<div className="form-section">
							<label>Equipment</label>
							<input
								type="text"
								name="equipment"
								value={formData.equipment}
								onChange={handleChange}
								className="form-input"
								disabled
							/>
						</div>
					) : (
						<div className="form-section">
							<label>Work Center</label>
							<input
								type="text"
								name="workCenter"
								value={formData.workCenter}
								onChange={handleChange}
								className="form-input"
								disabled
							/>
						</div>
					)}

					<div className="form-section">
						<label>Category</label>
						<input
							type="text"
							name="category"
							value={formData.category}
							onChange={handleChange}
							className="form-input"
							disabled
						/>
					</div>

					<div className="form-section">
						<label>Request Date</label>
						<input
							type="text"
							name="requestDate"
							value={formData.requestDate}
							onChange={handleChange}
							className="form-input"
							disabled
						/>
					</div>

					<div className="form-section">
						<label>Maintenance Type</label>
						<div className="radio-group">
							<label className="radio-label">
								<input
									type="radio"
									name="maintenanceType"
									value="corrective"
									checked={formData.maintenanceType === 'corrective'}
									onChange={handleChange}
									disabled
								/>
								Corrective
							</label>
							<label className="radio-label">
								<input
									type="radio"
									name="maintenanceType"
									value="preventive"
									checked={formData.maintenanceType === 'preventive'}
									onChange={handleChange}
									disabled
								/>
								Preventive
							</label>
						</div>
					</div>
				</div>

				{/* Right panel - Details */}
				<div className="request-details-panel">
					<div className="form-section">
						<label>Team</label>
						<input
							type="text"
							name="team"
							value={formData.team}
							onChange={handleChange}
							className="form-input"
							disabled
						/>
					</div>

					<div className="form-section">
						<label>Internal Maintenance</label>
						<input
							type="text"
							name="internalMaintenance"
							value={formData.internalMaintenance}
							onChange={handleChange}
							className="form-input"
							disabled
						/>
					</div>

					<div className="form-section">
						<label>Scheduled Date</label>
						<input
							type="datetime-local"
							name="scheduledDate"
							value={formData.scheduledDate}
							onChange={handleChange}
							className="form-input"
							disabled
						/>
					</div>

					<div className="form-section">
						<label>Duration (hours)</label>
						<input
							type="text"
							name="duration"
							value={formData.duration}
							onChange={handleChange}
							className="form-input"
							disabled
						/>
					</div>

					<div className="form-section">
						<label>Priority</label>
						<div className="priority-selector">
							<div
								className={`priority-diamond ${formData.priority === 'low' ? 'active' : ''}`}
								title="Low Priority"
								aria-disabled="true"
							></div>
							<div
								className={`priority-diamond ${formData.priority === 'medium' ? 'active' : ''}`}
								title="Medium Priority"
								aria-disabled="true"
							></div>
							<div
								className={`priority-diamond ${formData.priority === 'high' ? 'active' : ''}`}
								title="High Priority"
								aria-disabled="true"
							></div>
						</div>
					</div>

					<div className="form-section">
						<label>Company</label>
						<input
							type="text"
							name="company"
							value={formData.company}
							onChange={handleChange}
							className="form-input"
							disabled
						/>
					</div>
				</div>
			</div>

			{showNewModal && (
				<div
					className="modal-overlay"
					onMouseDown={(e) => {
						if (e.target === e.currentTarget) closeNew();
					}}
				>
					<div className="modal-content request-modal" role="dialog" aria-modal="true" aria-label="New Request">
						<div className="modal-header">
							<h2>New Request</h2>
							<button className="modal-close" type="button" onClick={closeNew}>
								×
							</button>
						</div>

						<form onSubmit={submitNew}>
							{newError && (
								<div className="alert alert-error" style={{ marginBottom: 12 }}>
									{newError}
								</div>
							)}

							<div className="new-request-helper">
								Select exactly one target: Equipment or Work Center.
							</div>

							<div className="new-request-grid">
								<div className="field field-wide">
									<label>Subject</label>
									<input
										type="text"
										className="form-input"
										value={newRequest.subject}
										onChange={(e) => onNewChange('subject', e.target.value)}
										placeholder="e.g. Printer stopped working"
										autoFocus
									/>
								</div>

								<div className="field field-wide">
									<label>Maintenance Type</label>
									<div className="radio-group">
										<label className="radio-label">
											<input
												type="radio"
												name="newType"
												checked={newRequest.type === 'corrective'}
												onChange={() => onNewChange('type', 'corrective')}
											/>
											Breakdown (Corrective)
										</label>
										<label className="radio-label">
											<input
												type="radio"
												name="newType"
												checked={newRequest.type === 'preventive'}
												onChange={() => onNewChange('type', 'preventive')}
											/>
											Routine Checkup (Preventive)
										</label>
									</div>
								</div>

								<div className="field">
									<label>Equipment</label>
									<select
										className="form-input"
										value={newRequest.equipment_id}
										onChange={(e) => onSelectEquipment(e.target.value)}
										disabled={Boolean(newRequest.work_center_id)}
									>
										<option value="">Select equipment</option>
										{equipmentOptions.map((eq) => (
											<option key={eq.id} value={eq.id}>
												{eq.name}{eq.serial_number ? ` / ${eq.serial_number}` : ''}
											</option>
										))}
									</select>
									{Boolean(newRequest.work_center_id) && (
										<p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
											Clear Work Center to choose equipment.
										</p>
									)}
								</div>

								<div className="field">
									<label>Work Center</label>
									<select
										className="form-input"
										value={newRequest.work_center_id}
										onChange={(e) => onSelectWorkCenter(e.target.value)}
										disabled={Boolean(newRequest.equipment_id)}
									>
										<option value="">Select work center</option>
										{workCenterOptions.map((wc) => (
											<option key={wc.id} value={wc.id}>
												{wc.name}
											</option>
										))}
									</select>
									{Boolean(newRequest.equipment_id) && (
										<p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
											Clear Equipment to choose work center.
										</p>
									)}
								</div>

								{Boolean(newRequest.equipment_id) && (
									<>
										<div className="field">
											<label>Category</label>
											<input className="form-input" value={newRequest.category || ''} disabled />
										</div>
										<div className="field">
											<label>Maintenance Team</label>
											<select
												className="form-input"
												value={newRequest.maintenance_team_id || ''}
												onChange={(e) => {
													const teamId = e.target.value;
													onNewChange('maintenance_team_id', teamId);
													const team = teamOptions.find(t => String(t.id) === teamId);
													onNewChange('maintenance_team_name', team?.name || '');
												}}
											>
												<option value="">-- Select Team --</option>
												{teamOptions.map(team => (
													<option key={team.id} value={team.id}>
														{team.name}
													</option>
												))}
											</select>
										</div>
									</>
								)}

								{newRequest.type === 'preventive' && (
									<div className="field field-wide">
										<label>Scheduled Date</label>
										<input
											type="date"
											className="form-input"
											value={newRequest.scheduled_date}
											onChange={(e) => onNewChange('scheduled_date', e.target.value)}
										/>
									</div>
								)}
							</div>

							<div className="modal-actions">
								<button className="btn-secondary" type="button" onClick={closeNew} disabled={savingNew}>
									Cancel
								</button>
								<button className="btn-new" type="submit" disabled={savingNew}>
									{savingNew ? 'Creating…' : 'Create Request'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{showCompleteModal && (
				<div
					className="modal-overlay"
					onMouseDown={(e) => {
						if (e.target === e.currentTarget) {
							setShowCompleteModal(false);
							setCompleteError('');
						}
					}}
				>
					<div className="modal-content" role="dialog" aria-modal="true" aria-label="Complete Request">
						<div className="modal-header">
							<h2>Complete Request</h2>
							<button
								className="modal-close"
								type="button"
								onClick={() => {
									setShowCompleteModal(false);
									setCompleteError('');
								}}
							>
								×
							</button>
						</div>

						<form onSubmit={completeRequest}>
							{completeError && (
								<div className="alert alert-error" style={{ marginBottom: 12 }}>
									{completeError}
								</div>
							)}

							<div className="form-section">
								<label>Hours Worked</label>
								<input
									type="number"
									step="0.25"
									min="0"
									className="form-input"
									value={durationHours}
									onChange={(e) => setDurationHours(e.target.value)}
									placeholder="e.g. 1.5"
									autoFocus
								/>
							</div>

							<div className="modal-actions">
								<button
									className="btn-secondary"
									type="button"
									onClick={() => {
										setShowCompleteModal(false);
										setCompleteError('');
									}}
								>
									Cancel
								</button>
								<button className="btn-new" type="submit">
									Mark Repaired
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Worksheet comments section */}
			{showWorksheet && (
				<div className="worksheet-section">
					<div className="worksheet-header">
						<h3>Worksheet Comments</h3>
						<button 
							className="close-btn"
							onClick={() => setShowWorksheet(false)}
							aria-label="Close worksheet"
						>
							×
						</button>
					</div>
					<textarea
						className="worksheet-textarea"
						placeholder="Add worksheet comments here..."
						defaultValue=""
					/>
				</div>
			)}

			{/* Tabs */}
			<div className="tabs-section">
				<div className="tabs-header">
					<button
						className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
						onClick={() => setActiveTab('notes')}
					>
						Notes
					</button>
					<button
						className={`tab-btn ${activeTab === 'instructions' ? 'active' : ''}`}
						onClick={() => setActiveTab('instructions')}
					>
						Instructions
					</button>
				</div>
				<div className="tab-content">
					{activeTab === 'notes' && (
						<textarea
							className="notes-textarea"
							placeholder="Add notes here..."
							defaultValue=""
						/>
					)}
					{activeTab === 'instructions' && (
						<textarea
							className="notes-textarea"
							placeholder="Add instructions here..."
							defaultValue=""
						/>
					)}
				</div>
			</div>
		</div>
	);
}


