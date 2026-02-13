import React from "react";
import Stage2D from "../components/Stage2D";
import ThreePreview from "../components/ThreePreview";

export function Workspace({ show3D }: { show3D: boolean }) {
  return (
    <main className="workspace">
      <section className="panel">
        <div className="panelTitle">2D Stage</div>
        <div className="panelBody">
          <Stage2D />
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">3D Preview</div>
        <div className="panelBody">{show3D ? <ThreePreview /> : <div className="hint">3D preview hidden</div>}</div>
      </section>
    </main>
  );
}
