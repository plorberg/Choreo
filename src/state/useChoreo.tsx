import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export type Vec2 = { x: number; y: number };

export type Picture = {
  id: string;
  name: string;
  positions: Record<string, Vec2>; // ALWAYS dancer positions
  toNextSec: number;
};

export type Sequence = {
  id: string;
  name: string;
  createdAt: number;
  pictures: Picture[];
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

export type ChoreoExport = {
  schema: "choreo-export-v1";
  exportedAt: number;
  app: "Choreo";
  sequences: Sequence[];
  activeSequenceId: string | null;
  versions?: ChoreoVersion[]; // optional
};

type ChoreoState = {
  sequences: Sequence[];
  activeSequenceId: string | null;

  isPlaying: boolean;
  currentSec: number;
  durationSec: number;

  createSequence: (name?: string) => void;
  setActiveSequence: (id: string) => void;
  renameSequence: (id: string, name: string) => void;
  deleteSequence: (id: string) => void;

  addPicture: (positions: Record<string, Vec2>, name?: string) => void;
  renamePicture: (pictureId: string, name: string) => void;
  deletePicture: (pictureId: string) => void;
  setTransitionDuration: (pictureId: string, seconds: number) => void;

  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;

  getPoseAtSec: (sec: number) => Record<string, Vec2> | null;
  getActiveSequence: () => Sequence | null;

  // Versioning
  versions: ChoreoVersion[];
  saveVersion: (name?: string) => void;
  restoreVersion: (versionId: string) => void;
  deleteVersion: (versionId: string) => void;
  clearVersions: () => void;

  buildExport: (includeVersions: boolean) => ChoreoExport;
  importExport: (data: ChoreoExport) => void;
};

const STORAGE_KEY = "choreo_sequences_v3";
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

export function ChoreoProvider({ children }: { children: React.ReactNode }) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [activeSequenceId, _setActiveSequenceId] = useState<string | null>(null);

  // ✅ immediate, race-proof active id
  const activeIdRef = useRef<string | null>(null);
  const setActiveSequenceId = (id: string | null) => {
    activeIdRef.current = id;
    _setActiveSequenceId(id);
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);

  const [versions, setVersions] = useState<ChoreoVersion[]>([]);

  // RAF clock refs
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const durationRef = useRef(0);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  /* -------------------- persistence -------------------- */

  useEffect(() => {
    const parsed = safeParse<Sequence[]>(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed)) {
      setSequences(parsed);
      const firstId = parsed.length > 0 ? parsed[0].id : null;
      setActiveSequenceId(firstId);
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

  const durationSec = useMemo(() => {
    const seq = getActiveSequence();
    if (!seq || seq.pictures.length < 2) return 0;
    return seq.pictures.slice(0, -1).reduce((a, p) => a + p.toNextSec, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequences, activeSequenceId]);

  useEffect(() => {
    durationRef.current = durationSec;
  }, [durationSec]);

  /* -------------------- RAF playback loop -------------------- */

  const stopRaf = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
  };

  const startRaf = () => {
    stopRaf();

    const tick = (ts: number) => {
      if (!isPlayingRef.current) {
        stopRaf();
        return;
      }

      const last = lastTsRef.current;
      lastTsRef.current = ts;

      if (last == null) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dt = (ts - last) / 1000;
      setCurrentSec((prev) => {
        const d = durationRef.current || 0;
        if (d <= 0) return 0;
        let next = prev + dt;
        if (next >= d) next = next % d;
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (isPlaying) startRaf();
    else stopRaf();
    return () => stopRaf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  /* -------------------- sequence ops -------------------- */

  const createSequence = (name?: string) => {
    const seq: Sequence = {
      id: uid("seq"),
      name: (name ?? "").trim() || `Sequence ${sequences.length + 1}`,
      createdAt: Date.now(),
      pictures: [],
    };

    // ✅ set active immediately (ref + state)
    setActiveSequenceId(seq.id);

    setSequences((prev) => [seq, ...prev]);
    setCurrentSec(0);
    setIsPlaying(false);
  };

  const setActiveSequence = (id: string) => {
    setActiveSequenceId(id);
    setCurrentSec(0);
    setIsPlaying(false);
  };

  const renameSequence = (id: string, name: string) => {
    const n = (name ?? "").trim();
    if (!n) return;
    setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, name: n } : s)));
  };

  const deleteSequence = (id: string) => {
    setSequences((prev) => {
      const out = prev.filter((s) => s.id !== id);
      // if active deleted, switch to new first
      if (activeIdRef.current === id) {
        const nextId = out.length > 0 ? out[0].id : null;
        setActiveSequenceId(nextId);
      }
      return out;
    });
    setCurrentSec(0);
    setIsPlaying(false);
  };

  /* -------------------- picture ops -------------------- */

  const addPicture = (positions: Record<string, Vec2>, name?: string) => {
    const picName = (name ?? "").trim();

    setSequences((prev) => {
      const pic: Picture = {
        id: uid("pic"),
        name: picName || "Picture",
        positions,
        toNextSec: 2,
      };

      // 1) If no sequences exist, create one AND add the picture immediately
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

      // 2) Determine target sequence (race-proof)
      let targetId = activeIdRef.current;

      if (!targetId) {
        targetId = prev[0].id;
        setActiveSequenceId(targetId);
      }

      let idx = prev.findIndex((s) => s.id === targetId);
      if (idx === -1) {
        // fallback to first
        targetId = prev[0].id;
        idx = 0;
        setActiveSequenceId(targetId);
      }

      const seq = prev[idx];
      const nextPicName = picName || `Picture ${seq.pictures.length + 1}`;
      const updated: Sequence = { ...seq, pictures: [...seq.pictures, { ...pic, name: nextPicName }] };

      const out = prev.slice();
      out[idx] = updated;
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
    setCurrentSec(0);
    setIsPlaying(false);
  };

  const setTransitionDuration = (pictureId: string, seconds: number) => {
    const s = clamp(seconds, 0.1, 60);
    setSequences((prev) =>
      prev.map((seq) => ({
        ...seq,
        pictures: seq.pictures.map((p) => (p.id === pictureId ? { ...p, toNextSec: s } : p)),
      }))
    );
  };

  /* -------------------- playback controls -------------------- */

  const play = () => {
    const seq = getActiveSequence();
    if (!seq || seq.pictures.length < 2) return;
    if (durationSec <= 0) return;
    setIsPlaying(true);
  };

  const pause = () => setIsPlaying(false);

  const seek = (sec: number) => {
    const d = durationRef.current || 0;
    setCurrentSec(d <= 0 ? 0 : clamp(sec, 0, d));
  };

  /* -------------------- pose interpolation -------------------- */

  const getPoseAtSec = (sec: number) => {
    const seq = getActiveSequence();
    if (!seq || seq.pictures.length === 0) return null;
    if (seq.pictures.length === 1) return seq.pictures[0].positions;

    const total = durationSec;
    if (total <= 0) return seq.pictures[0].positions;

    let acc = 0;
    const t = clamp(sec, 0, total);

    for (let i = 0; i < seq.pictures.length - 1; i++) {
      const a = seq.pictures[i];
      const b = seq.pictures[i + 1];
      const d = Math.max(0.001, a.toNextSec);

      if (t >= acc && t <= acc + d) {
        const k = clamp((t - acc) / d, 0, 1);
        const out: Record<string, Vec2> = {};
        const ids = new Set([...Object.keys(a.positions), ...Object.keys(b.positions)]);

        ids.forEach((id) => {
          const pa = a.positions[id] ?? b.positions[id];
          const pb = b.positions[id] ?? a.positions[id];
          out[id] = { x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) };
        });

        return out;
      }
      acc += d;
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

    setSequences(structuredClone(v.snapshot.sequences));
    setActiveSequenceId(v.snapshot.activeSequenceId);
    setCurrentSec(0);
    setIsPlaying(false);
  };

  const deleteVersion = (versionId: string) => {
    setVersions((prev) => prev.filter((v) => v.id !== versionId));
  };

  const clearVersions = () => setVersions([]);

const buildExport = (includeVersions: boolean): ChoreoExport => ({
  schema: "choreo-export-v1",
  exportedAt: Date.now(),
  app: "Choreo",
  sequences: structuredClone(sequences),
  activeSequenceId: activeIdRef.current,
  versions: includeVersions ? structuredClone(versions) : undefined,
});

const importExport = (data: ChoreoExport) => {
  if (!data || data.schema !== "choreo-export-v1") {
    alert("Invalid file format (expected choreo-export-v1).");
    return;
  }
  if (!Array.isArray(data.sequences)) {
    alert("Invalid export: sequences missing.");
    return;
  }

  setSequences(structuredClone(data.sequences));
  setActiveSequenceId(data.activeSequenceId ?? (data.sequences[0]?.id ?? null));

  if (Array.isArray(data.versions)) setVersions(structuredClone(data.versions));

  setCurrentSec(0);
  setIsPlaying(false);
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
    renamePicture,
    deletePicture,
    setTransitionDuration,

    play,
    pause,
    seek,

    getPoseAtSec,
    getActiveSequence,

    versions,
    saveVersion,
    restoreVersion,
    deleteVersion,
    clearVersions,

    buildExport,
    importExport
   };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChoreo() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChoreo must be used within ChoreoProvider");
  return ctx;
}