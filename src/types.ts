export type Vec2 = { x: number; y: number };

export type DancerRole = "Leader" | "Follower";

export type Dancer = {
  id: string;
  label: string;        // should be "1".."8" (couple number)
  position: Vec2;
  facing: number;
  coupleId?: string | null;
  role: DancerRole;
};

export type Couple = {
  id: string;
  name?: string;
  dancerLeader: string;
  dancerFollower: string;
};