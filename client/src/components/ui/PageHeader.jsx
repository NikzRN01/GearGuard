import React from 'react';

export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="gg-page-header">
      <div className="gg-page-header__copy">
        {eyebrow && <p className="gg-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="gg-page-header__actions">{actions}</div>}
    </header>
  );
}

