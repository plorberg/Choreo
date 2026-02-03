import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../state/useAppState";
import { useTransport } from "../state/useTransport";
import { useChoreo } from "../state/useChoreo";
import Dancer from "./Dancer";
import CoupleToken from "./CoupleToken";
import { Vec2 } from "../types";

const STAGE_HALF_M = 8;
const STAGE_SIZE_M = 16;

const MINOR_STEP_M = 1;
const SPECIAL_METERS = new Set([3, 6]);

export default function Stage2D() {
  const { dancers, couples, viewMode } = useAppState();
  const t = useTransport();
  const choreo = useChoreo();

  const containerRef = useRef<HTMLDivElement | null>(null);
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

  const pxPerM = useMemo(() => {
    const { w, h } = size;
    if (w <= 1 || h <= 1) return 60;
    const margin = 24;
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
    p.x >= -STAGE_HALF_M && p.x <= STAGE_HALF_M && p.y >= -STAGE_HALF_M && p.y <= STAGE_HALF_M;

  // Pose override while playing inside active segment loop
  const pose =
    t.isPlaying ? choreo.getPoseAtSec(viewMode, t.currentSec) : null;

  return (
    <div
      className="stage2d"
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%"
      }}
    >
      <svg
        className="stage2d-grid"
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}
      >
        <GridSVG metersToPixels={metersToPixels} />
      </svg>

      <div style={{ position: "absolute", inset: 0, zIndex: 2 }}>
        {viewMode === "couples" &&
          couples.map((c: any) => {
            const leader = dancers.find((d: any) => d.id === c.dancerLeader);
            if (!leader) return null;

            const displayPos = (pose && pose[c.id]) ? pose[c.id] : leader.position;
            if (!isInsideStage(displayPos)) return null;

            // CoupleToken handles drag/edit via real state. Pose is for visualization.
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
          dancers.map((d: any) => {
            const displayPos = (pose && pose[d.id]) ? pose[d.id] : d.position;
            if (!isInsideStage(displayPos)) return null;
            return (
              <Dancer
                key={d.id}
                dancer={{ ...d, position: displayPos }}
                metersToPixels={metersToPixels}
                pxPerM={pxPerM}
              />
            );
          })}
      </div>
    </div>
  );
}

function GridSVG({ metersToPixels }: { metersToPixels: (p: Vec2) => { x: number; y: number } }) {
  const lines: JSX.Element[] = [];

  const topLeft = metersToPixels({ x: -STAGE_HALF_M, y: STAGE_HALF_M });
  const bottomRight = metersToPixels({ x: STAGE_HALF_M, y: -STAGE_HALF_M });

  const stageX = topLeft.x;
  const stageY = topLeft.y;
  const stageW = bottomRight.x - topLeft.x;
  const stageH = bottomRight.y - topLeft.y;

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
          isAxis ? "rgba(255,235,210,0.55)" : isSpecial ? "rgba(255,235,210,0.38)" : "rgba(255,235,210,0.18)"
        }
        strokeWidth={isAxis ? 3 : isSpecial ? 2 : 1}
      />
    );
  }

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
          isAxis ? "rgba(255,235,210,0.55)" : isSpecial ? "rgba(255,235,210,0.38)" : "rgba(255,235,210,0.18)"
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
    </g>
  );
}