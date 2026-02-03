import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../state/useAppState";
import Dancer from "./Dancer";
import CoupleToken from "./CoupleToken";
import { Vec2 } from "../types";

const STAGE_HALF_M = 8;                 // -8..+8
const STAGE_SIZE_M = STAGE_HALF_M * 2;  // 16
const MINOR_STEP_M = 1;
const SPECIAL_METERS = new Set([3, 6]);

export default function Stage2D() {
  const { dancers, couples, viewMode } = useAppState();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Measure once + keep stable on resize (prevents "zoom jump" on first drag)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit 16m inside the panel with some margin
  const pxPerM = useMemo(() => {
    const { w, h } = size;
    if (w <= 1 || h <= 1) return 60; // safe default
    const margin = 24; // px
    const usable = Math.min(w, h) - margin;
    return usable / STAGE_SIZE_M;
  }, [size]);

  const metersToPixels = useCallback(
    (p: Vec2) => {
      const w = size.w || 800;
      const h = size.h || 500;
      const cx = w / 2;
      const cy = h / 2;
      return { x: cx + p.x * pxPerM, y: cy - p.y * pxPerM };
    },
    [size, pxPerM]
  );

  const isInsideStage = (p: Vec2) =>
    p.x >= -STAGE_HALF_M &&
    p.x <= STAGE_HALF_M &&
    p.y >= -STAGE_HALF_M &&
    p.y <= STAGE_HALF_M;

  return (
    <div className="stage2d" ref={containerRef}>
      <svg className="stage2d-grid" width="100%" height="100%">
        <GridSVG metersToPixels={metersToPixels} />
      </svg>

      {viewMode === "couples" &&
        couples.map((c) => {
          const a = dancers.find((d) => d.id === c.dancerLeader);
          if (!a) return null;
          if (!isInsideStage(a.position)) return null;

          return (
            <CoupleToken
              key={c.id}
              coupleId={c.id}
              metersToPixels={metersToPixels}
              pxPerM={pxPerM}
            />
          );
        })}

      {viewMode === "dancers" &&
        dancers.map((d) => {
          if (!isInsideStage(d.position)) return null;
          return (
            <Dancer
              key={d.id}
              dancer={d}
              metersToPixels={metersToPixels}
              pxPerM={pxPerM}
            />
          );
        })}
    </div>
  );
}

function GridSVG({
  metersToPixels
}: {
  metersToPixels: (p: Vec2) => { x: number; y: number };
}) {
  const lines: JSX.Element[] = [];

  const topLeft = metersToPixels({ x: -STAGE_HALF_M, y: STAGE_HALF_M });
  const bottomRight = metersToPixels({ x: STAGE_HALF_M, y: -STAGE_HALF_M });

  const stageX = topLeft.x;
  const stageY = topLeft.y;
  const stageW = bottomRight.x - topLeft.x;
  const stageH = bottomRight.y - topLeft.y;

  // Vertical lines
  for (let xm = -STAGE_HALF_M; xm <= STAGE_HALF_M; xm += MINOR_STEP_M) {
    const abs = Math.abs(xm);
    const isAxis = xm === 0;
    const isSpecial = SPECIAL_METERS.has(abs);

    const p1 = metersToPixels({ x: xm, y: -STAGE_HALF_M });
    const p2 = metersToPixels({ x: xm, y: STAGE_HALF_M });

    lines.push(
      <line
        key={`vx-${xm}`}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={
          isAxis
            ? "rgba(255,235,210,0.55)"
            : isSpecial
            ? "rgba(255,235,210,0.38)"
            : "rgba(255,235,210,0.18)"
        }
        strokeWidth={isAxis ? 3 : isSpecial ? 2 : 1}
      />
    );
  }

  // Horizontal lines
  for (let ym = -STAGE_HALF_M; ym <= STAGE_HALF_M; ym += MINOR_STEP_M) {
    const abs = Math.abs(ym);
    const isAxis = ym === 0;
    const isSpecial = SPECIAL_METERS.has(abs);

    const p1 = metersToPixels({ x: -STAGE_HALF_M, y: ym });
    const p2 = metersToPixels({ x: STAGE_HALF_M, y: ym });

    lines.push(
      <line
        key={`hy-${ym}`}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={
          isAxis
            ? "rgba(255,235,210,0.55)"
            : isSpecial
            ? "rgba(255,235,210,0.38)"
            : "rgba(255,235,210,0.18)"
        }
        strokeWidth={isAxis ? 3 : isSpecial ? 2 : 1}
      />
    );
  }

  return (
    <g>
      <rect
        x={stageX}
        y={stageY}
        width={stageW}
        height={stageH}
        fill="none"
        stroke="rgba(255,235,210,0.45)"
        strokeWidth="2"
      />

      {lines}

      {/* Origin */}
      {(() => {
        const o = metersToPixels({ x: 0, y: 0 });
        return (
          <text x={o.x + 6} y={o.y - 6} fill="rgba(255,235,210,0.75)" fontSize="12">
            (0,0)
          </text>
        );
      })()}
    </g>
  );
}