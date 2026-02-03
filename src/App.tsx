import "./App.css";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Choreo Editor (MVP)</div>
        <div className="topbar-actions">
          <button>New</button>
          <button>Load</button>
          <button>Save</button>
          <button>Save Version</button>
          <button>Versions</button>
        </div>
      </header>

      <main className="main">
        <section className="panel">
          <h2>2D Stage Editor</h2>
          <div className="canvasPlaceholder">Stage canvas goes here</div>
        </section>

        <section className="panel">
          <h2>3D Preview</h2>
          <div className="canvasPlaceholder">3D canvas goes here</div>
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

        <div className="rulerPlaceholder">Timeline ruler goes here</div>
      </footer>
    </div>
  );
}