import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  children: React.ReactNode;
};

export default function Dropdown({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as Node;

      const inAnchor = !!anchorRef.current?.contains(target);
      const inMenu = !!menuRef.current?.contains(target);

      // Only close if click is outside BOTH the anchor and the portal menu
      if (!inAnchor && !inMenu) {
        setOpen(false);
      }
    }

    // Use capture so we see it early, but we now correctly treat menu clicks as inside
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, []);

  function toggle() {
    const el = anchorRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
    setOpen(o => !o);
  }

  return (
    <>
      <div ref={anchorRef} className="dd-anchor">
        <button type="button" className="dd-button" onClick={toggle}>
          {label}
        </button>
      </div>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="dd-menu"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              zIndex: 10000,
            }}
            // extra safety: stop bubbling to anything else
            onPointerDown={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}