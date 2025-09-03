// GuessWho game constants
export const REVEAL_SCHEDULE = {
  stepTimes: [20, 17, 14, 11, 8, 5, 3, 0], // seconds remaining
  pixelSizes: [40, 30, 22, 16, 12, 8, 4, 1], // pixel size for each step
  total: 20, // total seconds
  maxGuesses: 6
}

// RealityGrid game constants  
export const GRID_CONFIG = {
  size: 3, // 3x3 grid
  maxAttempts: 9 // one per cell
}

export const GAME_TYPES = {
  REALITY_GRID: 'realitygrid',
  GUESS_WHO: 'guesswho'
} as const

export type GameType = typeof GAME_TYPES[keyof typeof GAME_TYPES]