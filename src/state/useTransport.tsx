import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { TransportCtx, TransportState, TimeSig } from "./transportContext";

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

  // WebAudio engine
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // playback bookkeeping in refs (source of truth)
  const isPlayingRef = useRef(false);
  const startedAtCtxTimeRef = useRef(0);
  const offsetSecRef = useRef(0);

  // guard to prevent old source.onended from killing new playback
  const sourceInstanceIdRef = useRef(0);

  // loop refs
  const loopEnabledRef = useRef(loopEnabled);
  const loopARef = useRef(loopA);
  const loopBRef = useRef(loopB);

  useEffect(() => { loopEnabledRef.current = loopEnabled; }, [loopEnabled]);
  useEffect(() => { loopARef.current = loopA; }, [loopA]);
  useEffect(() => { loopBRef.current = loopB; }, [loopB]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const rafRef = useRef<number | null>(null);

  const secPerBeat = useMemo(() => 60 / Math.max(1, bpm), [bpm]);
  const secToBeat = (sec: number) => sec / secPerBeat;
  const beatToSec = (beat: number) => beat * secPerBeat;

  const ensureCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const stopRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const startRaf = () => {
    stopRaf();
    const tick = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      if (!isPlayingRef.current) {
        stopRaf();
        return;
      }

      const now = ctx.currentTime;
      let pos = (now - startedAtCtxTimeRef.current) + offsetSecRef.current;

      const dur = bufferRef.current?.duration ?? durationSec ?? 0;
      pos = Math.max(0, Math.min(dur, pos));

      // ✅ keep playhead inside loop while looping
      const le = loopEnabledRef.current;
      const la = loopARef.current;
      const lb = loopBRef.current;
      if (le && la != null && lb != null && lb > la) {
        const loopLen = lb - la;
        if (loopLen > 0) {
          if (pos >= lb) pos = la + ((pos - la) % loopLen);
          if (pos < la) pos = la + ((pos - la) % loopLen + loopLen) % loopLen;
        }
      }

      setCurrentSec(pos);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopSource = () => {
    const s = sourceRef.current;
    if (!s) return;
    try { s.onended = null; } catch {}
    try { s.stop(); } catch {}
    try { s.disconnect(); } catch {}
    sourceRef.current = null;
  };

  const computeCurrentPos = () => {
    const ctx = audioCtxRef.current;
    const buf = bufferRef.current;
    if (!ctx || !buf) return offsetSecRef.current;
    if (!isPlayingRef.current) return offsetSecRef.current;
    const now = ctx.currentTime;
    const pos = (now - startedAtCtxTimeRef.current) + offsetSecRef.current;
    return Math.max(0, Math.min(buf.duration, pos));
  };

  const buildSource = (instanceId: number) => {
    const ctx = ensureCtx();
    const buf = bufferRef.current;
    if (!buf) return null;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const le = loopEnabledRef.current;
    const la = loopARef.current;
    const lb = loopBRef.current;

    if (le && la != null && lb != null && lb > la) {
      src.loop = true;
      src.loopStart = Math.max(0, Math.min(buf.duration, la));
      src.loopEnd = Math.max(0, Math.min(buf.duration, lb));
    } else {
      src.loop = false;
    }

    src.onended = () => {
      if (sourceInstanceIdRef.current !== instanceId) return;
      isPlayingRef.current = false;
      setIsPlaying(false);
      stopRaf();
    };

    return src;
  };

  const startAt = async (sec: number) => {
    const ctx = ensureCtx();
    const buf = bufferRef.current;
    if (!buf) return;

    await ctx.resume();

    let startPos = Math.max(0, Math.min(buf.duration, sec));
    const le = loopEnabledRef.current;
    const la = loopARef.current;
    const lb = loopBRef.current;
    if (le && la != null && lb != null && lb > la) {
      if (startPos < la || startPos > lb) startPos = la;
    }

    const instanceId = ++sourceInstanceIdRef.current;

    stopSource();
    const src = buildSource(instanceId);
    if (!src) return;

    sourceRef.current = src;

    offsetSecRef.current = startPos;
    startedAtCtxTimeRef.current = ctx.currentTime;

    isPlayingRef.current = true;
    setIsPlaying(true);

    src.start(0, startPos);
    startRaf();
  };

  const play = async () => {
    if (!bufferRef.current) return;
    await startAt(computeCurrentPos());
  };

  const pause = () => {
    if (!bufferRef.current) return;

    const pos = computeCurrentPos();
    offsetSecRef.current = pos;

    isPlayingRef.current = false;
    setIsPlaying(false);

    stopSource();
    stopRaf();
    setCurrentSec(pos);
  };

  const seek = (sec: number) => {
    const buf = bufferRef.current;
    if (!buf) return;

    const clamped = Math.max(0, Math.min(buf.duration, sec));

    // if seeking outside loop, disable loop
    const le = loopEnabledRef.current;
    const la = loopARef.current;
    const lb = loopBRef.current;
    if (le && la != null && lb != null && lb > la) {
      if (clamped < la || clamped > lb) {
        setLoopEnabled(false);
        loopEnabledRef.current = false;
      }
    }

    if (isPlayingRef.current) startAt(clamped);
    else {
      offsetSecRef.current = clamped;
      setCurrentSec(clamped);
    }
  };

  const setBpm = (v: number) => setBpmState(Math.max(30, Math.min(240, Math.round(v))));

  const clearLoop = () => {
    setLoopEnabled(false);
    loopEnabledRef.current = false;
    setLoopA(null);
    loopARef.current = null;
    setLoopB(null);
    loopBRef.current = null;

    if (isPlayingRef.current) startAt(computeCurrentPos());
  };

  const toggleLoop = () => {
    setLoopEnabled((v) => {
      const next = !v;
      loopEnabledRef.current = next;
      return next;
    });

    if (isPlayingRef.current) startAt(computeCurrentPos());
  };

  const setLoopAAt = (sec: number) => {
    const dur = bufferRef.current?.duration ?? durationSec ?? 0;
    const s = Math.max(0, Math.min(dur, sec));
    setLoopA(s);
    loopARef.current = s;
    setLoopB((b) => (b != null && b < s ? s : b));
  };

  const setLoopBAt = (sec: number) => {
    const dur = bufferRef.current?.duration ?? durationSec ?? 0;
    const s = Math.max(0, Math.min(dur, sec));
    setLoopB(s);
    loopBRef.current = s;

    setLoopEnabled(true);
    loopEnabledRef.current = true;

    if (isPlayingRef.current) startAt(computeCurrentPos());
  };

  const setLoopAHere = () => setLoopAAt(currentSec);
  const setLoopBHere = () => setLoopBAt(currentSec);

  
const setClip = (startSec: number, endSec: number, opts?: { seekToStart?: boolean }) => {
  const buf = bufferRef.current;
  if (!buf) return;

  const dur = buf.duration ?? durationSec ?? 0;
  const a = Math.max(0, Math.min(dur, startSec));
  const b = Math.max(0, Math.min(dur, endSec));
  const start = Math.min(a, b);
  const end = Math.max(a, b);

  setLoopA(start);
  loopARef.current = start;
  setLoopB(end);
  loopBRef.current = end;
  setLoopEnabled(true);
  loopEnabledRef.current = true;

  // default: jump playhead to clip start (useful when setting a new clip)
  const seekToStart = opts?.seekToStart ?? true;
  if (seekToStart) seek(start);
};;

  const clearClip = () => {
    clearLoop();
  };

  async function computeWaveformPeaks(buf: AudioBuffer) {
    const channel = buf.getChannelData(0);
    const dur = buf.duration || 0;

    const peaksCount = Math.max(600, Math.min(6000, Math.floor(dur * 12) || 600));
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

    let m = 0.00001;
    for (let i = 0; i < peaks.length; i++) m = Math.max(m, peaks[i]);
    for (let i = 0; i < peaks.length; i++) peaks[i] = peaks[i] / m;

    setWaveform(peaks);
  }

  const loadAudioFile = async (file: File) => {
    setAudioName(file.name);

    stopRaf();
    stopSource();

    isPlayingRef.current = false;
    setIsPlaying(false);
    sourceInstanceIdRef.current++; // invalidate old onended

    setLoopEnabled(false);
    loopEnabledRef.current = false;
    setLoopA(null);
    loopARef.current = null;
    setLoopB(null);
    loopBRef.current = null;

    setCurrentSec(0);
    offsetSecRef.current = 0;

    const ctx = ensureCtx();
    await ctx.resume();

    const arr = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr.slice(0));

    bufferRef.current = buf;
    setDurationSec(buf.duration);

    await computeWaveformPeaks(buf);
  };

  useEffect(() => {
    return () => {
      stopRaf();
      stopSource();
      try { audioCtxRef.current?.close(); } catch {}
    };
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
    setClip,
    clearClip,
    clearLoop,
    toggleLoop,
    secToBeat,
    beatToSec,
  };

  return <TransportCtx.Provider value={value}>{children}</TransportCtx.Provider>;
}

export function useTransport() {
  const ctx = useContext(TransportCtx);
  if (!ctx) throw new Error("useTransport must be used within TransportProvider");
  return ctx;
}