import { useEffect, useRef } from 'react';

const focusableSelector = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter((element) => !element.hasAttribute('hidden'));
    const focusInitialControl = window.setTimeout(() => (focusable()[0] ?? dialogRef.current)?.focus(), 0);

    function trapFocus(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (controls.length === 0) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener('keydown', trapFocus);
    return () => {
      window.clearTimeout(focusInitialControl);
      document.removeEventListener('keydown', trapFocus);
      previouslyFocused?.focus();
    };
  }, [active, onClose]);

  return dialogRef;
}
