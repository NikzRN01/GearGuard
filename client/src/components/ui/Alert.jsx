import React from 'react';

export default function Alert({ tone = 'info', title, children, action }) {
  return (
    <div className={`gg-alert gg-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
      {action && <div className="gg-alert__action">{action}</div>}
    </div>
  );
}

