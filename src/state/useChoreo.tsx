import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTransport } from "./useTransport";

export type Vec2 = { x: number; y: number };

export type PictureKind = "main" | "move";

export type Picture = {
  id: string;
  name: string;
  kind: PictureKind; // main vs move
  positions: Record<string, Vec2>; // ALWAYS dancer positions
  holdSec: number; // stay time on this picture
  moveSec: number; // transition time to next picture

  /** ✅ legacy compat: old UI expects toNextSec */
  toNextSec?: number;
};

export type Sequence = {
  id: string;
  name: string;
  createdAt: number;
  pictures: Picture[];

  /**
   * Optional binding of this sequence to a music snippet within the currently loaded audio.
   * Times are absolute seconds on the transport timeline (audio time).
   *
   * MVP: we only store snippet boundaries; audio file itself is not embedded in exports.
   */
  musicStartSec?: number;
  musicEndSec?: number;
};

export type ChoreoVersion = {
  id: string;
  name: string;
  createdAt: number;
  snapshot: {
    sequences: Sequence[];
    activeSequenceId: string | null;
  };
};

export type ChoreoExportV1 = {
  schema: "choreo-export-v1";
  exportedAt: number;
  app: "Choreo";
  sequences: Omit<Sequence, "musicStartSec" | "musicEndSec">[];
  activeSequenceId: string | null;
  versions?: ChoreoVersion[];
};

export type ChoreoExportV2 = {
  schema: "choreo-export-v2";
  exportedAt: number;
  app: "Choreo";
  sequences: Sequence[];
  activeSequenceId: string | null;
  versions?: ChoreoVersion[];
};

export type ChoreoExport = ChoreoExportV1 | ChoreoExportV2;

type MusicClip = { startSec: number; endSec: number };

type ChoreoState = {
  sequences: Sequence[];
  activeSequenceId: string | null;

  /** Transport-driven playback state (relative to active sequence). */
  isPlaying: boolean;
  currentSec: number;
  durationSec: number;

  createSequence: (name?: string) => void;
  setActiveSequence: (id: string) => void;
  renameSequence: (id: string, name: string) => void;
  deleteSequence: (id: string) => void;

  addPicture: (positions: Record<string, Vec2>, name?: string, kind?: PictureKind) => void;
  addPictureAtTime: (positions: Record<string, Vec2>, atSec: number, name?: string, kind?: PictureKind) => void;
  renamePicture: (pictureId: string, name: string) => void;
  deletePicture: (pictureId: string) => void;

  setHoldDuration: (pictureId: string, seconds: number) => void;
  setMoveDuration: (pictureId: string, seconds: number) => void;
  setPictureKind: (pictureId: string, kind: PictureKind) => void;

  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;

  getPoseAtSec: (sec: number) => Record<string, Vec2> | null;
  getActiveSequence: () => Sequence | null;

  /** Music snippet binding (sequence ↔ transport timeline). */
  getActiveMusicClip: () => MusicClip | null;
  setSequenceMusicClip: (sequenceId: string, startSec: number, endSec: number) => void;
  clearSequenceMusicClip: (sequenceId: string) => void;

  // Versioning
  versions: ChoreoVersion[];
  saveVersion: (name?: string) => void;
  restoreVersion: (versionId: string) => void;
  deleteVersion: (versionId: string) => void;
  clearVersions: () => void;

  // Export/Import
  buildExport: (includeVersions: boolean) => ChoreoExport;
  importExport: (data: any) => void;

  // For "import/restore should load first picture into editor"
  loadToken: number;
  getPictureStartSec: (pictureIndex: number) => number;

  // ✅ legacy compat (old UI)
  setTransitionDuration: (pictureId: string, seconds: number) => void;

  uiSelectedPictureId: string | null;
  setUiSelectedPictureId: (pictureId: string | null) => void;
};

const STORAGE_KEY = "choreo_sequences_v4";
const VERSIONS_KEY = "choreo_versions_v1";
const Ctx = createContext<ChoreoState | null>(null);

const uid = (p = "id") => `${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeSequence(seq: any): Sequence {
  // Backwards compat: if older exports lacked kind/hold/move.
  const pics = (seq.pictures ?? []).map((p: any, i: number) => {
    const kind: PictureKind = p.kind === "move" ? "move" : "main";
    const holdSec = Number.isFinite(p.holdSec) ? Number(p.holdSec) : kind === "main" ? 1.0 : 0;
    const moveSec =
      Number.isFinite(p.moveSec) ? Number(p.moveSec) : Number.isFinite(p.toNextSec) ? Number(p.toNextSec) : 2.0;

    return {
      id: String(p.id ?? uid("pic")),
      name: String(p.name ?? `Picture ${i + 1}`),
      kind,
      positions: p.positions ?? {},
      holdSec,
      moveSec,

      // ✅ legacy compat
      toNextSec: moveSec,
    } satisfies Picture;
  });

  const musicStartSec = Number.isFinite(seq.musicStartSec) ? Number(seq.musicStartSec) : undefined;
  const musicEndSec = Number.isFinite(seq.musicEndSec) ? Number(seq.musicEndSec) : undefined;

  return {
    id: String(seq.id ?? uid("seq")),
    name: String(seq.name ?? "Sequence"),
    createdAt: Number.isFinite(seq.createdAt) ? Number(seq.createdAt) : Date.now(),
    pictures: pics,
    musicStartSec,
    musicEndSec,
  };
}

function normalizeClip(seq: Sequence): MusicClip | null {
  const a = seq.musicStartSec;
  const b = seq.musicEndSec;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (!(b! > a!)) return null;
  return { startSec: a!, endSec: b! };
}

export function ChoreoProvider({ children }: { children: React.ReactNode }) {
  const t = useTransport();

  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [activeSequenceId, _setActiveSequenceId] = useState<string | null>(null);

  const activeIdRef = useRef<string | null>(null);
  const setActiveSequenceId = (id: string | null) => {
    activeIdRef.current = id;
    _setActiveSequenceId(id);
  };

  const [versions, setVersions] = useState<ChoreoVersion[]>([]);
  const [loadToken, setLoadToken] = useState(0);
  const [uiSelectedPictureId, setUiSelectedPictureId] = useState<string | null>(null);

  /* -------------------- persistence -------------------- */

  useEffect(() => {
    const parsed = safeParse<Sequence[]>(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed)) {
      const norm = parsed.map(normalizeSequence);
      setSequences(norm);
      setActiveSequenceId(norm.length > 0 ? norm[0].id : null);
    }

    const v = safeParse<ChoreoVersion[]>(localStorage.getItem(VERSIONS_KEY));
    if (v && Array.isArray(v)) setVersions(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sequences));
  }, [sequences]);

  useEffect(() => {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
  }, [versions]);

  /* -------------------- helpers -------------------- */

  const getActiveSequence = () =>
    activeSequenceId ? sequences.find((s) => s.id === activeSequenceId) ?? null : null;

  const getActiveMusicClip = (): MusicClip | null => {
    const seq = getActiveSequence();
    if (!seq) return null;
    return normalizeClip(seq);
  };

  // Choreo timeline duration in seconds (pictures) — used when no music clip is bound.
  const picturesDurationSec = useMemo(() => {
    const seq = getActiveSequence();
    if (!seq || seq.pictures.length < 2) return 0;

    let total = 0;
    for (let i = 0; i < seq.pictures.length - 1; i++) {
      const p = seq.pictures[i];
      total += Math.max(0, p.holdSec || 0) + Math.max(0.001, p.moveSec || 2);
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequences, activeSequenceId]);

  const durationSec = useMemo(() => {
    const clip = getActiveMusicClip();
    return clip ? Math.max(0, clip.endSec - clip.startSec) : picturesDurationSec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picturesDurationSec, sequences, activeSequenceId]);

  const currentSec = useMemo(() => {
    const clip = getActiveMusicClip();
    if (!clip) return clamp(t.currentSec, 0, durationSec || 0);
    return clamp(t.currentSec - clip.startSec, 0, durationSec || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.currentSec, sequences, activeSequenceId, durationSec]);

  const isPlaying = t.isPlaying;

  const getPictureStartSec = (pictureIndex: number) => {
    const seq = getActiveSequence();
    if (!seq || pictureIndex <= 0) return 0;
    const idx = Math.min(pictureIndex, seq.pictures.length - 1);

    let acc = 0;
    for (let i = 0; i < idx; i++) {
      const p = seq.pictures[i];
      acc += Math.max(0, p.holdSec || 0) + Math.max(0.001, p.moveSec || 2);
    }
    return acc;
  };

  /**
   * Apply (or clear) the active sequence music clip to transport.
   * This makes sequence switching instantly “snap” the transport to the correct snippet.
   */
  useEffect(() => {
    const seq = getActiveSequence();
    if (!seq) {
      t.clearClip();
      return;
    }

    const clip = normalizeClip(seq);
    if (!clip) {
      t.clearClip();
      return;
    }

    // Only apply if audio is loaded (durationSec > 0).
    if (!(t.durationSec > 0)) return;

    t.setClip(clip.startSec, clip.endSec, { seekToStart: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSequenceId, sequences, t.durationSec]);

  /* -------------------- sequence ops -------------------- */

  const createSequence = (name?: string) => {
    const seq: Sequence = {
      id: uid("seq"),
      name: (name ?? "").trim() || `Sequence ${sequences.length + 1}`,
      createdAt: Date.now(),
      pictures: [],
    };
    setActiveSequenceId(seq.id);
    setSequences((prev) => [seq, ...prev]);
    t.pause();
    t.seek(0);
  };

  const setActiveSequence = (id: string) => {
    setActiveSequenceId(id);

    // snap to clip start if present, otherwise to 0
    const seq = sequences.find((s) => s.id === id);
    const clip = seq ? normalizeClip(seq) : null;
    t.pause();
    t.seek(clip ? clip.startSec : 0);
  };

  const setTransitionDuration = (pictureId: string, seconds: number) => {
    setMoveDuration(pictureId, seconds);
  };

  const renameSequence = (id: string, name: string) => {
    const n = (name ?? "").trim();
    if (!n) return;
    setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, name: n } : s)));
  };

  const deleteSequence = (id: string) => {
    setSequences((prev) => {
      const out = prev.filter((s) => s.id !== id);
      if (activeIdRef.current === id) setActiveSequenceId(out.length ? out[0].id : null);
      return out;
    });
    t.pause();
    t.seek(0);
  };

  const setSequenceMusicClip = (sequenceId: string, startSec: number, endSec: number) => {
    const a = Number(startSec);
    const b = Number(endSec);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;

    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    setSequences((prev) =>
      prev.map((s) => (s.id === sequenceId ? { ...s, musicStartSec: lo, musicEndSec: hi } : s))
    );

    if (activeIdRef.current === sequenceId && t.durationSec > 0) {
      t.setClip(lo, hi);
    }
  };

  const clearSequenceMusicClip = (sequenceId: string) => {
    setSequences((prev) =>
      prev.map((s) => (s.id === sequenceId ? { ...s, musicStartSec: undefined, musicEndSec: undefined } : s))
    );

    if (activeIdRef.current === sequenceId) {
      t.clearClip();
    }
  };

  /* -------------------- picture ops -------------------- */

  const addPicture = (positions: Record<string, Vec2>, name?: string, kind?: PictureKind) => {
    const picName = (name ?? "").trim();
    const k: PictureKind = kind === "move" ? "move" : "main";

    setSequences((prev) => {
      const pic: Picture = {
        id: uid("pic"),
        name: picName || "Picture",
        kind: k,
        positions,
        holdSec: k === "main" ? 1.0 : 0,
        moveSec: 2.0,

        // ✅ legacy compat
        toNextSec: 2.0,
      };

      if (prev.length === 0) {
        const seq: Sequence = {
          id: uid("seq"),
          name: "Sequence 1",
          createdAt: Date.now(),
          pictures: [{ ...pic, name: picName || "Picture 1" }],
        };
        setActiveSequenceId(seq.id);
        return [seq];
      }

      let targetId = activeIdRef.current ?? prev[0].id;
      if (!targetId) return prev;

      let idx = prev.findIndex((s) => s.id === targetId);
      if (idx === -1) idx = 0;

      const seq = prev[idx];
      const nextPicName = picName || `Picture ${seq.pictures.length + 1}`;

      const updated: Sequence = { ...seq, pictures: [...seq.pictures, { ...pic, name: nextPicName }] };

      const out = prev.slice();
      out[idx] = updated;
      return out;
    });
  };

  
  /**
   * Add a picture at a specific time (seconds) in the active sequence timeline.
   * MVP behavior:
   * - Finds the picture segment containing atSec and inserts after it.
   * - Adjusts the previous picture's hold/move so that the new picture starts at atSec (best-effort).
   * - Does NOT attempt to preserve total duration perfectly; user can tweak durations after.
   */
  const addPictureAtTime = (positions: Record<string, Vec2>, atSec: number, name?: string, kind?: PictureKind) => {
    const picName = (name ?? "").trim();
    const k: PictureKind = kind === "move" ? "move" : "main";
    const targetSec = Math.max(0, Number.isFinite(atSec) ? atSec : 0);

    setSequences((prev) => {
      const ensureSeq = () => {
        if (prev.length > 0) return prev;
        const seq: Sequence = { id: uid("seq"), name: "Sequence 1", createdAt: Date.now(), pictures: [] };
        return [seq];
      };

      const base = ensureSeq();
      const out = base.map((s) => ({ ...s, pictures: [...s.pictures] }));

      const activeId = activeSequenceId ?? out[0]?.id ?? null;
      const sIdx = out.findIndex((s) => s.id === activeId);
      if (sIdx < 0) return out;

      const seq = out[sIdx];

      const pic: Picture = {
        id: uid("pic"),
        name: picName || "Picture",
        kind: k,
        positions,
        holdSec: k === "main" ? 1.0 : 0,
        moveSec: 2.0,
        toNextSec: 2.0,
      };

      if (seq.pictures.length === 0) {
        seq.pictures.push(pic);
        return out;
      }

      // Find insertion index based on cumulative time
      let acc = 0;
      let insertAfter = seq.pictures.length - 1;

      for (let i = 0; i < seq.pictures.length; i++) {
        const p = seq.pictures[i];
        const seg = Math.max(0, p.holdSec || 0) + Math.max(0.001, p.moveSec || 2);
        const nextAcc = acc + seg;
        if (targetSec < nextAcc) {
          insertAfter = i;
          break;
        }
        acc = nextAcc;
      }

      // Best-effort: adjust previous picture so that new picture starts at targetSec
      const prevPic = seq.pictures[insertAfter];
      const prevStart = acc; // start of prevPic segment
      const desiredDelta = Math.max(0, targetSec - prevStart);

      // We want (hold + move) ~= desiredDelta to place the next picture at targetSec
      const minMove = 0.2;
      const oldHold = Math.max(0, prevPic.holdSec || 0);
      const oldMove = Math.max(minMove, prevPic.moveSec || 2);
      const oldTotal = oldHold + oldMove;

      if (desiredDelta > 0 && desiredDelta < oldTotal) {
        const newHold = Math.min(oldHold, Math.max(0, desiredDelta - minMove));
        const newMove = Math.max(minMove, desiredDelta - newHold);

        prevPic.holdSec = newHold;
        prevPic.moveSec = newMove;
        prevPic.toNextSec = newMove; // legacy compat
      }

      // Insert new picture after prev
      seq.pictures.splice(insertAfter + 1, 0, pic);
      return out;
    });
  };


const renamePicture = (pictureId: string, name: string) => {
    const n = (name ?? "").trim();
    if (!n) return;
    setSequences((prev) =>
      prev.map((s) => ({
        ...s,
        pictures: s.pictures.map((p) => (p.id === pictureId ? { ...p, name: n } : p)),
      }))
    );
  };

  const deletePicture = (pictureId: string) => {
    setSequences((prev) => prev.map((s) => ({ ...s, pictures: s.pictures.filter((p) => p.id !== pictureId) })));
    t.pause();
    const clip = getActiveMusicClip();
    t.seek(clip ? clip.startSec : 0);
  };

  const setHoldDuration = (pictureId: string, seconds: number) => {
    const s = clamp(seconds, 0, 60);
    setSequences((prev) =>
      prev.map((seq) => ({
        ...seq,
        pictures: seq.pictures.map((p) => (p.id === pictureId ? { ...p, holdSec: s } : p)),
      }))
    );
  };

  const setMoveDuration = (pictureId: string, seconds: number) => {
    const s = clamp(seconds, 0.1, 60);
    setSequences((prev) =>
      prev.map((seq) => ({
        ...seq,
        pictures: seq.pictures.map((p) => (p.id === pictureId ? { ...p, moveSec: s, toNextSec: s } : p)),
      }))
    );
  };

  const setPictureKind = (pictureId: string, kind: PictureKind) => {
    setSequences((prev) =>
      prev.map((seq) => ({
        ...seq,
        pictures: seq.pictures.map((p) => (p.id === pictureId ? { ...p, kind } : p)),
      }))
    );
  };

  /* -------------------- playback controls (transport-driven) -------------------- */

  const play = () => {
    const seq = getActiveSequence();
    if (!seq || seq.pictures.length < 2) return;
    if (durationSec <= 0) return;
    // If clip exists but no audio loaded, we still allow “silent” play? MVP: require audio for clip playback.
    if (getActiveMusicClip() && !(t.durationSec > 0)) return;

    void t.play();
  };

  const pause = () => t.pause();

  const seek = (sec: number) => {
    const clip = getActiveMusicClip();
    const d = durationSec || 0;
    const rel = d <= 0 ? 0 : clamp(sec, 0, d);
    const abs = clip ? clip.startSec + rel : rel;
    t.seek(abs);
  };

  /* -------------------- pose evaluation (HOLD + MOVE) -------------------- */

  const getPoseAtSec = (sec: number) => {
    const seq = getActiveSequence();
    if (!seq || seq.pictures.length === 0) return null;
    if (seq.pictures.length === 1) return seq.pictures[0].positions;

    const total = picturesDurationSec;
    if (total <= 0) return seq.pictures[0].positions;

    const tt = clamp(sec, 0, total);
    let acc = 0;

    for (let i = 0; i < seq.pictures.length - 1; i++) {
      const a = seq.pictures[i];
      const b = seq.pictures[i + 1];

      const hold = Math.max(0, a.holdSec || 0);
      const move = Math.max(0.001, a.moveSec || 2);

      // HOLD window
      if (tt >= acc && tt <= acc + hold) {
        return a.positions;
      }
      acc += hold;

      // MOVE window
      if (tt >= acc && tt <= acc + move) {
        const k = clamp((tt - acc) / move, 0, 1);
        const out: Record<string, Vec2> = {};
        const ids = new Set([...Object.keys(a.positions), ...Object.keys(b.positions)]);

        ids.forEach((id) => {
          const pa = a.positions[id] ?? b.positions[id];
          const pb = b.positions[id] ?? a.positions[id];
          out[id] = { x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) };
        });

        return out;
      }

      acc += move;
    }

    return seq.pictures[seq.pictures.length - 1].positions;
  };

  /* -------------------- versioning -------------------- */

  const saveVersion = (name?: string) => {
    const label = (name ?? "").trim();
    const v: ChoreoVersion = {
      id: uid("ver"),
      name: label || `Version ${versions.length + 1}`,
      createdAt: Date.now(),
      snapshot: {
        sequences: structuredClone(sequences),
        activeSequenceId: activeIdRef.current,
      },
    };
    setVersions((prev) => [v, ...prev].slice(0, 50));
  };

  const restoreVersion = (versionId: string) => {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;

    const norm = structuredClone(v.snapshot.sequences).map(normalizeSequence);
    setSequences(norm);
    setActiveSequenceId(v.snapshot.activeSequenceId ?? (norm[0]?.id ?? null));

    t.pause();
    const nextSeq = v.snapshot.activeSequenceId ? norm.find(s=>s.id===v.snapshot.activeSequenceId) : norm[0];
    const clip = nextSeq ? normalizeClip(nextSeq) : null;
    t.seek(clip ? clip.startSec : 0);

    setLoadToken((x) => x + 1); // ✅ trigger "load first picture into editor"
  };

  const deleteVersion = (versionId: string) => setVersions((prev) => prev.filter((v) => v.id !== versionId));
  const clearVersions = () => setVersions([]);

  /* -------------------- export / import -------------------- */

  const buildExport = (includeVersions: boolean): ChoreoExport => ({
    schema: "choreo-export-v2",
    exportedAt: Date.now(),
    app: "Choreo",
    sequences: structuredClone(sequences),
    activeSequenceId: activeIdRef.current,
    versions: includeVersions ? structuredClone(versions) : undefined,
  });

  const importExport = (data: any) => {
    if (!data || (data.schema !== "choreo-export-v1" && data.schema !== "choreo-export-v2")) {
      alert('Invalid file format (expected "choreo-export-v1" or "choreo-export-v2").');
      return;
    }
    if (!Array.isArray(data.sequences)) {
      alert("Invalid export: sequences missing.");
      return;
    }

    // v1 → v2 normalize (clip fields absent)
    const seqs = (data.sequences as any[]).map(normalizeSequence);
    setSequences(structuredClone(seqs));

    const nextActive =
      typeof data.activeSequenceId === "string"
        ? (data.activeSequenceId as string)
        : seqs.length > 0
          ? seqs[0].id
          : null;

    setActiveSequenceId(nextActive);

    if (Array.isArray(data.versions)) setVersions(structuredClone(data.versions as ChoreoVersion[]));

    t.pause();
    const activeSeq = nextActive ? seqs.find((s) => s.id === nextActive) : null;
    const clip = activeSeq ? normalizeClip(activeSeq) : null;
    t.seek(clip ? clip.startSec : 0);

    setLoadToken((x) => x + 1); // ✅ trigger "load first picture into editor"
  };

  const value: ChoreoState = {
    sequences,
    activeSequenceId,

    isPlaying,
    currentSec,
    durationSec,

    createSequence,
    setActiveSequence,
    renameSequence,
    deleteSequence,

    addPicture,
    addPictureAtTime,
    renamePicture,
    deletePicture,

    setHoldDuration,
    setMoveDuration,
    setTransitionDuration, // ✅ legacy compat
    setPictureKind,

    play,
    pause,
    seek,

    getPoseAtSec,
    getActiveSequence,

    getActiveMusicClip,
    setSequenceMusicClip,
    clearSequenceMusicClip,

    versions,
    saveVersion,
    restoreVersion,
    deleteVersion,
    clearVersions,

    buildExport,
    importExport,

    loadToken,
    getPictureStartSec,

    uiSelectedPictureId,
    setUiSelectedPictureId,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}


export function useChoreo() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChoreo must be used within ChoreoProvider");
  return ctx;
}