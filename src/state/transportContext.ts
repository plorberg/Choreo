import React from "react";

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

  waveform: Float32Array | null;

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

  /** Convenience helpers for a single clip/snippet (implemented via loop A/B). */
  setClip: (startSec: number, endSec: number, opts?: { seekToStart?: boolean }) => void;
  clearClip: () => void;

  clearLoop: () => void;
  toggleLoop: () => void;

  secToBeat: (sec: number) => number;
  beatToSec: (beat: number) => number;
};

export const TransportCtx = React.createContext<TransportState | undefined>(undefined);
