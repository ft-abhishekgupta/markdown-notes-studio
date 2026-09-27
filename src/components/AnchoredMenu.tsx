import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A pop-up menu anchored to a point in the viewport.
 *
 * It renders into `document.body` on purpose: the sidebar is `position: sticky`,
 * which creates a stacking context, so a menu rendered inside it can never paint
 * above the page content no matter how high its z-index is. The portal also
 * keeps `position: fixed` honest if an ancestor ever gains a transform.
 *
 * The position is nudged back inside the viewport before the first paint, so a
 * menu opened near an edge stays fully visible.
 */
export function AnchoredMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    setPos({ left, top });
  }, [x, y]);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="menu-backdrop" onMouseDown={onClose} />
      <div className="anchored-menu" ref={ref} style={{ left: pos.left, top: pos.top }}>
        {children}
      </div>
    </>,
    document.body,
  );
}
