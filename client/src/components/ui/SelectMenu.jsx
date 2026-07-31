import React, { useEffect, useId, useRef, useState } from 'react';

export default function SelectMenu({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
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
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, selectedIndex]);

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
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChange(options[index].value);
      close();
    }
  };

  return (
    <div className="gg-select-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="gg-select-menu__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selected?.label}</span>
        <span className="gg-select-menu__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="gg-select-menu__popover" id={listboxId} role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              role="option"
              tabIndex={option.value === value ? 0 : -1}
              aria-selected={option.value === value}
              className="gg-select-menu__option"
              onClick={() => { onChange(option.value); close(); }}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span>{option.label}</span>
              {option.value === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
