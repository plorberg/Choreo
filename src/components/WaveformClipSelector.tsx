import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTransport } from "../state/useTransport";

/**
 * WaveformClipSelector (MVP)
 * - Renders the transport waveform (already computed in useTransport)
 * - Lets user drag start/end handles to define a clip on the loaded audio
 * - Updates Transport loop markers live (no seeking)
 * - Commits the final clip via onCommit on pointer up
 *
 * Notes:
 * - We intentionally keep this "dumb": it doesn't know about sequences.
 * - It operates in absolute audio seconds (transport timeline).
 */
export default function WaveformClipSelector(props: {
  /** current clip in absolute audio seconds */
  clip: { startSec: number; endSec: number } | null;
  /** called when the user finishes a drag (pointer up) */
  onCommit: (clip: { startSec: number; endSec: number }) => void;
  height?: number;
}) {
  const { clip, onCommit, height = 64 } = props;
  const t = useTransport();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Draft values during drag (absolute seconds)
  const [draft, setDraft] = useState<{ startSec: number; endSec: number } | null>(clip);

  useEffect(() => {
    setDraft(clip);
  }, [clip?.startSec, clip?.endSec]);

  const duration = t.durationSec || 0;
  const waveform = t.waveform;

  const toX = (sec: number, w: number) => (duration > 0 ? (sec / duration) * w : 0);
  const toSec = (x: number, w: number) => (duration > 0 ? (x / w) * duration : 0);

  // draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const w = Math.max(1, Math.floor(wrap.clientWidth));
    const h = Math.max(1, Math.floor(height));
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    // background
    ctx.clearRect(0, 0, w, h);

    if (!waveform || waveform.length === 0) {
      // placeholder line
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    const mid = h / 2;

    // waveform stroke
    ctx.globalAlpha = 0.8;
    ctx.beginPath();

    // waveform array is normalized [0..1], draw vertical bars
    const n = waveform.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const a = Math.max(0, Math.min(1, waveform[i] ?? 0));
      const y = a * (h / 2);
      ctx.moveTo(x, mid - y);
      ctx.lineTo(x, mid + y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [waveform, height, duration]);

  const active = useMemo(() => {
    // use draft while dragging, otherwise use clip
    const c = draft ?? clip;
    if (!c || !(duration > 0)) return null;
    const start = Math.max(0, Math.min(duration, c.startSec));
    const end = Math.max(0, Math.min(duration, c.endSec));
    return { startSec: Math.min(start, end), endSec: Math.max(start, end) };
  }, [draft, clip, duration]);

  const [drag, setDrag] = useState<null | { which: "start" | "end" }>(null);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const beginDrag = (which: "start" | "end") => (e: React.PointerEvent) => {
    if (!(duration > 0)) return;
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    setDrag({ which });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag || !wrapRef.current || !(duration > 0)) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const sec = toSec(x, rect.width);

    const cur = active ?? { startSec: 0, endSec: Math.min(duration, 10) };
    let next = { ...cur };

    if (drag.which === "start") {
      next.startSec = clamp(sec, 0, cur.endSec - 0.01);
    } else {
      next.endSec = clamp(sec, cur.startSec + 0.01, duration);
    }

    setDraft(next);

    // Live-update transport loop markers for immediate feedback (no seeking).
    t.setLoopAAt(next.startSec);
    t.setLoopBAt(next.endSec);
    if (!t.loopEnabled) t.toggleLoop();
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
    setDrag(null);

    const c = (draft ?? active);
    if (c) onCommit({ startSec: c.startSec, endSec: c.endSec });
  };

  // compute UI geometry
  const [wrapW, setWrapW] = useState(1);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => setWrapW(Math.max(1, wrap.clientWidth)));
    ro.observe(wrap);
    setWrapW(Math.max(1, wrap.clientWidth));
    return () => ro.disconnect();
  }, []);

  const startX = active ? toX(active.startSec, wrapW) : 0;
  const endX = active ? toX(active.endSec, wrapW) : 0;

  const selLeft = Math.min(startX, endX);
  const selRight = Math.max(startX, endX);
  const handleW = 10;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      <div
        ref={wrapRef}
        style={{
          position: "relative",
          width: "100%",
          height,
          borderRadius: 6,
          overflow: "hidden",
          userSelect: "none",
          touchAction: "none",
          border: "1px solid rgba(0,0,0,0.15)",
        }}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <canvas ref={canvasRef} />

        {/* selection overlay */}
        {active && (
          <div
            style={{
              position: "absolute",
              left: selLeft,
              top: 0,
              width: Math.max(0, selRight - selLeft),
              height: "100%",
              background: "rgba(0,0,0,0.08)",
              pointerEvents: "none",
            }}
          />
        )}

        {/* playhead */}
        {duration > 0 && (
          <div
            style={{
              position: "absolute",
              left: toX(t.currentSec, wrapW),
              top: 0,
              width: 2,
              height: "100%",
              background: "rgba(0,0,0,0.35)",
              pointerEvents: "none",
            }}
          />
        )}

        {/* start handle */}
        {active && (
          <div
            role="slider"
            aria-label="Clip start"
            onPointerDown={beginDrag("start")}
            style={{
              position: "absolute",
              left: selLeft - handleW / 2,
              top: 0,
              width: handleW,
              height: "100%",
              background: "rgba(0,0,0,0.18)",
              cursor: "ew-resize",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Drag to set clip start"
          >
            <div style={{ width: 2, height: "60%", background: "rgba(0,0,0,0.4)" }} />
          </div>
        )}

        {/* end handle */}
        {active && (
          <div
            role="slider"
            aria-label="Clip end"
            onPointerDown={beginDrag("end")}
            style={{
              position: "absolute",
              left: selRight - handleW / 2,
              top: 0,
              width: handleW,
              height: "100%",
              background: "rgba(0,0,0,0.18)",
              cursor: "ew-resize",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Drag to set clip end"
          >
            <div style={{ width: 2, height: "60%", background: "rgba(0,0,0,0.4)" }} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.85 }}>
        <span>{active ? `${active.startSec.toFixed(2)}s` : "—"}</span>
        <span>{active ? `${active.endSec.toFixed(2)}s` : "—"}</span>
      </div>
    </div>
  );
}
