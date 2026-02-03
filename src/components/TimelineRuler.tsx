import React, { useEffect, useMemo, useRef } from "react";
import { useTransport } from "../state/useTransport";
import { useChoreo } from "../state/useChoreo";

function fmtTime(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function TimelineRuler() {
  const t = useTransport();
  const choreo = useChoreo();

  // This is the *scroll container*
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  const activeSeg = choreo.getActiveSegment();

  const onClick = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();

    // ✅ CRITICAL FIX:
    // Add horizontal scroll offset so clicks map to the correct global timeline position.
    const xInViewport = e.clientX - rect.left;
    const x = xInViewport + el.scrollLeft;

    const beat = Math.max(0, (x - 20) / pxPerBeat);
    const sec = beat * secPerBeat;

    if (e.shiftKey) t.setLoopAAt(sec);
    else if (e.altKey) t.setLoopBAt(sec);
    else t.seek(sec);
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

    const out: JSX.Element[] = [];
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

  const frameMarkers = useMemo(() => {
    if (!activeSeg) return null;

    const startBeatAbs = t.secToBeat(activeSeg.startSec);

    return activeSeg.frames.map((fr) => {
      const frBeatAbs = startBeatAbs + fr.beat;
      const sec = frBeatAbs * secPerBeat;
      const x = 20 + (sec / secPerBeat) * pxPerBeat;

      return (
        <button
          key={fr.id}
          className="frameDot"
          style={{ left: x }}
          title={`Frame @ beat ${fr.beat}`}
          onClick={(e) => {
            e.stopPropagation();
            t.seek(sec);
          }}
        />
      );
    });
  }, [activeSeg, secPerBeat, pxPerBeat, t]);

  return (
    <div className="timelineOuter">
      <div className="timelineHeader">
        <div className="timeReadout">
          {fmtTime(t.currentSec)} / {fmtTime(t.durationSec || 0)}
        </div>
        <div className="timeHelp">
          Click=seek • Shift+Click=Loop A • Alt+Click=Loop B • Dots=Frames
        </div>
        {t.loopEnabled && t.loopA != null && t.loopB != null && t.loopB > t.loopA && (
          <div className="loopReadout">
            Loop: {fmtTime(t.loopA)} → {fmtTime(t.loopB)}
          </div>
        )}
      </div>

      <div className="timelineScroll" ref={scrollRef} onClick={onClick}>
        <div className="timelineInner" style={{ width: totalWidth }}>
          <canvas className="waveCanvas" ref={canvasRef} />

          {ticks}

          {loopAX != null && <div className="loopMarker loopA" style={{ left: loopAX }} />}
          {loopBX != null && <div className="loopMarker loopB" style={{ left: loopBX }} />}

          {frameMarkers}

          <div className="playhead" style={{ left: playheadX }} />
        </div>
      </div>
    </div>
  );
}