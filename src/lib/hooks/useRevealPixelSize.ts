import { REVEAL_SCHEDULE } from '../config/game'

export function useRevealPixelSize(secondsLeft: number): number {
  for (let i = 0; i < REVEAL_SCHEDULE.stepTimes.length; i++) {
    if (secondsLeft >= REVEAL_SCHEDULE.stepTimes[i]) return REVEAL_SCHEDULE.pixelSizes[i];
  }
  return 1; // final
}

// Re-export for backward compatibility
export const REVEAL_CONSTANTS = { 
  STEP_TIMES: REVEAL_SCHEDULE.stepTimes,
  PIXEL_SIZES: REVEAL_SCHEDULE.pixelSizes, 
  TOTAL: REVEAL_SCHEDULE.total 
};