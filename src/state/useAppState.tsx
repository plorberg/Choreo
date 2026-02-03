import React, { createContext, useContext, useMemo, useState } from "react";
import { Couple, Dancer, Vec2 } from "../types";

type ViewMode = "couples" | "dancers";

type AppState = {
  dancers: Dancer[];
  couples: Couple[];
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  setDancers: (d: Dancer[]) => void;
  setDancerPosition: (id: string, pos: Vec2) => void;

  moveCoupleToPosition: (coupleId: string, pos: Vec2) => void;
};

const AppStateContext = createContext<AppState | undefined>(undefined);

const STAGE_HALF_M = 8;

function clampToStage(pos: Vec2): Vec2 {
  const clamp = (v: number) => Math.max(-STAGE_HALF_M, Math.min(STAGE_HALF_M, v));
  return { x: clamp(pos.x), y: clamp(pos.y) };
}

/**
 * Initial placement: 8 couples comfortably inside the 16x16 floor.
 * Both Leader and Follower start at the SAME position (couple mode behavior).
 */
function generateInitial(): { dancers: Dancer[]; couples: Couple[] } {
  const dancers: Dancer[] = [];
  const couples: Couple[] = [];

  for (let c = 0; c < 8; c++) {
    const coupleId = `c${c + 1}`;
    const leaderId = `d${c * 2 + 1}`;
    const followerId = `d${c * 2 + 2}`;

    // 4x2 layout (not near borders)
    const col = c % 4;
    const row = Math.floor(c / 4);

    const x = -4.5 + col * 3.0; // -4.5, -1.5, +1.5, +4.5
    const y = row === 0 ? 3.0 : -3.0;

    couples.push({
      id: coupleId,
      name: `Couple ${c + 1}`,
      dancerLeader: leaderId,
      dancerFollower: followerId
    });

    // In split view, both dancers should display couple number, not 1..16
    const coupleLabel = String(c + 1);

    dancers.push({
      id: leaderId,
      label: coupleLabel,
      position: clampToStage({ x, y }),
      facing: 0,
      coupleId,
      role: "Leader"
    });

    dancers.push({
      id: followerId,
      label: coupleLabel,
      position: clampToStage({ x, y }),
      facing: 0,
      coupleId,
      role: "Follower"
    });
  }

  return { dancers, couples };
}

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const init = useMemo(() => generateInitial(), []);
  const [dancers, setDancers] = useState<Dancer[]>(init.dancers);
  const [couples] = useState<Couple[]>(init.couples);

  // Default view: couples (8 tokens)
  const [viewMode, _setViewMode] = useState<ViewMode>("couples");

  const setDancerPosition = (id: string, pos: Vec2) => {
    setDancers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, position: clampToStage(pos) } : p))
    );
  };

  /**
   * Switch between viewing couples vs dancers.
   * - couples mode: collapse Leader + Follower to SAME position
   * - dancers mode: split with Follower 0.5m to the LEFT of Leader
   */
  const setViewMode = (m: ViewMode) => {
    setDancers((prev) => {
      const next = prev.map((d) => ({ ...d }));

      for (const c of couples) {
        const leader = next.find((d) => d.id === c.dancerLeader);
        const follower = next.find((d) => d.id === c.dancerFollower);
        if (!leader || !follower) continue;

        // Use leader as the anchor "couple center"
        const center = leader.position;

        if (m === "couples") {
          const p = clampToStage(center);
          leader.position = p;
          follower.position = p;
        } else {
          // Split:
          // - Leader stays at center
          // - Follower moves 0.5m left
          leader.position = clampToStage({ x: center.x, y: center.y });
          follower.position = clampToStage({ x: center.x - 0.5, y: center.y });
        }
      }

      return next;
    });

    _setViewMode(m);
  };

  /**
   * Move a couple token (couples view) to an absolute position.
   * Both Leader + Follower move together to EXACT same position.
   */
  const moveCoupleToPosition = (coupleId: string, pos: Vec2) => {
    const couple = couples.find((c) => c.id === coupleId);
    if (!couple) return;

    const p = clampToStage(pos);

    setDancers((prev) =>
      prev.map((d) => {
        if (d.id === couple.dancerLeader || d.id === couple.dancerFollower) {
          return { ...d, position: p };
        }
        return d;
      })
    );
  };

  return (
    <AppStateContext.Provider
      value={{
        dancers,
        couples,
        viewMode,
        setViewMode,
        setDancers,
        setDancerPosition,
        moveCoupleToPosition
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}