import { supabaseAdmin } from './supabase'
import crypto from 'crypto'

interface ShowPeople {
  [showId: number]: Set<number>
}

interface PuzzleGrid {
  rowShowIds: number[]
  colShowIds: number[]
  cells: { answer_count: number }[][]
}

export async function generateDailyPuzzle(date?: Date): Promise<string> {
  const targetDate = date || new Date()
  const dateStr = targetDate.toISOString().split('T')[0]
  
  console.log(`Generating puzzle for ${dateStr}...`)
  
  // Step 1: Load eligible appearances into memory
  const { data: appearances, error: appearError } = await supabaseAdmin
    .from('rg_eligible_appearances')
    .select('show_id, person_id')
  
  if (appearError || !appearances) {
    throw new Error(`Failed to load appearances: ${appearError?.message}`)
  }
  
  // Build show -> people map
  const showPeople: ShowPeople = {}
  appearances.forEach(({ show_id, person_id }) => {
    if (!showPeople[show_id]) {
      showPeople[show_id] = new Set()
    }
    showPeople[show_id].add(person_id)
  })
  
  const availableShows = Object.keys(showPeople).map(Number)
  console.log(`Available shows with eligible people: ${availableShows.length}`)
  
  // Step 2: Find a valid 3x3 grid
  const maxAttempts = 100
  let validGrid: PuzzleGrid | null = null
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Use date as seed for deterministic randomness
    const seed = `${dateStr}-${attempt}`
    const rng = seedRandom(seed)
    
    // Randomly select 6 shows (3 rows, 3 cols)
    const shuffled = shuffle(availableShows, rng)
    const rowShowIds = shuffled.slice(0, 3)
    const colShowIds = shuffled.slice(3, 6)
    
    // Check all 9 intersections
    const cells: { answer_count: number }[][] = []
    let isValid = true
    
    for (let r = 0; r < 3; r++) {
      cells[r] = []
      for (let c = 0; c < 3; c++) {
        const rowPeople = showPeople[rowShowIds[r]]
        const colPeople = showPeople[colShowIds[c]]
        
        const intersection = new Set(
          [...rowPeople].filter(p => colPeople.has(p))
        )
        
        cells[r][c] = { answer_count: intersection.size }
        
        if (intersection.size === 0) {
          isValid = false
          break
        }
      }
      if (!isValid) break
    }
    
    if (isValid) {
      validGrid = { rowShowIds, colShowIds, cells }
      console.log(`Found valid grid on attempt ${attempt}`)
      break
    }
  }
  
  if (!validGrid) {
    throw new Error('Could not generate valid puzzle after max attempts')
  }
  
  // Step 3: Persist to database
  const puzzleId = crypto.randomUUID()
  
  // Insert puzzle
  const { error: puzzleError } = await supabaseAdmin
    .from('rg_daily_puzzles')
    .upsert({
      id: puzzleId,
      date: dateStr,
      row_show_ids: validGrid.rowShowIds,
      col_show_ids: validGrid.colShowIds,
      seed: dateStr
    }, { onConflict: 'date' })
  
  if (puzzleError) {
    throw new Error(`Failed to save puzzle: ${puzzleError.message}`)
  }
  
  // Insert cells
  const cellsData = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      cellsData.push({
        puzzle_id: puzzleId,
        row_idx: r,
        col_idx: c,
        answer_count: validGrid.cells[r][c].answer_count
      })
    }
  }
  
  const { error: cellsError } = await supabaseAdmin
    .from('rg_daily_cells')
    .upsert(cellsData, { onConflict: 'puzzle_id,row_idx,col_idx' })
  
  if (cellsError) {
    throw new Error(`Failed to save cells: ${cellsError.message}`)
  }
  
  console.log(`Puzzle saved with ID: ${puzzleId}`)
  console.log('Cell answer counts:', validGrid.cells.map(row => row.map(c => c.answer_count)))
  
  return puzzleId
}

function seedRandom(seed: string): () => number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  
  return function() {
    hash = (hash * 9301 + 49297) % 233280
    return hash / 233280
  }
}

function shuffle<T>(array: T[], rng: () => number): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}