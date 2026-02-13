import React, { useEffect, useMemo, useRef } from "react";
import { useTransport } from "../state/useTransport";

function fmtTime(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function TimelineRuler() {
  const t = useTransport();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const dragRef = useRef<null | "A" | "B">(null);

  const pxPerBeat = 18;
  const secPerBeat = 60 / Math.max(1, t.bpm);

  const totalBeats = useMemo(() => {
    if (!t.durationSec || t.durationSec <= 0) return 0;
    return t.durationSec / secPerBeat;
  }, [t.durationSec, secPerBeat]);

  const totalWidth = Math.max(900, Math.ceil(totalBeats * pxPerBeat) + 40);

  const playheadX = 20 + (t.currentSec / secPerBeat) * pxPerBeat;
  const loopAX = t.loopA == null ? null : 20 + (t.loopA / secPerBeat) * pxPerBeat;
  const loopBX = t.loopB == null ? null : 20 + (t.loopB / secPerBeat) * pxPerBeat;

  const xToSec = (xGlobal: number) => {
    const beat = Math.max(0, (xGlobal - 20) / pxPerBeat);
    return beat * secPerBeat;
  };

  const eventToGlobalX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const xInViewport = clientX - rect.left;
    return xInViewport + el.scrollLeft;
  };

  const onClick = (e: React.MouseEvent) => {
    // if dragging marker, ignore click
    if (dragRef.current) return;

    const x = eventToGlobalX(e.clientX);
    const sec = xToSec(x);

    if (e.shiftKey) t.setLoopAAt(sec);
    else if (e.altKey) t.setLoopBAt(sec);
    else t.seek(sec);
  };

  const startDrag = (kind: "A" | "B") => (e: React.PointerEvent) => {
    if (!t.audioName && (!t.durationSec || t.durationSec <= 0)) return;
    dragRef.current = kind;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const x = eventToGlobalX(e.clientX);
    const sec = xToSec(x);
    if (dragRef.current === "A") t.setLoopAAt(sec);
    else t.setLoopBAt(sec);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // Waveform canvas stretched to full timeline width
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const w = totalWidth;
    const h = 78;

    c.width = w;
    c.height = h;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 0.65;

    const wf = t.waveform;
    if (!wf || wf.length === 0) return;

    const leftPad = 20;
    const usableW = Math.max(1, w - leftPad);

    ctx.translate(leftPad, 0);

    for (let x = 0; x < usableW; x++) {
      const idx = Math.floor((x / usableW) * wf.length);
      const v = wf[idx] ?? 0;
      const barH = Math.max(2, v * (h - 4));
      const y = h - barH;

      ctx.fillStyle = "rgba(255,235,210,0.55)";
      ctx.fillRect(x, y, 1, barH);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1.0;
  }, [t.waveform, totalWidth]);

  const ticks = useMemo(() => {
    const beatsPerBar = Number(String(t.timeSig).split("/")[0] || "4") || 4;

    const out: React.ReactElement[] = [];
    const beats = Math.ceil(totalBeats);

    for (let b = 0; b <= beats; b++) {
      const x = 20 + b * pxPerBeat;
      const isBar = b % beatsPerBar === 0;

      out.push(<div key={`t-${b}`} className={isBar ? "tick tickBar" : "tick"} style={{ left: x }} />);

      if (isBar) {
        const barIndex = b / beatsPerBar + 1;
        out.push(
          <div key={`l-${b}`} className="tickLabel" style={{ left: x + 4 }}>
            {barIndex}
          </div>
        );
      }
    }
    return out;
  }, [totalBeats, pxPerBeat, t.timeSig]);

  return (
    <div className="timelineOuter">
      <div className="timelineHeader">
        <div className="timeReadout">
          {fmtTime(t.currentSec)} / {fmtTime(t.durationSec || 0)}
        </div>
        <div className="timeHelp">Click=seek • Shift+Click=Loop A • Alt+Click=Loop B • Drag A/B markers</div>
        {t.loopEnabled && t.loopA != null && t.loopB != null && t.loopB > t.loopA && (
          <div className="loopReadout">
            Loop: {fmtTime(t.loopA)} → {fmtTime(t.loopB)}
          </div>
        )}
      </div>

      <div className="timelineScroll" ref={scrollRef} onClick={onClick} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="timelineInner" style={{ width: totalWidth }}>
          <canvas className="waveCanvas" ref={canvasRef} />

          {ticks}

          {loopAX != null && (
            <div className="loopMarker loopA" style={{ left: loopAX }} onPointerDown={startDrag("A")} title="Loop A (drag)">
              <div className="loopHandle">A</div>
            </div>
          )}
          {loopBX != null && (
            <div className="loopMarker loopB" style={{ left: loopBX }} onPointerDown={startDrag("B")} title="Loop B (drag)">
              <div className="loopHandle">B</div>
            </div>
          )}

          <div className="playhead" style={{ left: playheadX }} />
        </div>
      </div>
    </div>
  );
}
