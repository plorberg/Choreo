import React, { useEffect, useRef, useState } from "react";
import { useAppState } from "../state/useAppState";
import { useChoreo } from "../state/useChoreo";
import Dropdown from "../components/Dropdown";
import { resolvePoseForPicture } from "../domain/pictureService";

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

type PicturesView = "root" | "select" | "edit" | "transition";

export function TopMenuBar({
  show3D,
  setShow3D,
}: {
  show3D: boolean;
  setShow3D: (v: boolean) => void;
}) {
  const app: any = useAppState();
  const { viewMode, setViewMode, dancers, setDancers } = app;
  const choreo = useChoreo();

  const [status, setStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastAppliedLoadToken = useRef<any>(null);

  const activeSeq = choreo.getActiveSequence?.() ?? null;

  // Pictures dropdown local navigation state
  const [picsView, setPicsView] = useState<PicturesView>("root");
  const [selectedPicIndex, setSelectedPicIndex] = useState<number>(-1);

  const applyPictureToEditor = (positions: Record<string, { x: number; y: number }>) => {
    if (!positions) return;

    // preferred: app's canonical update function
    if (typeof app.moveDancer === "function") {
      for (const [id, p] of Object.entries(positions)) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        app.moveDancer(String(id), { x: p.x, y: p.y });
      }
      return;
    }

    // fallback: bulk update dancers
    if (typeof setDancers === "function") {
      setDancers((prev: any[]) =>
        prev.map((d) => {
          const p = positions[String(d.id)];
          if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return d;
          return { ...d, position: { x: p.x, y: p.y } };
        })
      );
    }
  };

  const syncEditorToStartPicture = () => {
    const seq = choreo.getActiveSequence?.();
    if (!seq || seq.pictures.length === 0) return;

    const first = seq.pictures[0];
    if (!first?.positions) return;

    if (typeof choreo.pause === "function") choreo.pause();
    if (typeof choreo.seek === "function") choreo.seek(0);

    applyPictureToEditor(first.positions);
    setStatus(`Loaded start picture: ${first.name}`);
  };

  useEffect(() => {
    if (choreo.loadToken == null) return;
    if (lastAppliedLoadToken.current === choreo.loadToken) return;
    lastAppliedLoadToken.current = choreo.loadToken;

    requestAnimationFrame(() => {
      if (!choreo.getActiveSequence?.() && choreo.sequences?.length) {
        try {
          choreo.setActiveSequence(choreo.sequences[0].id);
        } catch {}
      }
      syncEditorToStartPicture();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choreo.loadToken]);

  // When sequence changes, reset pictures submenu state
  useEffect(() => {
    setPicsView("root");
    setSelectedPicIndex(-1);
    choreo.setUiSelectedPictureId(null); // ✅ Clear selection on sequence change
  }, [activeSeq?.id]);

  const createSequence = () => {
    const name = prompt("Sequence name?", `Sequence ${choreo.sequences.length + 1}`) ?? "";
    choreo.createSequence(name);
    setStatus(`Created sequence: ${name || "Unnamed"}`);
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

  const savePicture = () => {
    const positions: Record<string, { x: number; y: number }> = {};
    (dancers ?? []).forEach((d: any) => {
      if (!d?.id || !d?.position) return;
      positions[String(d.id)] = { x: d.position.x, y: d.position.y };
    });

    const seq = choreo.getActiveSequence();
    if (!seq) return alert("Create/select a sequence first.");

    const name = prompt("Picture name?", `Picture ${seq.pictures.length + 1}`) ?? "";
    const isMove = confirm("Is this a MOVEMENT picture?\n\nOK = Movement\nCancel = Main");

    choreo.addPicture(positions, name, isMove ? "move" : "main");
    setStatus(`Saved Picture`);

    // keep user in pictures menu root; selection stays valid
    setPicsView("root");
  };

  const goToPictureForEditing = (idx: number) => {
    const seq = choreo.getActiveSequence();
    if (!seq) return;

    const target = seq.pictures[idx];
    if (!target) return;

    const resolved = resolvePoseForPicture(seq.pictures, idx);

    applyPictureToEditor(resolved);

    if (typeof choreo.getPictureStartSec === "function" && typeof choreo.seek === "function") {
      choreo.seek(choreo.getPictureStartSec(idx));
    }
    setStatus(`Editing: ${target.name}`);
    choreo.pause();
    choreo.seek(choreo.getPictureStartSec(idx));
  };

  const renameSelectedPicture = () => {
    const seq = choreo.getActiveSequence();
    if (!seq) return;
    if (selectedPicIndex < 0 || selectedPicIndex >= seq.pictures.length) return;

    const pic = seq.pictures[selectedPicIndex];
    const newName = prompt("New picture name?", pic.name);
    if (newName) {
      choreo.renamePicture(pic.id, newName);
      setStatus(`Renamed: ${newName}`);
    }
  };

  const deleteSelectedPicture = () => {
    const seq = choreo.getActiveSequence();
    if (!seq) return;
    if (selectedPicIndex < 0 || selectedPicIndex >= seq.pictures.length) return;

    const pic = seq.pictures[selectedPicIndex];
    if (confirm(`Delete picture "${pic.name}"?`)) {
      choreo.deletePicture(pic.id);
      setStatus(`Deleted: ${pic.name}`);

      // Adjust selection after deletion
      const nextIdx = Math.min(selectedPicIndex, Math.max(0, seq.pictures.length - 2));
      setSelectedPicIndex(seq.pictures.length - 1 <= 0 ? -1 : nextIdx);
      setPicsView("select");
    }
  };

  const setTransitionForSelectedPicture = () => {
    const seq = choreo.getActiveSequence();
    if (!seq) return;
    if (selectedPicIndex < 0 || selectedPicIndex >= seq.pictures.length) return;

    if (selectedPicIndex === seq.pictures.length - 1) {
      alert("Last picture has no transition to next.");
      return;
    }

    const pic = seq.pictures[selectedPicIndex];
    const current = pic.toNextSec ?? pic.moveSec ?? 2;
    const v = prompt("Transition duration (seconds) to next picture?", String(current));
    const num = Number(v);
    if (Number.isFinite(num) && num > 0) {
      if (typeof (choreo as any).setMoveDuration === "function") (choreo as any).setMoveDuration(pic.id, num);
      else if (typeof (choreo as any).setTransitionDuration === "function") (choreo as any).setTransitionDuration(pic.id, num);
      setStatus(`Transition set: ${num.toFixed(2)}s`);
    }
  };

  const saveVersion = () => {
    const name = prompt("Version label (optional)?", `Version ${choreo.versions.length + 1}`) ?? "";
    choreo.saveVersion(name);
    setStatus(`Saved version: ${name || "Version"}`);
  };

  const openVersions = () => {
    const list = choreo.versions;
    if (list.length === 0) return alert("No versions yet.");

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
      lastAppliedLoadToken.current = null;
      requestAnimationFrame(() => {
        if (!choreo.getActiveSequence?.() && choreo.sequences?.length) {
          try {
            choreo.setActiveSequence(choreo.sequences[0].id);
          } catch {}
        }
        syncEditorToStartPicture();
      });
      setStatus(`Restored version: ${ver.name}`);
    }
  };

  const onExport = () => {
    const includeVersions = confirm("Include versions in export?");
    const data = choreo.buildExport(includeVersions);
    const stamp = new Date(data.exportedAt).toISOString().replace(/[:.]/g, "-");
    downloadJson(`choreo-export-${stamp}.json`, data);
    setStatus("Exported JSON");
  };

  const onImportClick = () => fileInputRef.current?.click();

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const text = await f.text();
      const data = JSON.parse(text);

      if (!confirm("Import will overwrite your current project. Continue?")) return;

      choreo.importExport(data);
      lastAppliedLoadToken.current = null;

      requestAnimationFrame(() => {
        if (!choreo.getActiveSequence?.() && choreo.sequences?.length) {
          try {
            choreo.setActiveSequence(choreo.sequences[0].id);
          } catch {}
        }
        syncEditorToStartPicture();
      });

      setStatus(`Imported: ${f.name}`);
    } catch (err) {
      console.error(err);
      alert("Failed to import. File is not valid JSON or schema mismatch.");
    } finally {
      e.target.value = "";
    }
  };

  const seqPictures = activeSeq?.pictures ?? [];
  const selectedPic = selectedPicIndex >= 0 && selectedPicIndex < seqPictures.length ? seqPictures[selectedPicIndex] : null;

  return (
    <div className="headerBar">
      <div className="brand">Choreo</div>

      <div className="menus">
        <Dropdown label="File">
          <button type="button" onClick={onExport}>Export JSON</button>
          <button type="button" onClick={onImportClick}>Import JSON</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={onImportFile}
          />
        </Dropdown>

        <Dropdown label={`Sequences${activeSeq ? `: ${activeSeq.name}` : ""}`}>
          <button type="button" onClick={createSequence}>New Sequence</button>
          <button type="button" onClick={openSequences}>Manage Sequences…</button>
        </Dropdown>

        {/* Pictures: drilldown submenu inside dropdown (no prompt popup) */}
        <Dropdown label="Pictures">
          {!activeSeq ? (
            <div className="muted">Create/select a sequence first.</div>
          ) : picsView === "root" ? (
            <>
              <button type="button" onClick={savePicture}>Add Picture (snapshot)</button>
              <button type="button" onClick={() => setPicsView("select")} disabled={seqPictures.length === 0}>
                Select / Edit Picture…
              </button>
              <div className="dd-sep" />
              <div className="muted">Count: {seqPictures.length}</div>
            </>
          ) : picsView === "select" ? (
  <>
    <button type="button" onClick={() => {
      setPicsView("root");
      choreo.setUiSelectedPictureId(null); // ✅ Clear selection when returning to root
    }}>← Back</button>

    <div className="dd-sep" />
    <div className="muted">Click a picture to load it into the editor.</div>

    <div style={{ maxHeight: 260, overflow: "auto" }}>
      {seqPictures.map((p: any, i: number) => {
        const isSel = i === selectedPicIndex;
        const isNext =
          selectedPicIndex >= 0 && i === selectedPicIndex + 1;

        const dur =
          i < seqPictures.length - 1
            ? `→ ${(p.toNextSec ?? p.moveSec ?? 2).toFixed(1)}s`
            : "(last)";

        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setSelectedPicIndex(i);
              choreo.setUiSelectedPictureId(p.id); // ✅ Set selection state
              goToPictureForEditing(i);
              setPicsView("edit");
            }}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              textAlign: "left",
              opacity: isSel ? 1 : 0.9,
              background: isSel
                ? "#242424"
                : isNext
                ? "#1b1b1b"
                : "transparent",
              borderLeft: isSel
                ? "3px solid #4ea1ff"
                : isNext
                ? "3px solid #666"
                : "3px solid transparent",
              paddingLeft: 6,
            }}
            title={p.id}
          >
            {/* Left side: indicator + name */}
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 14, textAlign: "center" }}>
                {isSel ? "●" : isNext ? "→" : ""}
              </span>
              <span>{i + 1}. {p.name}</span>
            </span>

            {/* Right side: duration to next */}
            <span className="muted">{dur}</span>
          </button>
        );
      })}
    </div>
  </>
) : picsView === "edit" ? (
            <>
              <button type="button" onClick={() => setPicsView("select")}>← Back to list</button>
              <div className="dd-sep" />

              {selectedPic ? (
                <>
                  <div className="muted">
                    Selected: <b>{selectedPic.name}</b>
                  </div>

                  <button type="button" onClick={() => goToPictureForEditing(selectedPicIndex)}>
                    Load into editor
                  </button>

                  <button type="button" onClick={renameSelectedPicture}>
                    Rename…
                  </button>

                  <button type="button" onClick={() => setPicsView("transition")} disabled={selectedPicIndex === seqPictures.length - 1}>
                    Transition to next…
                  </button>

                  <button type="button" onClick={deleteSelectedPicture}>
                    Delete
                  </button>
                </>
              ) : (
                <div className="muted">No picture selected.</div>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={() => setPicsView("edit")}>← Back</button>
              <div className="dd-sep" />
              <div className="muted">Set transition seconds to next picture.</div>
              <button type="button" onClick={setTransitionForSelectedPicture} disabled={!selectedPic || selectedPicIndex === seqPictures.length - 1}>
                Set transition…
              </button>
            </>
          )}
        </Dropdown>

        <Dropdown label={`Versions (${choreo.versions.length})`}>
          <button type="button" onClick={saveVersion}>Save Version</button>
          <button type="button" onClick={openVersions}>Manage Versions…</button>
        </Dropdown>

        <Dropdown label="View">
          <button type="button" onClick={() => setShow3D(!show3D)}>{show3D ? "Hide 3D" : "Show 3D"}</button>
          <button type="button" onClick={() => setViewMode(viewMode === "couples" ? "dancers" : "couples")}>
            {viewMode === "couples" ? "Split Couples" : "Show Couples"}
          </button>
        </Dropdown>
      </div>

      <div className="status" title={status}>
        {status || (activeSeq ? `Active: ${activeSeq.name}` : "No active sequence")}
      </div>
    </div>
  );
}