import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import { getSessionUser } from '../services/session';

// Pure date helpers: they read nothing from the component, so they live at
// module scope. That also keeps them out of every hook dependency list.
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

export default function Calendar() {
	const navigate = useNavigate();
	const sessionRole = getSessionUser()?.role;
	const isAdmin = sessionRole === 'admin';
	const [currentDate, setCurrentDate] = useState(new Date());
	const [view, setView] = useState('week');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [scheduledRequests, setScheduledRequests] = useState([]);
	const [navigationDirection, setNavigationDirection] = useState('fade');
	const calendarSwipeRef = useRef(null);
	const wheelSwipeRef = useRef({ distance: 0, lastEventAt: 0, triggered: false, resetTimer: null });

	useEffect(() => () => {
		if (wheelSwipeRef.current.resetTimer) window.clearTimeout(wheelSwipeRef.current.resetTimer);
	}, []);

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

	const goToToday = () => {
		setNavigationDirection('fade');
		setCurrentDate(new Date());
	};
	const goToPrevious = () => {
		setNavigationDirection('previous');
		const newDate = new Date(currentDate);
		if (view === 'week') {
			newDate.setDate(newDate.getDate() - 7);
		} else {
			newDate.setMonth(newDate.getMonth() - 1);
		}
		setCurrentDate(newDate);
	};
	const goToNext = () => {
		setNavigationDirection('next');
		const newDate = new Date(currentDate);
		if (view === 'week') {
			newDate.setDate(newDate.getDate() + 7);
		} else {
			newDate.setMonth(newDate.getMonth() + 1);
		}
		setCurrentDate(newDate);
	};

	const beginCalendarSwipe = (event) => {
		if (event.pointerType !== 'touch' || event.target.closest('button, select, input, a')) return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		calendarSwipeRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
	};

	const finishCalendarSwipe = (event) => {
		const start = calendarSwipeRef.current;
		calendarSwipeRef.current = null;
		if (!start || start.pointerId !== event.pointerId) return;

		const horizontalDistance = event.clientX - start.x;
		const verticalDistance = event.clientY - start.y;
		if (Math.abs(horizontalDistance) < 96 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.45) return;
		if (horizontalDistance < 0) goToNext();
		else goToPrevious();
	};

	const cancelCalendarSwipe = () => {
		calendarSwipeRef.current = null;
	};

	const handleCalendarWheel = (event) => {
		const horizontal = event.deltaX;
		const vertical = event.deltaY;
		const state = wheelSwipeRef.current;
		if (state.triggered && Math.abs(horizontal) >= 1) {
			event.preventDefault();
			if (state.resetTimer) window.clearTimeout(state.resetTimer);
			state.resetTimer = window.setTimeout(() => {
				state.distance = 0;
				state.triggered = false;
				state.resetTimer = null;
			}, 280);
			return;
		}
		if (Math.abs(horizontal) < 6 || Math.abs(horizontal) <= Math.abs(vertical) * 1.45) return;

		const scrollRegion = event.target.closest('.calendar-grid, .calendar-month-grid');
		if (scrollRegion && scrollRegion.scrollWidth > scrollRegion.clientWidth) {
			const movingLeft = horizontal < 0;
			const canScrollLeft = scrollRegion.scrollLeft > 0;
			const canScrollRight = scrollRegion.scrollLeft + scrollRegion.clientWidth < scrollRegion.scrollWidth - 1;
			if ((movingLeft && canScrollLeft) || (!movingLeft && canScrollRight)) return;
		}

		event.preventDefault();
		const now = Date.now();
		if (state.resetTimer) window.clearTimeout(state.resetTimer);
		state.resetTimer = window.setTimeout(() => {
			state.distance = 0;
			state.triggered = false;
			state.resetTimer = null;
		}, 280);
		if (state.triggered) return;
		if (now - state.lastEventAt > 180) state.distance = 0;
		if (state.distance !== 0 && Math.sign(state.distance) !== Math.sign(horizontal)) state.distance = 0;
		state.lastEventAt = now;
		state.distance += horizontal;
		if (Math.abs(state.distance) < 120) return;

		if (state.distance > 0) goToNext();
		else goToPrevious();
		state.distance = 0;
		state.triggered = true;
	};

	const goToPreviousMonth = () => {
		setNavigationDirection('previous');
		const newDate = new Date(currentDate);
		newDate.setMonth(newDate.getMonth() - 1);
		setCurrentDate(newDate);
	};

	const goToNextMonth = () => {
		setNavigationDirection('next');
		const newDate = new Date(currentDate);
		newDate.setMonth(newDate.getMonth() + 1);
		setCurrentDate(newDate);
	};

	const isToday = (date) => {
		const today = new Date();
		return isSameDate(date, today);
	};

	const isSameDate = (first, second) => {
		return first.getDate() === second.getDate() &&
			first.getMonth() === second.getMonth() &&
			first.getFullYear() === second.getFullYear();
	};

	const getEventPosition = (event) => {
		const [startHour] = event.startTime.split(':').map(Number);
		const [endHour] = event.endTime.split(':').map(Number);
		const top = (startHour - 6) * 50; // Offset by 6 hours (business hours start), 50px per hour
		const height = (endHour - startHour) * 50;
		return { top: `${top}px`, height: `${height}px` };
	};

	const openRequest = (requestId) => {
		if (sessionRole === 'manager' || sessionRole === 'admin') {
			navigate(`/app/manager/requests/${requestId}`);
			return;
		}
		navigate('/app/requests');
	};

	const openDay = (day) => {
		setNavigationDirection('fade');
		setCurrentDate(day);
		setView('week');
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
		isSameDate(event.date, day)
	));
	const monthEvents = events.filter((event) =>
		event.date.getMonth() === currentDate.getMonth() &&
		event.date.getFullYear() === currentDate.getFullYear()
	);
	const periodEvents = view === 'month' ? monthEvents : visibleEvents;
	const weekRange = `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
	const periodLabel = view === 'month' ? `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}` : weekRange;
	const transitionKey = `${view}-${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
	const transitionClass = `calendar-period-transition calendar-period-transition--${navigationDirection}`;

	return (
		<div className="container manager-page manager-schedule-page">
			<PageHeader
				eyebrow={isAdmin ? 'Admin operations' : 'Manager workspace'}
				title="Maintenance schedule"
				description="Review scheduled maintenance work by date."
				actions={<div className="calendar-controls" aria-label="Schedule navigation">
					<Button variant="secondary" aria-label={`Previous ${view}`} title={`Previous ${view}`} onClick={goToPrevious}>←</Button>
					<Button variant="secondary" onClick={goToToday}>Today</Button>
					<Button variant="secondary" aria-label={`Next ${view}`} title={`Next ${view}`} onClick={goToNext}>→</Button>
					<select 
						className="calendar-view-select"
						value={view}
						onChange={(e) => {
							setNavigationDirection('fade');
							setView(e.target.value);
						}}
						aria-label="Schedule view"
					>
						<option value="week">Week</option>
						<option value="month">Month</option>
					</select>
				</div>}
			/>

			{error && (
				<Alert tone="danger" title="Schedule could not be loaded">{error}</Alert>
			)}
			{loading && <div className="manager-state" role="status">Loading maintenance schedule...</div>}

			{!loading && !error && <div className="calendar-content">
				<div
					className="calendar-main calendar-main--interactive"
					onPointerDown={beginCalendarSwipe}
					onPointerUp={finishCalendarSwipe}
					onPointerCancel={cancelCalendarSwipe}
					onWheel={handleCalendarWheel}
				>
					<div key={`header-${transitionKey}`} className={`calendar-week-info ${transitionClass}`}>
						<div>
							<span className="calendar-month-year">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
							<span className="calendar-week-range">{view === 'week' ? weekRange : 'Full month overview'}</span>
						</div>
						<div className="calendar-week-summary">
							<span><strong>{periodEvents.length}</strong> scheduled</span>
							<span className="calendar-week-number">{view === 'week' ? `Week ${getWeekNumber(currentDate)}` : 'Month view'}</span>
							<span className="calendar-gesture-hint">Swipe left or right to navigate</span>
						</div>
					</div>

					{periodEvents.length === 0 && <div className="calendar-empty-notice"><EmptyState compact title={`No work scheduled this ${view}`} description="Use the controls above or the month picker to review another period." /></div>}
					{view === 'week' ? <div key={`week-${transitionKey}`} className={`calendar-grid ${transitionClass}`} tabIndex="0" aria-label={`Week schedule for ${weekRange}`}>
						<div className="calendar-time-column">
							<div className="calendar-time-header" aria-hidden="true">Time</div>
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
											<button
												type="button"
												key={event.id}
												className={`calendar-event priority-${event.priority}`}
												style={getEventPosition(event)}
												title={`${event.title}${event.equipment ? ` — ${event.equipment}` : ''}, ${event.startTime}–${event.endTime}`}
												onClick={() => openRequest(event.id)}
												aria-label={`Open request: ${event.title}, ${event.startTime} to ${event.endTime}`}
											>
												<strong>{event.title}</strong>
												<span>{event.startTime}–{event.endTime}{event.equipment ? ` · ${event.equipment}` : ''}</span>
											</button>
											))
										}
									</div>
								))}
							</div>
						</div>
					</div> : <div key={`month-${transitionKey}`} className={`calendar-month-grid ${transitionClass}`} role="grid" aria-label={`Month schedule for ${periodLabel}`}>
						{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => <div key={day} className="calendar-month-weekday" role="columnheader">{day}</div>)}
						{monthDays.map((day, idx) => {
							const dayEvents = day ? monthEvents.filter((event) => isSameDate(event.date, day)) : [];
							return <div key={day ? day.toISOString() : `empty-${idx}`} className={`calendar-month-day${day && isToday(day) ? ' is-today' : ''}${day && isSameDate(day, currentDate) ? ' is-selected' : ''}${!day ? ' is-empty' : ''}`} role="gridcell">
								{day && <>
									<button type="button" className="calendar-month-date" onClick={() => openDay(day)} aria-label={`Open week of ${day.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`} aria-current={isToday(day) ? 'date' : undefined}>{day.getDate()}</button>
									<div className="calendar-month-events">
										{dayEvents.slice(0, 3).map((event) => <button type="button" key={event.id} className="calendar-month-event" title={`${event.title}, ${event.startTime}`} onClick={() => openRequest(event.id)} aria-label={`Open request: ${event.title}, ${event.startTime}`}><span>{event.startTime}</span><strong>{event.title}</strong></button>)}
										{dayEvents.length > 3 && <span className="calendar-month-more">+{dayEvents.length - 3} more</span>}
									</div>
								</>}
							</div>;
						})}
					</div>}
				</div>

				<div className="calendar-mini">
					<div className="mini-calendar-header">
						<button type="button" className="mini-nav-btn" aria-label="Previous month" onClick={goToPreviousMonth}>←</button>
						<span className="mini-month-year">
							{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
						</span>
						<button type="button" className="mini-nav-btn" aria-label="Next month" onClick={goToNextMonth}>→</button>
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
									className={`mini-day ${day ? '' : 'empty'} ${day && isToday(day) ? 'today' : ''} ${day && isSameDate(day, currentDate) ? 'selected' : ''}`}
									disabled={!day}
									onClick={() => {
										if (!day) return;
										setNavigationDirection('fade');
										setCurrentDate(day);
									}}
									aria-label={day ? day.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : undefined}
									aria-current={day && isToday(day) ? 'date' : undefined}
									aria-pressed={day ? isSameDate(day, currentDate) : undefined}
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

