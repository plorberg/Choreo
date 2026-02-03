import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export type TimeSig = "4/4" | "3/4" | "6/8";

export type TransportState = {
  bpm: number;
  timeSig: TimeSig;

  audioName: string | null;
  durationSec: number;

  isPlaying: boolean;
  currentSec: number;

  loopEnabled: boolean;
  loopA: number | null;
  loopB: number | null;

  waveform: Float32Array | null; // normalized peaks (0..1), time-mapped to duration

  setBpm: (bpm: number) => void;
  setTimeSig: (ts: TimeSig) => void;

  loadAudioFile: (file: File) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (sec: number) => void;

  setLoopAAt: (sec: number) => void;
  setLoopBAt: (sec: number) => void;
  setLoopAHere: () => void;
  setLoopBHere: () => void;

  clearLoop: () => void;
  toggleLoop: () => void;

  secToBeat: (sec: number) => number;
  beatToSec: (beat: number) => number;
};

const Ctx = createContext<TransportState | undefined>(undefined);

export function TransportProvider({ children }: { children: React.ReactNode }) {
  const [bpm, setBpmState] = useState(120);
  const [timeSig, setTimeSig] = useState<TimeSig>("4/4");

  const [audioName, setAudioName] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);

  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  const [waveform, setWaveform] = useState<Float32Array | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const secPerBeat = useMemo(() => 60 / Math.max(1, bpm), [bpm]);
  const secToBeat = (sec: number) => sec / secPerBeat;
  const beatToSec = (beat: number) => beat * secPerBeat;

  const getDur = () => {
    const a = audioRef.current;
    const stateDur = durationSec;
    if (stateDur > 0) return stateDur;
    if (a && Number.isFinite(a.duration) && a.duration > 0) return a.duration;
    return 0;
  };

  const stopRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const startRaf = () => {
    stopRaf();
    const tick = () => {
      const a = audioRef.current;
      if (!a) return;

      const t = a.currentTime;
      setCurrentSec(t);

      if (loopEnabled && loopA != null && loopB != null && loopB > loopA) {
        // Hard clamp loop while playing
        if (t >= loopB) {
          a.currentTime = loopA;
          setCurrentSec(loopA);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setIsPlaying(false);
    stopRaf();
  };

  const play = async () => {
    const a = audioRef.current;
    if (!a) return;

    if (loopEnabled && loopA != null && loopB != null && loopB > loopA) {
      // audition loop: always start inside loop
      if (a.currentTime < loopA || a.currentTime > loopB) {
        a.currentTime = loopA;
        setCurrentSec(loopA);
      }
    }

    await a.play();
    setIsPlaying(true);
    startRaf();
  };

  const seek = (sec: number) => {
    const a = audioRef.current;
    if (!a) return;

    const dur = getDur();
    const clamped = Math.max(0, Math.min(dur || 0, sec));

    a.currentTime = clamped;
    setCurrentSec(clamped);
  };

  const setBpm = (v: number) => setBpmState(Math.max(30, Math.min(240, Math.round(v))));

  const clearLoop = () => {
    setLoopEnabled(false);
    setLoopA(null);
    setLoopB(null);
  };

  const toggleLoop = () => setLoopEnabled((v) => !v);

  const setLoopAAt = (sec: number) => {
    const dur = getDur();
    const s = Math.max(0, Math.min(dur || 0, sec));
    setLoopA(s);

    // if B exists and is < A, keep ordering by pushing B up to A
    setLoopB((b) => (b != null && b < s ? s : b));
  };

  const setLoopBAt = (sec: number) => {
    const dur = getDur();
    const s = Math.max(0, Math.min(dur || 0, sec));
    setLoopB(s);

    // if A exists and is > B, pull A down to B
    setLoopA((a) => (a != null && a > s ? s : a));

    // Auto-enable loop once B is set (common workflow)
    setLoopEnabled(true);
  };

  const setLoopAHere = () => setLoopAAt(currentSec);
  const setLoopBHere = () => setLoopBAt(currentSec);

  async function computeWaveformPeaks(file: File) {
    // Build a time-mapped envelope: N samples across full duration
    try {
      const arr = await file.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buf = await ctx.decodeAudioData(arr.slice(0));

      const channel = buf.getChannelData(0);
      const dur = buf.duration || 0;
      if (dur > 0) setDurationSec(dur);

      // resolution: ~120 peaks per minute (good balance)
      const peaksCount = Math.max(600, Math.min(6000, Math.floor(dur * 12)));
      const block = Math.max(1, Math.floor(channel.length / peaksCount));

      const peaks = new Float32Array(peaksCount);
      for (let i = 0; i < peaksCount; i++) {
        let max = 0;
        const start = i * block;
        const end = Math.min(channel.length, start + block);
        for (let j = start; j < end; j++) {
          const v = Math.abs(channel[j]);
          if (v > max) max = v;
        }
        peaks[i] = max;
      }

      // normalize 0..1
      let m = 0.00001;
      for (let i = 0; i < peaks.length; i++) m = Math.max(m, peaks[i]);
      for (let i = 0; i < peaks.length; i++) peaks[i] = peaks[i] / m;

      setWaveform(peaks);
      ctx.close();
    } catch {
      setWaveform(null);
    }
  }

  const loadAudioFile = async (file: File) => {
    const prev = audioRef.current?.src;
    if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);

    const url = URL.createObjectURL(file);
    setAudioName(file.name);

    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;

    pause();
    clearLoop();
    setCurrentSec(0);
    setDurationSec(0);

    a.src = url;
    a.preload = "auto";

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        if (a.duration && a.duration > 0) setDurationSec(a.duration);
        resolve();
      };
      const onErr = () => reject(new Error("Audio load failed"));
      a.addEventListener("loadedmetadata", onLoaded, { once: true });
      a.addEventListener("error", onErr, { once: true });
    });

    // duration sometimes stabilizes later
    a.addEventListener(
      "durationchange",
      () => {
        if (a.duration && a.duration > 0) setDurationSec(a.duration);
      },
      { once: true }
    );

    computeWaveformPeaks(file);
  };

  useEffect(() => {
    return () => {
      pause();
      const src = audioRef.current?.src;
      if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: TransportState = {
    bpm,
    timeSig,
    audioName,
    durationSec,
    isPlaying,
    currentSec,
    loopEnabled,
    loopA,
    loopB,
    waveform,
    setBpm,
    setTimeSig,
    loadAudioFile,
    play,
    pause,
    seek,
    setLoopAAt,
    setLoopBAt,
    setLoopAHere,
    setLoopBHere,
    clearLoop,
    toggleLoop,
    secToBeat,
    beatToSec
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTransport() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTransport must be used within TransportProvider");
  return ctx;
}