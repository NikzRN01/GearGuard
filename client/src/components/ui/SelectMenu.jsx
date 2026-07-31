import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SelectMenu({ value, options, onChange, ariaLabel, disabled = false, portal = false }) {
  const [open, setOpen] = useState(false);
  const [portalStyle, setPortalStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex] || options[0];

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const focusOption = (index) => {
    const next = (index + options.length) % options.length;
    optionRefs.current[next]?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    requestAnimationFrame(() => focusOption(selectedIndex));
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open || !portal) return undefined;
    const position = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = Math.min(options.length * 44 + 16, 180);
      const opensUpward = window.innerHeight - rect.bottom < menuHeight + 12 && rect.top > menuHeight;
      setPortalStyle({ top: opensUpward ? rect.top - menuHeight - 8 : rect.bottom + 8, left: rect.left, width: rect.width });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, options.length, portal]);

  const choose = (option) => {
    onChange(option.value);
    close();
  };

  const handleTriggerKeyDown = (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleOptionKeyDown = (event, index) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(index + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusOption(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); focusOption(0); }
    else if (event.key === 'End') { event.preventDefault(); focusOption(options.length - 1); }
    else if (event.key === 'Escape' || event.key === 'Tab') close(event.key === 'Escape');
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(options[index]); }
  };

  const menu = (
    <div ref={popoverRef} className={`gg-select-menu__popover${portal ? ' gg-select-menu__popover--portal' : ''}`} style={portal ? portalStyle || undefined : undefined} id={listboxId} role="listbox" aria-label={ariaLabel}>
      {options.map((option, index) => (
        <button key={option.value} ref={(node) => { optionRefs.current[index] = node; }} type="button" role="option" tabIndex={option.value === value ? 0 : -1} aria-selected={option.value === value} className="gg-select-menu__option" onClick={() => choose(option)} onKeyDown={(event) => handleOptionKeyDown(event, index)}>
          <span>{option.label}</span>
          {option.value === value && <span aria-hidden="true">✓</span>}
        </button>
      ))}
    </div>
  );

  return (
    <div className="gg-select-menu" ref={rootRef}>
      <button ref={triggerRef} type="button" className="gg-select-menu__trigger" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listboxId : undefined} onClick={() => !disabled && setOpen((current) => !current)} onKeyDown={handleTriggerKeyDown}>
        <span>{selected?.label}</span>
        <span className="gg-select-menu__chevron" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </button>
      {open && (portal ? createPortal(menu, document.body) : menu)}
    </div>
  );
}
