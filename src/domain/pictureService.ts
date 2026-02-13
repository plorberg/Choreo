// src/domain/pictureService.ts

import { Picture, Vec2 } from "../state/useChoreo";

/**
 * Find the next MAIN picture index after the given index.
 * Returns -1 if no main picture exists after i.
 */
export function findNextMainIndex(pictures: Picture[], fromIndex: number): number {
  for (let j = fromIndex + 1; j < pictures.length; j++) {
    if (pictures[j]?.kind !== "move") return j;
  }
  return -1;
}

/**
 * Find the previous MAIN picture index before the given index.
 * Returns -1 if no main picture exists before i.
 */
export function findPrevMainIndex(pictures: Picture[], fromIndex: number): number {
  for (let j = fromIndex - 1; j >= 0; j--) {
    if (pictures[j]?.kind !== "move") return j;
  }
  return -1;
}

/**
 * Find the MAIN picture that corresponds to a given picture index.
 * - If the picture at pictureIndex is MAIN, return that index
 * - If the picture at pictureIndex is MOVE, return the previous MAIN index
 * - Returns -1 if no valid main picture is found
 */
export function resolveMainPictureIndex(pictures: Picture[], pictureIndex: number): number {
  if (pictureIndex < 0 || pictureIndex >= pictures.length) return -1;
  
  const pic = pictures[pictureIndex];
  if (!pic) return -1;
  
  // If already main, return it
  if (pic.kind !== "move") return pictureIndex;
  
  // Otherwise walk backward to find the previous main
  return findPrevMainIndex(pictures, pictureIndex);
}

/**
 * Resolve complete dancer positions for a picture by walking backwards
 * to fill in any missing positions from previous pictures.
 * 
 * This ensures that move pictures (which may have partial position data)
 * still render with complete dancer positions.
 */
export function resolvePoseForPicture(
  pictures: Picture[],
  pictureIndex: number
): Record<string, Vec2> {
  const out: Record<string, Vec2> = {};
  if (!pictures || pictureIndex < 0 || pictureIndex >= pictures.length) return out;

  // Walk backwards from the target picture to fill in missing positions
  for (let i = pictureIndex; i >= 0; i--) {
    const pos = pictures[i]?.positions ?? {};
    for (const [id, p] of Object.entries(pos)) {
      if (out[id]) continue; // Already have this dancer's position
      
      const vec = p as any;
      if (vec && Number.isFinite(vec.x) && Number.isFinite(vec.y)) {
        out[id] = { x: vec.x, y: vec.y };
      }
    }
  }
  
  return out;
}

/**
 * Get the current picture index based on timeline time.
 * Uses the getPictureStartSec function to determine which picture
 * the given time falls within.
 */
export function currentPictureIndexAtTime(
  getPictureStartSec: (i: number) => number,
  pictureCount: number,
  timeSec: number
): number {
  if (pictureCount <= 0) return -1;
  
  let idx = 0;
  for (let i = 0; i < pictureCount; i++) {
    const startSec = getPictureStartSec(i);
    if (startSec <= timeSec + 1e-6) {
      idx = i;
    } else {
      break;
    }
  }
  
  return idx;
}
