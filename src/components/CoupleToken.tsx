import React, { useRef } from "react";
import { useAppState } from "../state/useAppState";
import { Vec2 } from "../types";

type Props = {
  coupleId: string;
  metersToPixels: (p: Vec2) => { x: number; y: number };
  pxPerM: number;
};

const SNAP_M = 0.5;
const STAGE_HALF_M = 8;

function snap(v: number) {
  return Math.round(v / SNAP_M) * SNAP_M;
}
function clamp(v: number) {
  return Math.max(-STAGE_HALF_M, Math.min(STAGE_HALF_M, v));
}
function fmtHalf(v: number) {
  const s = snap(v);
  return Number.isInteger(s) ? String(s) : s.toFixed(1);
}

export default function CoupleToken({ coupleId, metersToPixels, pxPerM }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { couples, dancers, moveCoupleToPosition } = useAppState();

  const couple = couples.find((c) => c.id === coupleId);
  if (!couple) return null;

  // In couples mode we use dancerA as the anchor position (both dancers share this)
  const a = dancers.find((d) => d.id === couple.dancerLeader);
  if (!a) return null;

  const center = a.position;
  const px = metersToPixels(center);
  const meterLabel = `${fmtHalf(center.x)}, ${fmtHalf(center.y)}`;

  function clientToStageMeters(clientX: number, clientY: number, parent: HTMLElement): Vec2 {
    const rect = parent.getBoundingClientRect();

    const scaleX = parent.offsetWidth / rect.width;
    const scaleY = parent.offsetHeight / rect.height;

    const xPx = (clientX - rect.left) * scaleX;
    const yPx = (clientY - rect.top) * scaleY;

    const cx = parent.offsetWidth / 2;
    const cy = parent.offsetHeight / 2;

    return { x: (xPx - cx) / pxPerM, y: (cy - yPx) / pxPerM };
  }

  function onPointerDown(e: React.PointerEvent) {
    const elem = ref.current;
    const parent = elem?.parentElement;
    if (!elem || !parent) return;

    elem.setPointerCapture(e.pointerId);

    const pointer0 = clientToStageMeters(e.clientX, e.clientY, parent);
    const offset: Vec2 = { x: center.x - pointer0.x, y: center.y - pointer0.y };

    function moveHandler(ev: PointerEvent) {
      const p = clientToStageMeters(ev.clientX, ev.clientY, parent);
      let target: Vec2 = { x: p.x + offset.x, y: p.y + offset.y };

      target = { x: clamp(snap(target.x)), y: clamp(snap(target.y)) };
      moveCoupleToPosition(coupleId, target);
    }

    function upHandler() {
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", upHandler);
      try {
        elem.releasePointerCapture(e.pointerId);
      } catch {}
    }

    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler);
  }

  return (
    <div
      ref={ref}
      className="coupleToken"
      onPointerDown={onPointerDown}
      style={{ left: `${px.x}px`, top: `${px.y}px` }}
      title={(couple.name ?? couple.id) + ` @ (${meterLabel})`}
    >
      <div className="coupleTokenId">{coupleId.replace("c", "C")}</div>
      <div className="coupleTokenMeters">{meterLabel}</div>
    </div>
  );
}