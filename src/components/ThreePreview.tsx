import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useAppState } from "../state/useAppState";
import { useChoreo } from "../state/useChoreo";

type Vec2 = { x: number; y: number };

const STAGE_HALF = 8;
const FLOOR_COLOR_1 = "#7a5b3d";
const FLOOR_COLOR_2 = "#6b4f35";

function coupleLabelFromId(id: string, idx: number) {
  const m = id.match(/(\d+)\s*$/);
  return m ? m[1] : String(idx + 1);
}

function FloorAndGrid() {
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(FLOOR_COLOR_1) }), []);
  const lineMinor = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color("white"), transparent: true, opacity: 0.18 }),
    []
  );
  const lineMajor = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color("white"), transparent: true, opacity: 0.45 }),
    []
  );

  const gridLines = useMemo(() => {
    const lines: THREE.Line[] = [];
    const makeLine = (a: THREE.Vector3, b: THREE.Vector3, major: boolean) => {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      lines.push(new THREE.Line(g, major ? lineMajor : lineMinor));
    };

    const min = -STAGE_HALF;
    const max = STAGE_HALF;

    for (let i = 0; i <= (STAGE_HALF * 2) * 2; i++) {
      const v = min + i * 0.5;
      const isMeter = i % 2 === 0;
      const emph = isMeter && (Math.abs(v) == 0 || Math.abs(v) === 3 || Math.abs(v) === 6);
      const major = isMeter && emph;

      makeLine(new THREE.Vector3(v, 0.01, min), new THREE.Vector3(v, 0.01, max), major);
      makeLine(new THREE.Vector3(min, 0.01, v), new THREE.Vector3(max, 0.01, v), major);
    }

    return lines;
  }, [lineMajor, lineMinor]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} material={floorMat}>
        <planeGeometry args={[STAGE_HALF * 2, STAGE_HALF * 2]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]}>
        <planeGeometry args={[STAGE_HALF * 2, STAGE_HALF * 2]} />
        <meshStandardMaterial color={FLOOR_COLOR_2} transparent opacity={0.25} />
      </mesh>

      {gridLines.map((l, idx) => (
        <primitive object={l} key={idx} />
      ))}

      <line>
        <bufferGeometry
          attach="geometry"
          setFromPoints={[
            new THREE.Vector3(-STAGE_HALF, 0.02, -STAGE_HALF),
            new THREE.Vector3(STAGE_HALF, 0.02, -STAGE_HALF),
            new THREE.Vector3(STAGE_HALF, 0.02, STAGE_HALF),
            new THREE.Vector3(-STAGE_HALF, 0.02, STAGE_HALF),
            new THREE.Vector3(-STAGE_HALF, 0.02, -STAGE_HALF),
          ]}
        />
        <lineBasicMaterial color="white" transparent opacity={0.5} />
      </line>
    </group>
  );
}

function StickFigure({ position, color }: { position: [number, number, number]; color: string }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(color) }), [color]);
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} material={mat}>
        <cylinderGeometry args={[0.12, 0.14, 0.9, 16]} />
      </mesh>
      <mesh position={[0, 1.1, 0]} material={mat}>
        <sphereGeometry args={[0.18, 16, 16]} />
      </mesh>
    </group>
  );
}

export default function ThreePreview() {
  const app: any = useAppState();
  const choreo = useChoreo();

  const viewMode: "couples" | "dancers" = app.viewMode ?? "couples";
  const dancers: any[] = app.dancers ?? [];
  const couples: any[] = app.couples ?? [];

  const getCoupleLeaderId = (c: any) => String(c.dancerLeader ?? c.leaderId ?? c.leader ?? c.Leader ?? c.a ?? c.A);
  const getCoupleFollowerId = (c: any) =>
    String(c.dancerFollower ?? c.followerId ?? c.follower ?? c.Follower ?? c.b ?? c.B);

  const dancerPose = choreo.getPoseAtSec(choreo.currentSec);
  const isPlayback = Boolean(choreo.isPlaying && dancerPose);

  const findDancerPosFromApp = (id: string): Vec2 | null => {
    const d = dancers.find((x) => String(x.id) === String(id));
    return d?.position ? { x: d.position.x, y: d.position.y } : null;
  };

  const getDancerPos = (id: string): Vec2 | null => {
    if (isPlayback && dancerPose?.[id]) return { x: dancerPose[id].x, y: dancerPose[id].y };
    return findDancerPosFromApp(id);
  };

  const objects = useMemo(() => {
    if (viewMode === "couples") {
      return couples
        .map((c, idx) => {
          const coupleId = String(c.id ?? idx + 1);
          const label = coupleLabelFromId(coupleId, idx);

          const leaderId = getCoupleLeaderId(c);
          const lp = getDancerPos(leaderId);
          if (!lp) return null;

          // ✅ map 2D y to 3D -z (fix twist)
          return {
            key: `c_${coupleId}`,
            pos: [lp.x, 0, -lp.y] as [number, number, number],
            color: "#f2f2f2",
            label,
          };
        })
        .filter(Boolean) as any[];
    }

    // split view: leader+follower
    return couples
      .map((c, idx) => {
        const coupleId = String(c.id ?? idx + 1);
        const label = coupleLabelFromId(coupleId, idx);

        const leaderId = getCoupleLeaderId(c);
        const followerId = getCoupleFollowerId(c);

        const lp = getDancerPos(leaderId);
        let fp = getDancerPos(followerId);

        if (!lp) return null;
        if (!fp) fp = { x: lp.x - 0.5, y: lp.y };

        if (Math.abs(fp.x - lp.x) < 1e-9 && Math.abs(fp.y - lp.y) < 1e-9) {
          fp = { x: lp.x - 0.5, y: lp.y };
        }

        return [
          { key: `p_${coupleId}_L`, pos: [lp.x, 0, -lp.y] as [number, number, number], color: "#5aa0ff", label },
          { key: `p_${coupleId}_F`, pos: [fp.x, 0, -fp.y] as [number, number, number], color: "#ff77b7", label },
        ];
      })
      .flat()
      .filter(Boolean) as any[];
  }, [viewMode, couples, dancers, isPlayback, dancerPose]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas
        camera={{ position: [6, 10, 10], fov: 50 }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color("#101318"))}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[6, 10, 4]} intensity={0.85} />
        <directionalLight position={[-6, 8, -4]} intensity={0.4} />

        <FloorAndGrid />

        {objects.map((o: any) => (
          <StickFigure key={o.key} position={o.pos} color={o.color} />
        ))}

        <OrbitControls enablePan enableZoom enableRotate target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
    </div>
  );
}