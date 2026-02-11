import React, { useMemo, useRef } from "react";
import { useTransport } from "../state/useTransport";
import { useChoreo } from "../state/useChoreo";
import TimelineRuler from "./TimelineRuler";

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Bottom Transport Bar (MVP)
 * - Playback controls (Play/Pause, Seek)
 * - BPM + time signature (existing transport controls)
 * - Loop A/B markers (click/shift-click/alt-click) + explicit buttons
 * - Upload/Change Audio
 * - Clip binding to active sequence (A/B == clip)
 * - Add Picture at current playhead (relative to active sequence)
 */
export default function TransportBar({
  getEditorPositions,
}: {
  getEditorPositions: () => Record<string, { x: number; y: number }>;
}) {
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
    e.target.value = "";
  };

  const togglePlay = async () => {
    if (!(t.durationSec > 0)) return;
    if (t.isPlaying) t.pause();
    else await t.play();
  };

  const setAFromPlayhead = () => {
    if (!(t.durationSec > 0)) return;
    t.setLoopAAt(t.currentSec);
  };

  const setBFromPlayhead = () => {
    if (!(t.durationSec > 0)) return;
    t.setLoopBAt(t.currentSec);
  };

  const bindClipFromLoop = () => {
    if (!activeSeq) return alert("Create/select a sequence first.");
    if (!(t.durationSec > 0)) return alert("Load an audio file first.");
    if (t.loopA == null || t.loopB == null || !(t.loopB > t.loopA)) return alert("Set Loop A and Loop B first.");
    choreo.setSequenceMusicClip(activeSeq.id, t.loopA, t.loopB);
  };

  const clearClip = () => {
    if (!activeSeq) return;
    choreo.clearSequenceMusicClip(activeSeq.id);
  };

  const addPictureHere = () => {
    if (!activeSeq) return alert("Create/select a sequence first.");
    const positions = getEditorPositions();
    const name = prompt("Picture name?", `Picture ${activeSeq.pictures.length + 1}`) ?? "";
    const isMove = confirm("Is this a MOVEMENT picture?\n\nOK = Movement\nCancel = Main");
    choreo.addPictureAtTime(positions, choreo.currentSec, name, isMove ? "move" : "main");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={togglePlay} disabled={!(t.durationSec > 0)}>
          {t.isPlaying ? "Pause" : "Play"}
        </button>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          BPM
          <input
            type="number"
            value={t.bpm}
            min={30}
            max={250}
            onChange={(e) => t.setBpm(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Time Sig
          <select value={t.timeSig} onChange={(e) => t.setTimeSig(e.target.value as any)}>
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
            <option value="6/8">6/8</option>
            <option value="2/4">2/4</option>
          </select>
        </label>

        <button type="button" onClick={setAFromPlayhead} disabled={!(t.durationSec > 0)}>
          Loop A
        </button>
        <button type="button" onClick={setBFromPlayhead} disabled={!(t.durationSec > 0)}>
          Loop B
        </button>
        <button type="button" onClick={() => t.toggleLoop()} disabled={t.loopA == null || t.loopB == null}>
          {t.loopEnabled ? "Loop On" : "Loop Off"}
        </button>
        <button type="button" onClick={() => t.clearLoop()} disabled={!t.loopEnabled && t.loopA == null && t.loopB == null}>
          Clear Loop
        </button>

        <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={onFile} />
        <button type="button" onClick={pickFile}>
          {t.audioName ? "Change Audio" : "Upload Audio"}
        </button>

        <button type="button" onClick={bindClipFromLoop} disabled={!(t.durationSec > 0)}>
          Bind Clip (A→B) to Sequence
        </button>
        <button type="button" onClick={clearClip} disabled={!activeSeq || !clip}>
          Clear Clip
        </button>

        <button type="button" onClick={addPictureHere} disabled={!activeSeq}>
          Add Picture @ Playhead
        </button>

        <div style={{ opacity: 0.8, marginLeft: "auto" }}>
          {t.audioName ? `Audio: ${t.audioName}` : "No audio loaded"} • {clipLabel}
        </div>
      </div>

      <TimelineRuler />
    </div>
  );
}
