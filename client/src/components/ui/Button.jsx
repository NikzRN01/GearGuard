import React from 'react';
import { Link } from 'react-router-dom';

const classes = (...values) => values.filter(Boolean).join(' ');

export default function Button({
  as = 'button',
  variant = 'primary',
  size = 'medium',
  pending = false,
  pendingLabel = 'Working...',
  className = '',
  children,
  ...props
}) {
  const componentClass = classes('gg-button', `gg-button--${variant}`, `gg-button--${size}`, className);

  if (as === 'link') {
    return <Link className={componentClass} {...props}>{children}</Link>;
  }

  return <button className={componentClass} type={props.type || 'button'} {...props} disabled={pending || props.disabled} aria-busy={pending || undefined}>{pending && <span className="gg-button__spinner" aria-hidden="true" />}<span>{pending ? pendingLabel : children}</span></button>;
}
