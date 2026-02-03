import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useAppState } from "../state/useAppState";

/**
 * For MVP we render each dancer as a vertical stick: a line (cylinder) for body and a small sphere for head.
 * We map meters -> units directly (1 meter = 1 unit).
 */

function Stick({ x, y, color, label }: { x: number; y: number; color: string; label: string }) {
  return (
    <group position={[x, 0, y]}>
      {/* body */}
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.5, 6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export default function ThreePreview() {
  const { dancers } = useAppState();

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [0, 6, 8], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          {/* ground plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#071018" />
          </mesh>

          {/* dancers as sticks */}
          {dancers.map((d) => (
            <Stick key={d.id} x={d.position.x} y={-d.position.y} color={"#071018"} label={d.label} />
          ))}
        </Suspense>

        <OrbitControls />
      </Canvas>
    </div>
  );
}