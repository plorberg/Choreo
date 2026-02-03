import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Vec2 } from "../types";
import { useTransport } from "./useTransport";

export type EntityMode = "couples" | "dancers";

export type Frame = {
  id: string;
  // Beat index relative to segment start beat (integer)
  beat: number;
  // Entity id -> position
  positions: Record<string, Vec2>;
};

export type Segment = {
  id: string;
  name: string;
  createdAt: number;

  mode: EntityMode;

  // Loop bounds in seconds (from transport)
  startSec: number;
  endSec: number;

  // Stored for review consistency (MVP)
  bpm: number;
  timeSig: string;

  // Frames inside the segment, ordered by beat
  frames: Frame[];
};

type Quantize = "1beat" | "2beats" | "1bar";

type ChoreoState = {
  segments: Segment[];
  activeSegmentId: string | null;

  quantize: Quantize;
  setQuantize: (q: Quantize) => void;

  // Segment lifecycle
  createOrUpdateActiveFromLoop: (mode: EntityMode) => void;
  saveActiveSegment: () => void;
  loadSegment: (id: string) => void;
  deleteSegment: (id: string) => void;

  // Frames
  captureFrameAtCurrentTime: (mode: EntityMode, positions: Record<string, Vec2>) => void;
  deleteFrameAtCurrentTime: () => void;

  // Playback pose
  getPoseAtSec: (mode: EntityMode, sec: number) => Record<string, Vec2> | null;

  // For UI
  getActiveSegment: () => Segment | null;
};

const STORAGE_KEY = "choreo_mvp_segments_v1";

const Ctx = createContext<ChoreoState | undefined>(undefined);

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function ChoreoProvider({ children }: { children: React.ReactNode }) {
  const t = useTransport();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  const [quantize, setQuantize] = useState<Quantize>("1beat");

  // Load segments on startup
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Segment[];
      if (Array.isArray(parsed)) {
        setSegments(parsed);
        if (parsed.length > 0) setActiveSegmentId(parsed[0].id);
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist whenever segments change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
  }, [segments]);

  const getActiveSegment = () => {
    if (!activeSegmentId) return null;
    return segments.find((s) => s.id === activeSegmentId) ?? null;
  };

  const createOrUpdateActiveFromLoop = (mode: EntityMode) => {
    const loopA = t.loopA;
    const loopB = t.loopB;

    if (loopA == null || loopB == null || loopB <= loopA) {
      alert("Set Loop A and Loop B first (A < B).");
      return;
    }

    setSegments((prev) => {
      const active = activeSegmentId ? prev.find((s) => s.id === activeSegmentId) : null;

      // If there is an active segment, update its bounds + mode (keep frames)
      if (active) {
        const updated: Segment = {
          ...active,
          mode,
          startSec: loopA,
          endSec: loopB,
          bpm: t.bpm,
          timeSig: t.timeSig
        };
        return prev.map((s) => (s.id === active.id ? updated : s));
      }

      // Create new segment
      const seg: Segment = {
        id: uid("seg"),
        name: `Segment ${prev.length + 1}`,
        createdAt: Date.now(),
        mode,
        startSec: loopA,
        endSec: loopB,
        bpm: t.bpm,
        timeSig: t.timeSig,
        frames: []
      };

      setActiveSegmentId(seg.id);
      return [seg, ...prev];
    });
  };

  const saveActiveSegment = () => {
    const active = getActiveSegment();
    if (!active) {
      alert("No active segment. Click “New Segment from Loop” first.");
      return;
    }
    // Already persisted via effect; this is just a user-facing confirmation.
    alert("Segment saved (local).");
  };

  const loadSegment = (id: string) => {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;

    setActiveSegmentId(id);

    // Set loop bounds to segment for review
    t.setLoopAAt(seg.startSec);
    t.setLoopBAt(seg.endSec);
    // Enable loop for review
    if (!t.loopEnabled) t.toggleLoop();

    // Optionally set bpm/timeSig for consistency
    t.setBpm(seg.bpm);
    t.setTimeSig(seg.timeSig as any);

    // Jump to start
    t.seek(seg.startSec);
  };

  const deleteSegment = (id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
    if (activeSegmentId === id) setActiveSegmentId(null);
  };

  function quantizeBeat(rawBeat: number, beatsPerBar: number) {
    const b = rawBeat;
    if (quantize === "1beat") return Math.round(b);
    if (quantize === "2beats") return Math.round(b / 2) * 2;
    // 1bar
    return Math.round(b / beatsPerBar) * beatsPerBar;
  }

  const captureFrameAtCurrentTime = (mode: EntityMode, positions: Record<string, Vec2>) => {
    const active = getActiveSegment();
    if (!active) {
      alert("No active segment. Click “New Segment from Loop” first.");
      return;
    }

    if (active.mode !== mode) {
      alert(`Active segment is in "${active.mode}" mode. Switch view or create a new segment.`);
      return;
    }

    const startBeatAbs = t.secToBeat(active.startSec);
    const nowBeatAbs = t.secToBeat(t.currentSec);

    // convert to beat relative to segment start
    const relBeatRaw = nowBeatAbs - startBeatAbs;

    // if outside, still allow capture but it will be out-of-range; MVP: constrain to segment
    const segLenBeats = t.secToBeat(active.endSec) - startBeatAbs;
    const relBeatClamped = Math.max(0, Math.min(segLenBeats, relBeatRaw));

    const beatsPerBar = Number(String(active.timeSig).split("/")[0] || "4") || 4;
    const relBeat = quantizeBeat(relBeatClamped, beatsPerBar);

    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== active.id) return s;

        const existing = s.frames.find((f) => f.beat === relBeat);
        const frame: Frame = {
          id: existing?.id ?? uid("fr"),
          beat: relBeat,
          positions
        };

        const nextFrames = existing
          ? s.frames.map((f) => (f.beat === relBeat ? frame : f))
          : [...s.frames, frame];

        nextFrames.sort((a, b) => a.beat - b.beat);

        return { ...s, frames: nextFrames };
      })
    );
  };

  const deleteFrameAtCurrentTime = () => {
    const active = getActiveSegment();
    if (!active) return;

    const startBeatAbs = t.secToBeat(active.startSec);
    const nowBeatAbs = t.secToBeat(t.currentSec);
    const relBeatRaw = nowBeatAbs - startBeatAbs;

    const beatsPerBar = Number(String(active.timeSig).split("/")[0] || "4") || 4;
    const relBeat = quantizeBeat(relBeatRaw, beatsPerBar);

    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== active.id) return s;
        return { ...s, frames: s.frames.filter((f) => f.beat !== relBeat) };
      })
    );
  };

  const getPoseAtSec = (mode: EntityMode, sec: number) => {
    const active = getActiveSegment();
    if (!active) return null;
    if (active.mode !== mode) return null;

    const start = active.startSec;
    const end = active.endSec;

    if (end <= start) return null;

    // Only show animated pose when we're inside the segment loop
    if (sec < start || sec > end) return null;

    const frames = active.frames;
    if (!frames || frames.length === 0) return null;

    // compute beat relative to segment start
    const relBeat = t.secToBeat(sec) - t.secToBeat(start);

    // Find surrounding frames
    let left = frames[0];
    let right = frames[frames.length - 1];

    for (let i = 0; i < frames.length; i++) {
      if (frames[i].beat <= relBeat) left = frames[i];
      if (frames[i].beat >= relBeat) {
        right = frames[i];
        break;
      }
    }

    if (left.beat === right.beat) return left.positions;

    const tInterp = clamp01((relBeat - left.beat) / (right.beat - left.beat));

    const ids = new Set([...Object.keys(left.positions), ...Object.keys(right.positions)]);
    const out: Record<string, Vec2> = {};

    ids.forEach((id) => {
      const a = left.positions[id] ?? right.positions[id];
      const b = right.positions[id] ?? left.positions[id];
      out[id] = {
        x: a.x + (b.x - a.x) * tInterp,
        y: a.y + (b.y - a.y) * tInterp
      };
    });

    return out;
  };

  const value: ChoreoState = useMemo(
    () => ({
      segments,
      activeSegmentId,
      quantize,
      setQuantize,
      createOrUpdateActiveFromLoop,
      saveActiveSegment,
      loadSegment,
      deleteSegment,
      captureFrameAtCurrentTime,
      deleteFrameAtCurrentTime,
      getPoseAtSec,
      getActiveSegment
    }),
    [segments, activeSegmentId, quantize]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChoreo() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChoreo must be used within ChoreoProvider");
  return ctx;
}