import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function MenuItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="menuItem"
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
    </button>
  );
}

export function Submenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function openMenu() {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.right + 6 });
    setOpen(true);
  }

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      const inAnchor = !!anchorRef.current?.contains(t);
      const inMenu = !!menuRef.current?.contains(t);
      if (!inAnchor && !inMenu) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, []);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="menuItem menuItemHasSub"
        onPointerEnter={openMenu}
        onFocus={openMenu}
        onClick={() => setOpen(o => !o)}
      >
        <span>{label}</span>
        <span className="menuChevron">▸</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="submenuPanel"
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 11000 }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => setOpen(true)}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}