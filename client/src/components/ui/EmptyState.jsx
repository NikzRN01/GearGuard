import React from 'react';

function EmptyIcon({ tone }) {
  if (tone === 'success') return <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>;
  if (tone === 'search') return <svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></svg>;
  if (tone === 'selection') return <svg viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
  if (tone === 'error') return <svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01" /><circle cx="12" cy="12" r="9" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M7 12h10" /><circle cx="12" cy="12" r="9" /></svg>;
}

export default function EmptyState({ title, description, action, compact = false, tone = 'neutral' }) {
  return (
    <div className={`gg-empty-state gg-empty-state--${tone} ${compact ? 'gg-empty-state--compact' : ''}`}>
      <div className="gg-empty-state__icon" aria-hidden="true"><EmptyIcon tone={tone} /></div>
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
