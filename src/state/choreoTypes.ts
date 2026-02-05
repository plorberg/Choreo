import { Vec2 } from "../types";

export type EntityMode = "couples" | "dancers";

export type Frame = {
  id: string;
  beat: number;
  positions: Record<string, Vec2>;
};

export type Segment = {
  id: string;
  name: string;
  createdAt: number;

  mode: EntityMode;
  startSec: number;
  endSec: number;

  bpm: number;
  timeSig: string;

  frames: Frame[];
};

export type Quantize = "1beat" | "2beats" | "1bar";