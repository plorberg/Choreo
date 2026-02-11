import React, { useMemo, useRef } from "react";
import WaveformClipSelector from "./WaveformClipSelector";
import { useTransport } from "../state/useTransport";
import { useChoreo } from "../state/useChoreo";

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * MVP Music Panel:
 * - Load audio into transport
 * - Bind active sequence to a snippet using "current playhead" as start/end
 *
 * Design:
 * - Transport is the single source of truth for audio + playhead.
 * - Choreo stores snippet boundaries on the Sequence (musicStartSec/musicEndSec).
 */
export default function MusicPanel() {
  const t = useTransport();
  const choreo = useChoreo();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const activeSeq = choreo.getActiveSequence();
  const clip = choreo.getActiveMusicClip();

  const clipLabel = useMemo(() => {
    if (!clip) return "No clip bound";
    return `${fmtTime(clip.startSec)} → ${fmtTime(clip.endSec)} (${fmtTime(clip.endSec - clip.startSec)})`;
  }, [clip]);

  const pickFile = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await t.loadAudioFile(f);
    // after load, if a clip exists, ChoreoProvider will apply it automatically.
    e.target.value = "";
  };

  const setStart = () => {
    if (!activeSeq) return;
    if (!(t.durationSec > 0)) return alert("Load an audio file first.");
    const end = Number.isFinite(activeSeq.musicEndSec) ? Number(activeSeq.musicEndSec) : t.currentSec + 10;
    choreo.setSequenceMusicClip(activeSeq.id, t.currentSec, end);
  };

  const setEnd = () => {
    if (!activeSeq) return;
    if (!(t.durationSec > 0)) return alert("Load an audio file first.");
    const start = Number.isFinite(activeSeq.musicStartSec) ? Number(activeSeq.musicStartSec) : Math.max(0, t.currentSec - 10);
    choreo.setSequenceMusicClip(activeSeq.id, start, t.currentSec);
  };

  const clear = () => {
    if (!activeSeq) return;
    choreo.clearSequenceMusicClip(activeSeq.id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={onFile} />

        <button type="button" onClick={pickFile}>
          {t.audioName ? "Change Audio" : "Load Audio"}
        </button>

        <span style={{ opacity: 0.85, whiteSpace: "nowrap" }}>
          {t.audioName ? `🎵 ${t.audioName} (${fmtTime(t.durationSec)})` : "No audio loaded"}
        </span>

        <span className="divider" />

        <button type="button" onClick={setStart} disabled={!activeSeq || !(t.durationSec > 0)}>
          Set Clip Start
        </button>
        <button type="button" onClick={setEnd} disabled={!activeSeq || !(t.durationSec > 0)}>
          Set Clip End
        </button>
        <button type="button" onClick={clear} disabled={!activeSeq}>
          Clear Clip
        </button>

        <span style={{ opacity: 0.85, whiteSpace: "nowrap" }}>{clipLabel}</span>
      </div>

      {/* MVP waveform selection with drag handles */}
      {activeSeq && t.durationSec > 0 && (
        <WaveformClipSelector
          clip={
            clip ??
            // if no clip is bound yet, show a sensible draft selection around the playhead
            { startSec: Math.max(0, Math.min(t.durationSec, t.currentSec)), endSec: Math.max(0, Math.min(t.durationSec, t.currentSec + 10)) }
          }
          onCommit={(c) => {
            // Commit to sequence. Choreo will apply to transport without seeking (seekToStart: false).
            const lo = Math.max(0, Math.min(t.durationSec, c.startSec));
            const hi = Math.max(0, Math.min(t.durationSec, c.endSec));
            choreo.setSequenceMusicClip(activeSeq.id, lo, hi);
          }}
          height={70}
        />
      )}
    </div>
  );
}
