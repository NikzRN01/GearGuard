import React, { cloneElement, useId } from 'react';

export default function Field({ label, hint, error, required = false, children, className = '' }) {
  const generatedId = useId();
  const controlId = children.props.id || generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`gg-field ${error ? 'gg-field--error' : ''} ${className}`}>
      <label className="gg-field__label" htmlFor={controlId}>
        {label}{required && <span className="gg-field__required" aria-hidden="true"> *</span>}
      </label>
      {cloneElement(children, {
        id: controlId,
        required: required || children.props.required,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-describedby': describedBy
      })}
      {hint && <p className="gg-field__hint" id={hintId}>{hint}</p>}
      {error && <p className="gg-field__error" id={errorId}>{error}</p>}
    </div>
  );
}
