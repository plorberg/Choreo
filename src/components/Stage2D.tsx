import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../state/useAppState";
import { useChoreo, Vec2 } from "../state/useChoreo";

const STAGE_HALF = 8;
const SNAP = 0.5;
const PAD = 18;
const EMPHASIS_METERS = new Set([3, 6]);

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function snap(v: number, step: number) {
  return Math.round(v / step) * step;
}
function fmtHalf(v: number) {
  const r = Math.round(v * 2) / 2;
  const clean = Math.abs(r) < 1e-9 ? 0 : r;
  return String(clean);
}

function worldToScreen(p: Vec2, w: number, h: number) {
  const size = Math.min(w, h) - PAD * 2;
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;

  const sx = ox + ((p.x + STAGE_HALF) / (STAGE_HALF * 2)) * size;
  const sy = oy + ((STAGE_HALF - p.y) / (STAGE_HALF * 2)) * size;
  return { x: sx, y: sy, size, ox, oy };
}

function screenToWorld(px: number, py: number, w: number, h: number) {
  const size = Math.min(w, h) - PAD * 2;
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;

  const nx = clamp((px - ox) / size, 0, 1);
  const ny = clamp((py - oy) / size, 0, 1);

  const x = nx * (STAGE_HALF * 2) - STAGE_HALF;
  const y = STAGE_HALF - ny * (STAGE_HALF * 2);
  return { x, y };
}

function coupleLabelFromId(id: string, idx: number) {
  const m = id.match(/(\d+)\s*$/);
  return m ? m[1] : String(idx + 1);
}

// helper: get next MAIN picture index after i
function nextMainIndex(pictures: any[], i: number) {
  for (let j = i + 1; j < pictures.length; j++) {
    if (pictures[j]?.kind !== "move") return j; // main
  }
  return -1;
}

export default function Stage2D() {
  const app: any = useAppState();
  const choreo = useChoreo();

  const viewMode: "couples" | "dancers" = app.viewMode ?? "couples";
  const dancers: any[] = app.dancers ?? [];
  const couples: any[] = app.couples ?? [];

  const getCoupleLeaderId = (c: any) => String(c.dancerLeader ?? c.leaderId ?? c.leader ?? c.Leader ?? c.a ?? c.A);
  const getCoupleFollowerId = (c: any) =>
    String(c.dancerFollower ?? c.followerId ?? c.follower ?? c.Follower ?? c.b ?? c.B);

  // playback pose
  const dancerPose = choreo.getPoseAtSec(choreo.currentSec);
  const isPlayback = Boolean(choreo.isPlaying && dancerPose);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState({ w: 800, h: 800 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setRect({ w: Math.max(200, r.width), h: Math.max(200, r.height) });
    });
    ro.observe(el);

    const r = el.getBoundingClientRect();
    setRect({ w: Math.max(200, r.width), h: Math.max(200, r.height) });

    return () => ro.disconnect();
  }, []);

  const findDancer = (id: string) => dancers.find((x) => String(x.id) === String(id));
  const getDancerPosFromApp = (id: string): Vec2 | null => {
    const d = findDancer(id);
    return d?.position ? { x: d.position.x, y: d.position.y } : null;
  };
  const getDancerPos = (id: string): Vec2 | null => {
    if (isPlayback && dancerPose?.[id]) return { x: dancerPose[id].x, y: dancerPose[id].y };
    return getDancerPosFromApp(id);
  };

function setDancerPosFree(id: string, pos: Vec2) {
  const p = {
    x: clamp(pos.x, -STAGE_HALF, STAGE_HALF),
    y: clamp(pos.y, -STAGE_HALF, STAGE_HALF),
  };

  if (typeof app.moveDancer === "function") return app.moveDancer(id, p);
  if (typeof app.setDancers === "function") {
    return app.setDancers((prev: any[]) =>
      prev.map((d) => (String(d.id) === String(id) ? { ...d, position: p } : d))
    );
  }
  const d = findDancer(id);
  if (d) d.position = p;
}

function snapDancerPos(id: string) {
  const cur = getDancerPosFromApp(id);
  if (!cur) return;

  const p = {
    x: clamp(snap(cur.x, SNAP), -STAGE_HALF, STAGE_HALF),
    y: clamp(snap(cur.y, SNAP), -STAGE_HALF, STAGE_HALF),
  };

  if (typeof app.moveDancer === "function") return app.moveDancer(id, p);
  if (typeof app.setDancers === "function") {
    return app.setDancers((prev: any[]) =>
      prev.map((d) => (String(d.id) === String(id) ? { ...d, position: p } : d))
    );
  }
  const d = findDancer(id);
  if (d) d.position = p;
}

  function moveCoupleByDelta(coupleId: string, dx: number, dy: number) {
    const c = couples.find((x) => String(x.id) === String(coupleId));
    if (!c) return;

    const leaderId = getCoupleLeaderId(c);
    const followerId = getCoupleFollowerId(c);

    const lp = getDancerPosFromApp(leaderId);
    const fp = getDancerPosFromApp(followerId);

    if (lp) setDancerPos(leaderId, { x: lp.x + dx, y: lp.y + dy });
    if (fp) setDancerPos(followerId, { x: fp.x + dx, y: fp.y + dy });
  }

  type Item =
    | { key: string; kind: "couple"; coupleId: string; label: string; pos: Vec2; color: string; selectIds: string[] }
    | { key: string; kind: "dancer"; dancerId: string; label: string; pos: Vec2; color: string; selectIds: string[] };

  const items: Item[] = useMemo(() => {
    if (viewMode === "couples") {
      return couples
        .map((c, idx) => {
          const coupleId = String(c.id ?? idx + 1);
          const label = coupleLabelFromId(coupleId, idx);

          const leaderId = getCoupleLeaderId(c);
          const followerId = getCoupleFollowerId(c);

          const lp = getDancerPos(leaderId);
          if (!lp) return null;

          return {
            key: `c_${coupleId}`,
            kind: "couple" as const,
            coupleId,
            label,
            pos: lp,
            color: "#f2f2f2",
            selectIds: [leaderId, followerId].filter(Boolean),
          };
        })
        .filter(Boolean) as Item[];
    }

    return couples
      .map((c, idx) => {
        const coupleId = String(c.id ?? idx + 1);
        const label = coupleLabelFromId(coupleId, idx);

        const leaderId = getCoupleLeaderId(c);
        const followerId = getCoupleFollowerId(c);

        const lp = getDancerPos(leaderId);
        let fp = getDancerPos(followerId);

        if (!lp) return null;
        if (!fp) fp = { x: lp.x - 0.5, y: lp.y };
        if (Math.abs(fp.x - lp.x) < 1e-9 && Math.abs(fp.y - lp.y) < 1e-9) fp = { x: lp.x - 0.5, y: lp.y };

        return [
          { key: `d_${coupleId}_L`, kind: "dancer" as const, dancerId: leaderId, label, pos: lp, color: "#5aa0ff", selectIds: [leaderId] },
          { key: `d_${coupleId}_F`, kind: "dancer" as const, dancerId: followerId, label, pos: fp, color: "#ff77b7", selectIds: [followerId] },
        ];
      })
      .flat()
      .filter(Boolean) as Item[];
  }, [viewMode, couples, dancers, isPlayback, dancerPose]);

  // Dragging
  const dragRef = useRef<null | { dancerIds: string[]; lastPointer: Vec2 }>(null);

useEffect(() => {
  const onMove = (e: PointerEvent) => {
    if (choreo.isPlaying) return;
    const drag = dragRef.current;
    if (!drag) return;

    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();

    const pointerWorld = screenToWorld(
      e.clientX - r.left,
      e.clientY - r.top,
      rect.w,
      rect.h
    );

    const dx = pointerWorld.x - drag.lastPointer.x;
    const dy = pointerWorld.y - drag.lastPointer.y;

    // nichts zu tun
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;

    // move each affected dancer by delta (based on CURRENT positions)
    for (const id of drag.dancerIds) {
      const cur = getDancerPosFromApp(id);
      if (!cur) continue;
      setDancerPosFree(id, { x: cur.x + dx, y: cur.y + dy });
    }

    // re-anchor each move (critical)
    drag.lastPointer = pointerWorld;
  };

const onUp = () => {
  const drag = dragRef.current;
  dragRef.current = null;
  if (!drag) return;

  // snap all affected tokens on release
  for (const id of drag.dancerIds) {
    snapDancerPos(id);
  }
};

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}, [rect.w, rect.h, choreo.isPlaying, dancers, couples]);

  const onPointerDownItem = (e: React.PointerEvent, it: Item) => {
  if (choreo.isPlaying) return;
  e.preventDefault();
  e.stopPropagation();

  const el = containerRef.current;
  if (!el) return;
  const r = el.getBoundingClientRect();

  const pointerWorld = screenToWorld(
    e.clientX - r.left,
    e.clientY - r.top,
    rect.w,
    rect.h
  );

  const dancerIds =
    it.kind === "dancer"
      ? [it.dancerId]
      : it.selectIds; // couple → leader + follower

  dragRef.current = {
    dancerIds: dancerIds.map(String),
    lastPointer: pointerWorld,
  };
};

  // ✅ route ONLY from current MAIN to next MAIN (including MOVE pictures between)
const mainPolylines = useMemo(() => {
  const seq = choreo.getActiveSequence();
  if (!seq || seq.pictures.length < 2) return [];

  // collect main indices
  const mainIdx = seq.pictures
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p?.kind !== "move")
    .map(({ i }) => i);

  if (mainIdx.length < 2) return [];

  // determine "current main" based on currentSec (works both in play + edit via timeline)
  const t = choreo.currentSec ?? 0;

  // find the last MAIN picture whose start <= t
  let currentMain = mainIdx[0];
  for (const mi of mainIdx) {
    const start = choreo.getPictureStartSec(mi);
    if (start <= t + 1e-6) currentMain = mi;
    else break;
  }

  // next main after currentMain
  const curPos = mainIdx.indexOf(currentMain);
  const nextMain = mainIdx[curPos + 1];
  if (nextMain == null) return [];

  // slice includes move pictures between mains
  const slice = seq.pictures.slice(currentMain, nextMain + 1);

  const ids = new Set<string>([
    ...Object.keys(slice[0]?.positions ?? {}),
    ...Object.keys(slice[slice.length - 1]?.positions ?? {}),
  ]);

  const result: { dancerId: string; points: string }[] = [];
  ids.forEach((id) => {
    const pts: Vec2[] = [];
    slice.forEach((pic) => {
      const p = pic.positions?.[id];
      if (p) pts.push(p);
    });
    if (pts.length < 2) return;

    const spts = pts.map((p) => worldToScreen(p, rect.w, rect.h));
    const points = spts.map((p) => `${p.x},${p.y}`).join(" ");
    result.push({ dancerId: id, points });
  });

  return result;
}, [choreo, rect.w, rect.h, choreo.currentSec]);

  const floorA = "#7a5b3d";
  const floorB = "#6b4f35";
  const ticks: number[] = [];
  for (let m = -STAGE_HALF; m <= STAGE_HALF; m += 1) ticks.push(m);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
        background: floorA,
        touchAction: "none",
      }}
    >
      <svg width={rect.w} height={rect.h} style={{ display: "block" }}>
        <defs>
          <linearGradient id="floorGrad2D" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={floorA} />
            <stop offset="100%" stopColor={floorB} />
          </linearGradient>
          <marker id="arrowHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.45)" />
          </marker>
        </defs>

        <rect x={0} y={0} width={rect.w} height={rect.h} fill="url(#floorGrad2D)" />

        {/* Grid */}
        {(() => {
          const size = Math.min(rect.w, rect.h) - PAD * 2;
          const ox = (rect.w - size) / 2;
          const oy = (rect.h - size) / 2;

          const stepPx = size / (STAGE_HALF * 2);
          const halfStepPx = stepPx / 2;

          const lines: React.ReactNode[] = [];

          for (let i = 0; i <= (STAGE_HALF * 2) * 2; i++) {
            const x = ox + i * halfStepPx;
            const y = oy + i * halfStepPx;

            const isMeter = i % 2 === 0;
            const meterVal = i / 2 - STAGE_HALF;
            const emph = isMeter && EMPHASIS_METERS.has(Math.abs(meterVal));

            lines.push(
              <line
                key={`vx_${i}`}
                x1={x}
                y1={oy}
                x2={x}
                y2={oy + size}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={isMeter ? (emph ? 1.8 : 1.0) : 0.6}
                opacity={isMeter ? (emph ? 0.9 : 0.55) : 0.28}
              />
            );
            lines.push(
              <line
                key={`hy_${i}`}
                x1={ox}
                y1={y}
                x2={ox + size}
                y2={y}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={isMeter ? (emph ? 1.8 : 1.0) : 0.6}
                opacity={isMeter ? (emph ? 0.9 : 0.55) : 0.28}
              />
            );
          }

          lines.push(
            <line
              key="axis_x"
              x1={ox}
              y1={oy + size / 2}
              x2={ox + size}
              y2={oy + size / 2}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={1.2}
              opacity={0.8}
            />
          );
          lines.push(
            <line
              key="axis_y"
              x1={ox + size / 2}
              y1={oy}
              x2={ox + size / 2}
              y2={oy + size}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={1.2}
              opacity={0.8}
            />
          );

          lines.push(
            <rect
              key="border"
              x={ox}
              y={oy}
              width={size}
              height={size}
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={1.2}
            />
          );

          ticks.forEach((m) => {
            const px = ox + ((m + STAGE_HALF) / (STAGE_HALF * 2)) * size;
            const py = oy + ((STAGE_HALF - m) / (STAGE_HALF * 2)) * size;
            lines.push(
              <text key={`xt_${m}`} x={px} y={oy - 4} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.75)">
                {m}
              </text>
            );
            lines.push(
              <text key={`yt_${m}`} x={ox - 6} y={py + 3} fontSize={10} textAnchor="end" fill="rgba(255,255,255,0.75)">
                {m}
              </text>
            );
          });

          return <g>{lines}</g>;
        })()}

        {/* ✅ Main routes (includes movement pictures) */}
        <g>
          {mainPolylines.map((pl, i) => (
            <polyline
              key={`pl_${pl.dancerId}_${i}`}
              points={pl.points}
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={2}
              strokeDasharray="6 5"
              markerEnd="url(#arrowHead)"
            />
          ))}
        </g>

        {/* Tokens */}
        <g>
          {items.map((it) => {
            const p = worldToScreen(it.pos, rect.w, rect.h);
            const r = 12;
            const meterText = `${fmtHalf(it.pos.x)}, ${fmtHalf(it.pos.y)}`;

            return (
              <g key={it.key} transform={`translate(${p.x},${p.y})`}>
                <circle
                  r={r}
                  fill={it.color}
                  stroke="rgba(0,0,0,0.45)"
                  strokeWidth={1.2}
                  onPointerDown={(e) => onPointerDownItem(e, it)}
                  style={{ cursor: choreo.isPlaying ? "default" : "grab" }}
                />
                <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="rgba(0,0,0,0.72)" pointerEvents="none">
                  {it.label}
                </text>
                <text y={r + 14} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.9)" pointerEvents="none">
                  {meterText}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          fontSize: 12,
          opacity: 0.85,
          background: "rgba(0,0,0,0.25)",
          padding: "6px 8px",
          borderRadius: 10,
        }}
      >
        Stage: 16×16m • Snap: 0.5m • {choreo.isPlaying ? "Playback (edit disabled)" : "Edit (drag enabled)"} • Main routes shown
      </div>
    </div>
  );
}