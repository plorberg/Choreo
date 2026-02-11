// src/domain/choreo.ts
export type ID = string;
export type Seconds = number;

export type Vec2 = { x: number; y: number };

export type DancerId = string;

export type Picture = {
  id: ID;
  name: string;
  positions: Record<DancerId, Vec2>;
};

export type MusicTrack = {
  id: ID;
  name: string;
  fileName: string;   // user-selected, not stored
  duration: Seconds;
};

export type MusicSnippet = {
  id: ID;
  trackId: ID;
  start: Seconds;
  end: Seconds;
};

export type Sequence = {
  id: ID;
  name: string;
  pictureIds: ID[];
  pictureDuration: Seconds;
  musicSnippetId?: ID; // NEW
};

export type ChoreoProject = {
  dancers: DancerId[];
  pictures: Record<ID, Picture>;
  sequences: Sequence[];
  music?: MusicTrack[]; // NEW
};