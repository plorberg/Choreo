import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../state/useAppState";
import { useChoreo } from "../state/useChoreo";

type Vec2 = { x: number; y: number };

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

export default function Stage2D() {
  const app: any = useAppState();
  const choreo = useChoreo();

  const viewMode: "couples" | "dancers" = app.viewMode ?? "couples";
  const dancers: any[] = app.dancers ?? [];
  const couples: any[] = app.couples ?? [];

  const getCoupleLeaderId = (c: any) => String(c.dancerLeader ?? c.leaderId ?? c.leader ?? c.Leader ?? c.a ?? c.A);
  const getCoupleFollowerId = (c: any) =>
    String(c.dancerFollower ?? c.followerId ?? c.follower ?? c.Follower ?? c.b ?? c.B);

  // ✅ Unified playback pose is ALWAYS dancer pose
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

  function setDancerPos(id: string, pos: Vec2) {
    const p = {
      x: clamp(snap(pos.x, SNAP), -STAGE_HALF, STAGE_HALF),
      y: clamp(snap(pos.y, SNAP), -STAGE_HALF, STAGE_HALF),
    };

    if (typeof app.moveDancer === "function") return app.moveDancer(id, p);
    if (typeof app.setDancers === "function") {
      return app.setDancers((prev: any[]) => prev.map((d) => (String(d.id) === String(id) ? { ...d, position: p } : d)));
    }
    const d = findDancer(id);
    if (d) d.position = p;
  }

  // Couples drag moves both dancers together (leader+follower)
  function moveCoupleByDelta(coupleId: string, dx: number, dy: number) {
    const c = couples.find((x) => String(x.id) === String(coupleId));
    if (!c) return;

    const leaderId = getCoupleLeaderId(c);
    const followerId = getCoupleFollowerId(c);

    // Use APP positions as the editable baseline (not playback pose)
    const lp = getDancerPosFromApp(leaderId);
    const fp = getDancerPosFromApp(followerId);

    if (lp) setDancerPos(leaderId, { x: lp.x + dx, y: lp.y + dy });
    if (fp) setDancerPos(followerId, { x: fp.x + dx, y: fp.y + dy });
  }

  type Item =
    | { key: string; kind: "couple"; coupleId: string; label: string; pos: Vec2; color: string }
    | { key: string; kind: "dancer"; dancerId: string; label: string; pos: Vec2; color: string };

  const items: Item[] = useMemo(() => {
    if (viewMode === "couples") {
      return couples
        .map((c, idx) => {
          const coupleId = String(c.id ?? idx + 1);
          const label = coupleLabelFromId(coupleId, idx);
          const leaderId = getCoupleLeaderId(c);

          const lp = getDancerPos(leaderId);
          if (!lp) return null;

          return {
            key: `c_${coupleId}`,
            kind: "couple" as const,
            coupleId,
            label,
            pos: lp,
            color: "#f2f2f2",
          };
        })
        .filter(Boolean) as Item[];
    }

    // Split view: show leader+follower blue/pink with SAME couple number
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

        // If follower equals leader, show default offset
        if (Math.abs(fp.x - lp.x) < 1e-9 && Math.abs(fp.y - lp.y) < 1e-9) {
          fp = { x: lp.x - 0.5, y: lp.y };
        }

        return [
          { key: `d_${coupleId}_L`, kind: "dancer" as const, dancerId: leaderId, label, pos: lp, color: "#5aa0ff" },
          { key: `d_${coupleId}_F`, kind: "dancer" as const, dancerId: followerId, label, pos: fp, color: "#ff77b7" },
        ];
      })
      .flat()
      .filter(Boolean) as Item[];
  }, [viewMode, couples, dancers, isPlayback, dancerPose]);

  // Dragging
  const dragRef = useRef<null | { item: Item; startWorld: Vec2; startPointer: Vec2 }>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (choreo.isPlaying) return; // disable editing during playback
      const drag = dragRef.current;
      if (!drag) return;

      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;

      const pointerWorld = screenToWorld(px, py, rect.w, rect.h);
      const dx = pointerWorld.x - drag.startPointer.x;
      const dy = pointerWorld.y - drag.startPointer.y;

      if (drag.item.kind === "dancer") {
        const next = { x: drag.startWorld.x + dx, y: drag.startWorld.y + dy };
        setDancerPos(drag.item.dancerId, next);
      } else {
        moveCoupleByDelta(drag.item.coupleId, dx, dy);
      }
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [rect.w, rect.h, choreo.isPlaying]);

  const onPointerDownItem = (e: React.PointerEvent, it: Item) => {
    if (choreo.isPlaying) return;
    e.preventDefault();
    e.stopPropagation();

    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;

    const pointerWorld = screenToWorld(px, py, rect.w, rect.h);

    dragRef.current = {
      item: it,
      startWorld: { ...it.pos },
      startPointer: { ...pointerWorld },
    };
  };

  // Visuals
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

          // axes
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

          // border
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

          // meter labels
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
        Stage: 16×16m • Snap: 0.5m • {choreo.isPlaying ? "Playback (drag disabled)" : "Edit (drag enabled)"}
      </div>
    </div>
  );
}