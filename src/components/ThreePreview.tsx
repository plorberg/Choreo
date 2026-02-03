import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import { useAppState } from "../state/useAppState";
import { useTransport } from "../state/useTransport";
import { useChoreo } from "../state/useChoreo";

export default function ThreePreview() {
  const { dancers, couples, viewMode } = useAppState();
  const t = useTransport();
  const choreo = useChoreo();

  const pose = t.isPlaying ? choreo.getPoseAtSec(viewMode, t.currentSec) : null;

  const points = useMemo(() => {
    if (viewMode === "couples") {
      return couples
        .map((c: any) => {
          const leader = dancers.find((d: any) => d.id === c.dancerLeader);
          if (!leader) return null;

          const p = (pose && pose[c.id]) ? pose[c.id] : leader.position;
          return {
            id: c.id,
            x: p.x,
            z: p.y,
            color: "#e8e2d6"
          };
        })
        .filter(Boolean) as Array<{ id: string; x: number; z: number; color: string }>;
    }

    return dancers.map((d: any) => {
      const p = (pose && pose[d.id]) ? pose[d.id] : d.position;
      return {
        id: d.id,
        x: p.x,
        z: p.y,
        color: d.role === "Leader" ? "#2E7DFF" : d.role === "Follower" ? "#FF4FA3" : "#e8e2d6"
      };
    });
  }, [viewMode, couples, dancers, pose]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas shadows camera={{ position: [10, 12, 10], fov: 45 }} gl={{ antialias: true }}>
        <color attach="background" args={["#0b0c10"]} />

        <ambientLight intensity={0.75} />
        <directionalLight
          position={[10, 18, 10]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />

        <mesh position={[0, 8, -12]} receiveShadow>
          <planeGeometry args={[50, 20]} />
          <meshStandardMaterial color="#1a1d22" roughness={1} />
        </mesh>

        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#6b4025" roughness={0.98} metalness={0.0} />
        </mesh>

        <Grid
          position={[0, 0.02, 0]}
          args={[16, 16]}
          cellSize={1}
          cellThickness={1.0}
          cellColor={"#f3e1c3"}
          sectionSize={4}
          sectionThickness={2.4}
          sectionColor={"#ffffff"}
          fadeDistance={80}
          fadeStrength={0.2}
        />

        <StageOutline />

        {points.map((p) => (
          <StickMarker key={p.id} x={p.x} z={p.z} color={p.color} />
        ))}

        <OrbitControls makeDefault enablePan enableZoom minDistance={6} maxDistance={40} target={[0, 0, 0]} />
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}

function StickMarker({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.18, 1.2, 6, 10]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      <mesh castShadow position={[0, 1.8, 0]}>
        <sphereGeometry args={[0.22, 18, 18]} />
        <meshStandardMaterial color={"#f5f1ea"} roughness={0.6} />
      </mesh>
    </group>
  );
}

function StageOutline() {
  const y = 0.025;
  const s = 8;
  return (
    <group>
      <Line a={[-s, y, -s]} b={[s, y, -s]} />
      <Line a={[s, y, -s]} b={[s, y, s]} />
      <Line a={[s, y, s]} b={[-s, y, s]} />
      <Line a={[-s, y, s]} b={[-s, y, -s]} />
    </group>
  );
}

function Line({ a, b }: { a: [number, number, number]; b: [number, number, number] }) {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.sqrt(dx * dx + dz * dz);
  const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const rotY = Math.atan2(dx, dz);

  return (
    <mesh position={mid} rotation={[0, rotY, 0]}>
      <boxGeometry args={[0.09, 0.09, len]} />
      <meshStandardMaterial color={"#ffffff"} roughness={0.7} />
    </mesh>
  );
}