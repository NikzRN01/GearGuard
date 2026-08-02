import React from 'react';

export default function Panel({ title, eyebrow, action, children, className = '', ariaLabel, ...props }) {
  return (
    <section className={`gg-panel ${className}`} aria-label={ariaLabel} {...props}>
      {(title || eyebrow || action) && (
        <header className="gg-panel__header">
          <div>
            {eyebrow && <p className="gg-eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {action && <div className="gg-panel__action">{action}</div>}
        </header>
      )}
      <div className="gg-panel__body">{children}</div>
    </section>
  );
}
