import React, { useRef } from "react";
import { Dancer as DancerType, Vec2 } from "../types";
import { useAppState } from "../state/useAppState";

type Props = {
  dancer: DancerType;
  metersToPixels: (p: Vec2) => { x: number; y: number };
  pxPerM: number;
};

const SNAP_M = 0.5;
const STAGE_HALF_M = 8;

const BLUE = "#2E7DFF";
const PINK = "#FF4FA3";

function snap(v: number) {
  return Math.round(v / SNAP_M) * SNAP_M;
}
function clamp(v: number) {
  return Math.max(-STAGE_HALF_M, Math.min(STAGE_HALF_M, v));
}

export default function Dancer({ dancer, metersToPixels, pxPerM }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { setDancerPosition } = useAppState();

  const px = metersToPixels(dancer.position);

  const color = dancer.role === "Leader" ? BLUE : dancer.role === "Follower" ? PINK : "#ffffff";

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

    const pointerM0 = clientToStageMeters(e.clientX, e.clientY, parent);
    const offset: Vec2 = {
      x: dancer.position.x - pointerM0.x,
      y: dancer.position.y - pointerM0.y
    };

    function moveHandler(ev: PointerEvent) {
      const pointerM = clientToStageMeters(ev.clientX, ev.clientY, parent);

      let target = {
        x: pointerM.x + offset.x,
        y: pointerM.y + offset.y
      };

      target = {
        x: clamp(snap(target.x)),
        y: clamp(snap(target.y))
      };

      setDancerPosition(dancer.id, target);
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
      className="dancer"
      onPointerDown={onPointerDown}
      style={{
        left: `${px.x}px`,
        top: `${px.y}px`,
        background: color,
        width: 28,
        height: 28
      }}
      title={`Couple ${dancer.label} (${dancer.role ?? "?"})`}
    >
      {dancer.label}
    </div>
  );
}