import React, { useState } from "react";
import { AppStateProvider, useAppState } from "./state/useAppState";
import Stage2D from "./components/Stage2D";
import ThreePreview from "./components/ThreePreview";

function AppInner() {
  const [show3D, setShow3D] = useState(false);
  const { viewMode, setViewMode } = useAppState();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Choreo Editor (MVP 1)</div>
        <div className="topbar-actions">
          <button>New</button>
          <button>Load</button>
          <button>Save</button>
          <button>Save Version</button>
          <button>Versions</button>

          <button onClick={() => setViewMode(viewMode === "couples" ? "dancers" : "couples")}>
            {viewMode === "couples" ? "Split Couples" : "Show Couples"}
          </button>

          <button onClick={() => setShow3D((s) => !s)}>{show3D ? "Show 2D" : "Show 3D"}</button>
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
          <div className="canvas">
            {show3D ? <ThreePreview /> : <div className="hint">Toggle to 3D to preview</div>}
          </div>
        </section>
      </main>

      <footer className="timeline">
        <div className="transport">
          <button>Play</button>
          <button>Pause</button>
          <label>
            BPM <input type="number" defaultValue={120} min={30} max={240} />
          </label>
          <label>
            Time Sig{" "}
            <select defaultValue="4/4">
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
              <option value="6/8">6/8</option>
            </select>
          </label>
          <button>Loop A</button>
          <button>Loop B</button>
          <button>Clear Loop</button>
          <button>Upload Audio</button>
        </div>

        <div className="ruler">Timeline ruler placeholder</div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppInner />
    </AppStateProvider>
  );
}