import React, { useState } from "react";
import { AppStateProvider, useAppState } from "./state/useAppState";
import { TransportProvider, useTransport } from "./state/useTransport";
import { ChoreoProvider, useChoreo } from "./state/useChoreo";
import Stage2D from "./components/Stage2D";
import ThreePreview from "./components/ThreePreview";
import TimelineRuler from "./components/TimelineRuler";

function TransportBar() {
  const t = useTransport();
  const { viewMode, dancers, couples } = useAppState();
  const choreo = useChoreo();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await t.loadAudioFile(f);
    e.target.value = "";
  };

  const captureFrame = () => {
    if (!t.audioName) return alert("Upload audio first.");
    const active = choreo.getActiveSegment();
    if (!active) return alert("Click “New Segment from Loop” first.");

    if (viewMode === "couples") {
      const positions: Record<string, { x: number; y: number }> = {};
      couples.forEach((c: any) => {
        const leader = dancers.find((d: any) => d.id === c.dancerLeader);
        if (leader) positions[c.id] = { ...leader.position };
      });
      choreo.captureFrameAtCurrentTime("couples", positions);
    } else {
      const positions: Record<string, { x: number; y: number }> = {};
      dancers.forEach((d: any) => (positions[d.id] = { ...d.position }));
      choreo.captureFrameAtCurrentTime("dancers", positions);
    }
  };

  const active = choreo.getActiveSegment();

  const openSegments = () => {
    const list = choreo.segments;
    if (list.length === 0) return alert("No segments saved yet.");
    const menu = list
      .slice(0, 30)
      .map((s, i) => `${i + 1}. ${s.name} (${s.mode})  frames:${s.frames.length}`)
      .join("\n");
    const pick = prompt(`Segments:\n\n${menu}\n\nType number to LOAD.\nType "d<number>" to DELETE.`);
    if (!pick) return;

    if (pick.startsWith("d")) {
      const n = Number(pick.slice(1));
      if (!Number.isFinite(n) || n < 1 || n > list.length) return;
      const seg = list[n - 1];
      if (confirm(`Delete "${seg.name}"?`)) choreo.deleteSegment(seg.id);
      return;
    }

    const n = Number(pick);
    if (!Number.isFinite(n) || n < 1 || n > list.length) return;
    choreo.loadSegment(list[n - 1].id);
  };

  return (
    <div className="transport">
      <button onClick={() => (t.isPlaying ? t.pause() : t.play())} disabled={!t.audioName}>
        {t.isPlaying ? "Pause" : "Play"}
      </button>

      <label>
        BPM{" "}
        <input type="number" value={t.bpm} min={30} max={240} onChange={(e) => t.setBpm(Number(e.target.value))} />
      </label>

      <label>
        Time Sig{" "}
        <select value={t.timeSig} onChange={(e) => t.setTimeSig(e.target.value as any)}>
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
        </select>
      </label>

      <button onClick={t.setLoopAHere} disabled={!t.audioName}>Loop A</button>
      <button onClick={t.setLoopBHere} disabled={!t.audioName}>Loop B</button>
      <button onClick={t.toggleLoop} disabled={!t.audioName}>
        {t.loopEnabled ? "Loop On" : "Loop Off"}
      </button>
      <button onClick={t.clearLoop} disabled={!t.audioName}>Clear Loop</button>

      <span className="divider" />

      <button onClick={() => choreo.createOrUpdateActiveFromLoop(viewMode)} disabled={!t.audioName}>
        New Segment from Loop
      </button>

      <label>
        Quantize{" "}
        <select value={choreo.quantize} onChange={(e) => choreo.setQuantize(e.target.value as any)}>
          <option value="1beat">1 beat</option>
          <option value="2beats">2 beats</option>
          <option value="1bar">1 bar</option>
        </select>
      </label>

      <button onClick={captureFrame} disabled={!active}>
        Capture Frame
      </button>

      <button onClick={choreo.deleteFrameAtCurrentTime} disabled={!active}>
        Delete Frame
      </button>

      <button onClick={choreo.saveActiveSegment} disabled={!active}>
        Save Segment
      </button>

      <button onClick={openSegments}>Segments</button>

      <label className="upload">
        Upload Audio
        <input type="file" accept="audio/*" onChange={onUpload} />
      </label>

      <div className="audioName">
        {t.audioName ? `Audio: ${t.audioName}` : "No audio loaded"}
        {active ? ` • Active: ${active.name} (frames: ${active.frames.length})` : ""}
      </div>
    </div>
  );
}

function AppInner() {
  const { viewMode, setViewMode } = useAppState();
  const [show3D, setShow3D] = useState(true);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Choreo Editor (MVP)</div>

        <div className="topbar-actions">
          <button onClick={() => setShow3D((s) => !s)}>{show3D ? "Hide 3D" : "Show 3D"}</button>

          <button onClick={() => setViewMode(viewMode === "couples" ? "dancers" : "couples")}>
            {viewMode === "couples" ? "Split Couples" : "Show Couples"}
          </button>

          <span className="pill">{viewMode === "couples" ? "Couples" : "Split"}</span>
        </div>
      </header>

      <main className="main">
        <section className="panel">
          <h2>2D Stage Editor</h2>
          <div className="canvas">
            <Stage2D />
          </div>
        </section>

        <section className="panel">
          <h2>3D Preview</h2>
          <div className="canvas">{show3D ? <ThreePreview /> : <div className="hint">Enable 3D preview</div>}</div>
        </section>
      </main>

      <footer className="timeline">
        <TransportBar />
        <TimelineRuler />
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <TransportProvider>
        <ChoreoProvider>
          <AppInner />
        </ChoreoProvider>
      </TransportProvider>
    </AppStateProvider>
  );
}