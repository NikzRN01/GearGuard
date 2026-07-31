import React from 'react';

const STATUS_CONFIG = {
  new: { label: 'New', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'info' },
  assigned: { label: 'Assigned', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'active' },
  on_hold: { label: 'On hold', tone: 'warning' },
  repaired: { label: 'Repaired', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
  scrap: { label: 'Scrapped', tone: 'danger' }
};

export default function StatusBadge({ status, tone, children }) {
  const key = String(status || '').trim().toLowerCase().replaceAll(' ', '_');
  const config = STATUS_CONFIG[key] || { label: key ? key.replaceAll('_', ' ') : 'Unknown', tone: 'neutral' };
  return <span className={`gg-badge gg-badge--${tone || config.tone}`}>{children || config.label}</span>;
}

