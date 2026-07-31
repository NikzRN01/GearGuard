import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';

export default function Calendar() {
	const [currentDate, setCurrentDate] = useState(new Date());
	const [view, setView] = useState('week');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [scheduledRequests, setScheduledRequests] = useState([]);

	const toDateOnly = (value) => {
		if (!value) return null;
		// If value is YYYY-MM-DD, force local midnight to avoid timezone shifting
		if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
			return new Date(`${value}T00:00:00`);
		}
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? null : d;
	};

	const formatHHmm = (d) => {
		const hh = String(d.getHours()).padStart(2, '0');
		const mm = String(d.getMinutes()).padStart(2, '0');
		return `${hh}:${mm}`;
	};

	const buildEventTimes = (scheduledDate) => {
		const d = toDateOnly(scheduledDate);
		if (!d) {
			return { date: null, startTime: '09:00', endTime: '10:00' };
		}

		// If backend provided no time info (midnight), default to a morning slot
		if (d.getHours() === 0 && d.getMinutes() === 0) {
			const start = new Date(d);
			start.setHours(9, 0, 0, 0);
			const end = new Date(d);
			end.setHours(10, 0, 0, 0);
			return { date: d, startTime: formatHHmm(start), endTime: formatHHmm(end) };
		}

		const start = d;
		const end = new Date(d);
		end.setHours(end.getHours() + 1);
		return { date: d, startTime: formatHHmm(start), endTime: formatHHmm(end) };
	};

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setError('');
			setLoading(true);
			try {
				const { data } = await api.get('/maintenance/calendar');
				if (cancelled) return;
				const list = data?.data || [];
				setScheduledRequests(list);
			} catch (e) {
				if (cancelled) return;
				setError(e?.response?.data?.message || 'Failed to load calendar requests');
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		load();
		return () => {
			cancelled = true;
		};
	}, []);

	const getWeekDays = () => {
		const start = new Date(currentDate);
		const day = start.getDay();
		const diff = start.getDate() - day + (day === 0 ? -6 : 1);
		start.setDate(diff);
		
		const days = [];
		for (let i = 0; i < 7; i++) {
			const date = new Date(start);
			date.setDate(start.getDate() + i);
			days.push(date);
		}
		return days;
	};

	const getMonthDays = () => {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const days = [];
		
		const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
		for (let i = 0; i < startDay; i++) {
			days.push(null);
		}
		
		for (let i = 1; i <= lastDay.getDate(); i++) {
			days.push(new Date(year, month, i));
		}
		
		return days;
	};

	const timeSlots = Array.from({ length: 15 }, (_, i) => {
		const hour = (i + 6).toString().padStart(2, '0');
		return `${hour}:00`;
	});

	const weekDays = getWeekDays();
	const monthDays = getMonthDays();
	const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
	const getWeekNumber = (date) => {
		const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNumber = target.getUTCDay() || 7;
		target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
		const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
		return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
	};

	const goToToday = () => setCurrentDate(new Date());
	const goToPrevious = () => {
		const newDate = new Date(currentDate);
		if (view === 'week') {
			newDate.setDate(newDate.getDate() - 7);
		} else {
			newDate.setMonth(newDate.getMonth() - 1);
		}
		setCurrentDate(newDate);
	};
	const goToNext = () => {
		const newDate = new Date(currentDate);
		if (view === 'week') {
			newDate.setDate(newDate.getDate() + 7);
		} else {
			newDate.setMonth(newDate.getMonth() + 1);
		}
		setCurrentDate(newDate);
	};

	const goToPreviousMonth = () => {
		const newDate = new Date(currentDate);
		newDate.setMonth(newDate.getMonth() - 1);
		setCurrentDate(newDate);
	};

	const goToNextMonth = () => {
		const newDate = new Date(currentDate);
		newDate.setMonth(newDate.getMonth() + 1);
		setCurrentDate(newDate);
	};

	const isToday = (date) => {
		const today = new Date();
		return date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear();
	};

	const getEventPosition = (event) => {
		const [startHour] = event.startTime.split(':').map(Number);
		const [endHour] = event.endTime.split(':').map(Number);
		const top = (startHour - 6) * 50; // Offset by 6 hours (business hours start), 50px per hour
		const height = (endHour - startHour) * 50;
		return { top: `${top}px`, height: `${height}px` };
	};

	const events = useMemo(() => {
		return scheduledRequests
			.map((req) => {
				const times = buildEventTimes(req.scheduled_date);
				if (!times.date) return null;
				return {
					id: req.id,
					title: req.subject || 'Scheduled Maintenance',
					date: times.date,
					startTime: times.startTime,
					endTime: times.endTime,
					priority: 'medium',
					equipment: req.equipment_name || req.work_center_name || '',
				};
			})
			.filter(Boolean);
	}, [scheduledRequests]);
	const visibleEvents = events.filter((event) => weekDays.some((day) =>
		event.date.getDate() === day.getDate() &&
		event.date.getMonth() === day.getMonth() &&
		event.date.getFullYear() === day.getFullYear()
	));

	return (
		<div className="container manager-page manager-schedule-page">
			<PageHeader
				eyebrow="Manager workspace"
				title="Maintenance schedule"
				description="Review scheduled maintenance work by date."
				actions={<div className="calendar-controls" aria-label="Schedule navigation">
					<Button variant="secondary" aria-label="Previous week" onClick={goToPrevious}>←</Button>
					<Button variant="secondary" onClick={goToToday}>Today</Button>
					<Button variant="secondary" aria-label="Next week" onClick={goToNext}>→</Button>
					<select 
						className="calendar-view-select"
						value={view}
						onChange={(e) => setView(e.target.value)}
						aria-label="Schedule view"
					>
						<option value="week">Week</option>
					</select>
				</div>}
			/>

			{error && (
				<Alert tone="danger" title="Schedule could not be loaded">{error}</Alert>
			)}
			{loading && <div className="manager-state" role="status">Loading maintenance schedule...</div>}

			{!loading && !error && <div className="calendar-content">
				<div className="calendar-main">
					<div className="calendar-week-info">
						<span className="calendar-month-year">
							{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
						</span>
						<span className="calendar-week-number">Week {getWeekNumber(currentDate)}</span>
					</div>

					{visibleEvents.length === 0 ? <EmptyState title="No work scheduled this week" description="Use the week controls to review another period. Scheduled requests will appear here." /> : <div className="calendar-grid">
						<div className="calendar-time-column">
							{timeSlots.map((time) => (
								<div key={time} className="time-slot">{time}</div>
							))}
						</div>

						<div className="calendar-days-grid">
							<div className="calendar-day-headers">
								{weekDays.map((day, idx) => (
									<div key={idx} className="day-header">
										<div className="day-name">{dayNames[day.getDay()]}</div>
										<div className={`day-number ${isToday(day) ? 'today' : ''}`}>
											{day.getDate()}
										</div>
									</div>
								))}
							</div>

							<div className="calendar-week-body">
								{weekDays.map((day, idx) => (
									<div key={idx} className="calendar-day-column">
										{timeSlots.map((time) => (
											<div key={time} className="calendar-time-cell"></div>
										))}
										{events
											.filter(req => 
												req.date.getDate() === day.getDate() &&
												req.date.getMonth() === day.getMonth() &&
												req.date.getFullYear() === day.getFullYear()
											)
											.map(event => (
												<div
													key={event.id}
													className={`calendar-event priority-${event.priority}`}
													style={getEventPosition(event)}
												>
													{event.title}
												</div>
											))
										}
									</div>
								))}
							</div>
						</div>
					</div>}
				</div>

				<div className="calendar-mini">
					<div className="mini-calendar-header">
						<button className="mini-nav-btn" onClick={goToPreviousMonth}>←</button>
						<span className="mini-month-year">
							{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
						</span>
						<button className="mini-nav-btn" onClick={goToNextMonth}>→</button>
					</div>

					<div className="mini-calendar-grid">
						<div className="mini-day-names">
							{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
								<div key={idx} className="mini-day-name">{day}</div>
							))}
						</div>
						<div className="mini-days">
							{monthDays.map((day, idx) => (
								<button
									type="button"
									key={idx} 
									className={`mini-day ${day ? '' : 'empty'} ${day && isToday(day) ? 'today' : ''} ${day && day.getDate() === currentDate.getDate() ? 'selected' : ''}`}
									disabled={!day}
									onClick={() => day && setCurrentDate(day)}
									aria-label={day ? day.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : undefined}
									aria-current={day && isToday(day) ? 'date' : undefined}
									aria-pressed={day ? day.getDate() === currentDate.getDate() : undefined}
								>
									{day ? day.getDate() : ''}
								</button>
							))}
						</div>
					</div>
				</div>
			</div>}
		</div>
	);
}

