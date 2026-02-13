// src/domain/routeService.ts

import { Picture, Vec2 } from "../state/useChoreo";
import {
  findNextMainIndex,
  resolveMainPictureIndex,
  resolvePoseForPicture,
  currentPictureIndexAtTime,
  findPrevMainIndex,
} from "./pictureService";

// Debug flag - set to true to enable arrow computation logging
const DEBUG_ARROWS = false;

export type RouteArrow = {
  dancerId: string;
  fromPos: Vec2;
  toPos: Vec2;
};

/**
 * Compute route arrows between two pictures.
 * Each arrow represents the movement path for a single dancer.
 */
export function computeRouteArrows(
  fromPose: Record<string, Vec2>,
  toPose: Record<string, Vec2>
): RouteArrow[] {
  const dancerIds = new Set<string>([
    ...Object.keys(fromPose),
    ...Object.keys(toPose),
  ]);

  const arrows: RouteArrow[] = [];

  dancerIds.forEach((id) => {
    const fromPos = fromPose[id];
    const toPos = toPose[id];

    // Skip if either position is missing
    if (!fromPos || !toPos) return;
    
    // Validate positions are in valid world space
    if (!Number.isFinite(fromPos.x) || !Number.isFinite(fromPos.y)) return;
    if (!Number.isFinite(toPos.x) || !Number.isFinite(toPos.y)) return;

    arrows.push({
      dancerId: id,
      fromPos,
      toPos,
    });
  });

  return arrows;
}

/**
 * Find the MAIN picture index for time-based routing.
 * This ensures we always route MAIN→MAIN, never involving MOVE pictures.
 */
function findMainPictureAtTime(
  pictures: Picture[],
  getPictureStartSec: (i: number) => number,
  timeSec: number
): number {
  const rawIdx = currentPictureIndexAtTime(
    getPictureStartSec,
    pictures.length,
    timeSec
  );
  
  if (rawIdx < 0 || rawIdx >= pictures.length) return -1;
  
  // If current picture is MOVE, resolve to its MAIN
  return resolveMainPictureIndex(pictures, rawIdx);
}

/**
 * Compute route arrows based on UI selection state.
 * 
 * MAIN-ONLY ROUTING:
 * - Arrows ALWAYS show transition from one MAIN picture to the next MAIN picture
 * - If a MOVE picture is selected, treat it as selecting the previous MAIN picture
 * - If the selected/current MAIN picture is the LAST MAIN picture, arrows disappear
 * 
 * Selection-based routing (when user has selected a picture):
 * - Show arrows from that MAIN picture to the next MAIN picture
 * 
 * Time-based routing (during playback or no selection):
 * - Find the MAIN picture at current time, show arrows to next MAIN picture
 * 
 * This ensures arrows update immediately when user selects a different picture.
 */
export function computeRoutesForSelection(
  pictures: Picture[],
  uiSelectedPictureId: string | null,
  currentTimeSec: number,
  getPictureStartSec: (i: number) => number
): RouteArrow[] {
  if (!pictures || pictures.length < 2) return [];

  let fromIndex: number = -1;
  let toIndex: number = -1;

  // CASE 1: User has explicitly selected a picture
  if (uiSelectedPictureId) {
    const selectedIdx = pictures.findIndex((p) => p.id === uiSelectedPictureId);
    
    if (DEBUG_ARROWS) {
      console.log('[ARROWS] Selection mode:', {
        selectedId: uiSelectedPictureId,
        selectedIdx,
        pictureName: pictures[selectedIdx]?.name,
        pictureKind: pictures[selectedIdx]?.kind,
      });
    }
    
    if (selectedIdx >= 0) {
      // Resolve to the MAIN picture (handles MOVE pictures)
      fromIndex = resolveMainPictureIndex(pictures, selectedIdx);
      if (fromIndex < 0) {
        if (DEBUG_ARROWS) console.log('[ARROWS] No valid main picture found');
        return []; // No valid main picture found
      }

      // Find the next MAIN picture
      toIndex = findNextMainIndex(pictures, fromIndex);
      if (toIndex < 0) {
        if (DEBUG_ARROWS) {
          console.log('[ARROWS] No next main picture - last picture selected (arrows disappear):', {
            fromIndex,
            fromName: pictures[fromIndex]?.name,
          });
        }
        return []; // ✅ No next main picture - ARROWS DISAPPEAR
      }
      
      if (DEBUG_ARROWS) {
        console.log('[ARROWS] Selection routing:', {
          fromIndex,
          fromName: pictures[fromIndex]?.name,
          toIndex,
          toName: pictures[toIndex]?.name,
        });
      }
    }
  }
  
  // CASE 2: No selection or invalid selection - use time-based routing
  // ✅ FIX: Also use MAIN-only routing for time-based case
  if (fromIndex < 0 || toIndex < 0) {
    fromIndex = findMainPictureAtTime(pictures, getPictureStartSec, currentTimeSec);
    
    if (fromIndex < 0) {
      if (DEBUG_ARROWS) console.log('[ARROWS] No MAIN picture found at current time');
      return [];
    }
    
    // Find next MAIN picture
    toIndex = findNextMainIndex(pictures, fromIndex);
    
    if (toIndex < 0) {
      if (DEBUG_ARROWS) {
        console.log('[ARROWS] No next main picture - last picture in sequence (arrows disappear):', {
          fromIndex,
          fromName: pictures[fromIndex]?.name,
        });
      }
      return []; // ✅ Last MAIN picture - ARROWS DISAPPEAR
    }

    if (DEBUG_ARROWS) {
      console.log('[ARROWS] Time-based routing:', {
        currentTimeSec,
        fromIndex,
        fromName: pictures[fromIndex]?.name,
        toIndex,
        toName: pictures[toIndex]?.name,
      });
    }
  }

  // Resolve complete poses for both pictures
  const fromPose = resolvePoseForPicture(pictures, fromIndex);
  const toPose = resolvePoseForPicture(pictures, toIndex);

  if (DEBUG_ARROWS) {
    console.log('[ARROWS] Resolved poses:', {
      fromDancers: Object.keys(fromPose).length,
      toDancers: Object.keys(toPose).length,
      fromSample: Object.keys(fromPose).slice(0, 2).map(id => ({
        id,
        pos: fromPose[id]
      })),
      toSample: Object.keys(toPose).slice(0, 2).map(id => ({
        id,
        pos: toPose[id]
      })),
    });
  }

  const arrows = computeRouteArrows(fromPose, toPose);
  
  if (DEBUG_ARROWS) {
    console.log('[ARROWS] Generated arrows:', {
      count: arrows.length,
      first3: arrows.slice(0, 3).map(a => ({
        id: a.dancerId,
        from: a.fromPos,
        to: a.toPos,
      })),
    });
  }

  return arrows;
}
