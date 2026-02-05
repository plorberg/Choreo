import React, { useState, useEffect, useRef } from "react";
import { AppStateProvider, useAppState } from "./state/useAppState";
import ReactDOM from "react-dom/client";
import { TransportProvider } from "./state/useTransport";
import { ChoreoProvider, useChoreo } from "./state/useChoreo";
import Stage2D from "./components/Stage2D";
import ThreePreview from "./components/ThreePreview";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDate(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function downloadJson(filename: string, obj: any) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function PictureBar() {
  const { viewMode, setViewMode, dancers, setDancers } = useAppState() as any;  const choreo = useChoreo();
  const [status, setStatus] = useState<string>("");

  const activeSeq = choreo.getActiveSequence();

  // ✅ needed for import
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const createSequence = () => {
    const name = prompt("Sequence name?", `Sequence ${choreo.sequences.length + 1}`) ?? "";
    choreo.createSequence(name);
    setStatus(`Created sequence: ${name || "Unnamed"}`);
  };
const applyPictureToEditor = (positions: Record<string, { x: number; y: number }>) => {
  if (typeof setDancers === "function") {
    setDancers((prev: any[]) =>
      prev.map((d) => {
        const p = positions[String(d.id)];
        return p ? { ...d, position: { x: p.x, y: p.y } } : d;
      })
    );
    return;
  }

  // fallback: if you only have moveDancer(id,pos)
  // (optional) implement if your app state exposes moveDancer
};
  const savePicture = () => {
    const positions: Record<string, { x: number; y: number }> = {};
    (dancers ?? []).forEach((d: any) => {
      if (!d?.id || !d?.position) return;
      positions[String(d.id)] = { x: d.position.x, y: d.position.y };
    });

    const seq = choreo.getActiveSequence();
    const name = prompt("Picture name?", seq ? `Picture ${seq.pictures.length + 1}` : "Picture 1") ?? "";

    const isMove = confirm("Is this a MOVEMENT picture?\n\nOK = Movement\nCancel = Main");
    choreo.addPicture(positions, name, isMove ? "move" : "main");
    setStatus(`Saved Picture at ${new Date().toLocaleTimeString()}`);
  };

  const openSequences = () => {
    const list = choreo.sequences;
    if (list.length === 0) return alert("No sequences yet.");
    const menu = list
      .slice(0, 30)
      .map((s: any, i: number) => `${i + 1}. ${s.name} • pictures:${s.pictures.length}`)
      .join("\n");

    const pick = prompt(
      `Sequences:\n\n${menu}\n\nType number to SET ACTIVE.\nType "r<number>" to RENAME.\nType "d<number>" to DELETE.`
    );
    if (!pick) return;

    const del = pick.startsWith("d");
    const ren = pick.startsWith("r");
    const n = Number((del || ren) ? pick.slice(1) : pick);

    if (!Number.isFinite(n) || n < 1 || n > list.length) return;
    const seq = list[n - 1];

    if (del) {
      if (confirm(`Delete "${seq.name}"?`)) choreo.deleteSequence(seq.id);
      return;
    }
    if (ren) {
      const newName = prompt("New name?", seq.name);
      if (newName) choreo.renameSequence(seq.id, newName);
      return;
    }
    choreo.setActiveSequence(seq.id);
    setStatus(`Active: ${seq.name}`);
  };

  const openPictures = () => {
    const seq = choreo.getActiveSequence();
    if (!seq) return alert("Create/select a sequence first.");
    if (seq.pictures.length === 0) return alert("No pictures yet. Click “Save Picture” to create one.");

    const menu = seq.pictures
      .map((p: any, i: number) => {
        const dur = i < seq.pictures.length - 1 ? `→ ${p.toNextSec.toFixed(1)}s` : "(last)";
        return `${i + 1}. ${p.name} ${dur}`;
      })
      .join("\n");

    const pick = prompt(
      `Pictures in "${seq.name}":\n\n${menu}\n\nType "r<number>" to rename.\nType g<number> to GO TO that picture for editing.\nType "d<number>" to delete.\nType "t<number>" to set transition seconds from that picture.`
    );
    if (!pick) return;

    const ren = pick.startsWith("r");
    const del = pick.startsWith("d");
    const trn = pick.startsWith("t");
    const go  = pick.startsWith("g");
    const n = Number(pick.slice(1));

    if (!Number.isFinite(n) || n < 1 || n > seq.pictures.length) return;

    const pic = seq.pictures[n - 1];

    if (ren) {
      const newName = prompt("New picture name?", pic.name);
      if (newName) choreo.renamePicture(pic.id, newName);
      return;
    }
    if (go) {
  const idx = n - 1;
  const target = seq.pictures[idx];
  if (!target) return;

  // apply pose into editor
  applyPictureToEditor(target.positions);

  // move timeline to the start of that picture
  const sec = choreo.getPictureStartSec(idx);
  choreo.seek(sec);

  setStatus(`Editing picture: ${target.name}`);
  return;
}
    if (del) {
      if (confirm(`Delete picture "${pic.name}"?`)) choreo.deletePicture(pic.id);
      return;
    }
    if (trn) {
      if (n === seq.pictures.length) return alert("Last picture has no transition to next.");
      const v = prompt("Transition duration (seconds) to next picture?", String(pic.toNextSec ?? 2));
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) choreo.setTransitionDuration(pic.id, num);
      return;
    }
  };

  // Versioning
  const saveVersion = () => {
    const name = prompt("Version label (optional)?", `Version ${choreo.versions.length + 1}`) ?? "";
    choreo.saveVersion(name);
    setStatus(`Saved version: ${name || "Version"}`);
  };

  const openVersions = () => {
    const list = choreo.versions;
    if (list.length === 0) return alert("No versions yet. Click “Save Version” first.");

    const menu = list
      .slice(0, 30)
      .map((v: any, i: number) => `${i + 1}. ${v.name} • ${fmtDate(v.createdAt)}`)
      .join("\n");

    const pick = prompt(
      `Versions (newest first):\n\n${menu}\n\nType number to RESTORE.\nType "d<number>" to DELETE.\nType "c" to CLEAR ALL.`
    );
    if (!pick) return;

    if (pick.toLowerCase() === "c") {
      if (confirm("Clear ALL versions?")) choreo.clearVersions();
      return;
    }

    const del = pick.startsWith("d");
    const n = Number(del ? pick.slice(1) : pick);
    if (!Number.isFinite(n) || n < 1 || n > list.length) return;

    const ver = list[n - 1];
    if (del) {
      if (confirm(`Delete version "${ver.name}"?`)) choreo.deleteVersion(ver.id);
      return;
    }

    if (confirm(`Restore "${ver.name}"? This will overwrite current state.`)) {
      choreo.restoreVersion(ver.id);
      setStatus(`Restored version: ${ver.name}`);
    }
  };

  // ✅ Export / Import
  const onExport = () => {
    // If you didn't add buildExport() yet, see note below.
    const includeVersions = confirm("Include versions in export?");
    const data = choreo.buildExport(includeVersions);
    const stamp = new Date(data.exportedAt).toISOString().replace(/[:.]/g, "-");
    downloadJson(`choreo-export-${stamp}.json`, data);
    setStatus("Exported JSON");
  };

  const onImportClick = () => {
    fileInputRef.current?.click();
  };
  React.useEffect(() => {
  const seq = choreo.getActiveSequence();
  if (!seq || seq.pictures.length === 0) return;

  // when loadToken changes, we just imported/restored
  const first = seq.pictures[0];
  applyPictureToEditor(first.positions);
  choreo.seek(0);
  setStatus(`Loaded start picture: ${first.name}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [choreo.loadToken]);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const text = await f.text();
      const data = JSON.parse(text);

      if (!confirm("Import will overwrite your current project. Continue?")) return;

      // If you didn't add importExport() yet, see note below.
      choreo.importExport(data);
      setStatus(`Imported: ${f.name}`);
    } catch (err) {
      console.error(err);
      alert("Failed to import. File is not valid JSON or schema mismatch.");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="transport">
      <button type="button" onClick={createSequence}>
        New Sequence
      </button>

      <button type="button" onClick={openSequences}>
        Sequences
      </button>

      <span className="divider" />

      <button type="button" onClick={savePicture}>
        Save Picture
      </button>

      <span style={{ marginLeft: 10, fontWeight: 800, opacity: 0.95 }}>
        Pictures: {activeSeq ? activeSeq.pictures.length : 0}
      </span>

      <button type="button" onClick={openPictures} disabled={!activeSeq}>
        Pictures
      </button>

      <span className="divider" />

      <button type="button" onClick={saveVersion}>
        Save Version
      </button>

      <button type="button" onClick={openVersions}>
        Versions ({choreo.versions.length})
      </button>

      <span className="divider" />

      <button type="button" onClick={onExport}>
        Export JSON
      </button>

      <button type="button" onClick={onImportClick}>
        Import JSON
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={onImportFile}
      />

      <span className="divider" />

      <button type="button" onClick={() => (choreo.isPlaying ? choreo.pause() : choreo.play())} disabled={!activeSeq}>
        {choreo.isPlaying ? "Pause" : "Play"}
      </button>

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Time{" "}
        <input
          type="range"
          min={0}
          max={Math.max(0, choreo.durationSec)}
          step={0.01}
          value={choreo.currentSec}
          onChange={(e) => choreo.seek(Number(e.target.value))}
          style={{ width: 240 }}
          disabled={!activeSeq || choreo.durationSec <= 0}
        />
        <span style={{ minWidth: 90 }}>
          {fmtTime(choreo.currentSec)} / {fmtTime(choreo.durationSec)}
        </span>
      </label>

      <span className="divider" />

      <button type="button" onClick={() => setViewMode(viewMode === "couples" ? "dancers" : "couples")}>
        {viewMode === "couples" ? "Split Couples" : "Show Couples"}
      </button>

      <span className="pill">{viewMode === "couples" ? "Couples" : "Split"}</span>

      <div style={{ marginLeft: 12, opacity: 0.85, whiteSpace: "nowrap" }}>{status}</div>
    </div>
  );
}

function AppInner() {
  const choreo = useChoreo();
  const [show3D, setShow3D] = useState<boolean>(false);

  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#eee", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 10, fontWeight: 800 }}>
        App mounted ✅
      </div>

      <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 12, flex: 1 }}>
        <div style={{ height: 500, border: "1px solid #333" }}>
          <Stage2D />
        </div>

        <div style={{ height: 500, border: "1px solid #333" }}>
          {show3D ? <ThreePreview /> : <div>3D disabled</div>}
        </div>
      </main>

      <footer style={{ borderTop: "1px solid #333", padding: 10 }}>
        <PictureBar />
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