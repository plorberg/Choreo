import React from "react";
import { useAppState } from "../state/useAppState";
import TransportBar from "../components/TransportBar";

export function Footer() {
  const app: any = useAppState();
  const dancers = app.dancers ?? [];

  const getEditorPositions = () => {
    const positions: Record<string, { x: number; y: number }> = {};
    (dancers ?? []).forEach((d: any) => {
      if (!d?.id || !d?.position) return;
      positions[String(d.id)] = { x: d.position.x, y: d.position.y };
    });
    return positions;
  };

  return (
    <footer className="footer">
      <TransportBar getEditorPositions={getEditorPositions} />
    </footer>
  );
}
