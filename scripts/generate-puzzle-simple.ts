import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import crypto from 'crypto'

async function generateSimplePuzzle() {
  console.log('🎲 Generating daily puzzle...')
  
  try {
    // Get candidate shows with eligible people
    const { data: candidateShows, error: candidateError } = await supabaseAdmin
      .rpc('rg_shows_with_eligible_count')
    
    if (candidateError || !candidateShows || candidateShows.length < 6) {
      throw new Error(`Not enough candidate shows: ${candidateShows?.length || 0}`)
    }
    
    console.log(`Found ${candidateShows.length} candidate shows`)
    
    // Pick top 6 shows (3 rows, 3 cols)  
    const rowShows = candidateShows.slice(0, 3).map((s: any) => s.id)
    const colShows = candidateShows.slice(3, 6).map((s: any) => s.id)
    
    console.log('Row shows:', rowShows)
    console.log('Col shows:', colShows)
    
    // Verify all intersections have at least 1 person
    const cells = []
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const { data: intersectionCount, error } = await supabaseAdmin
          .rpc('rg_show_intersection_count', {
            show_id_1: rowShows[r],
            show_id_2: colShows[c]
          })
        
        if (error) {
          throw error
        }
        
        cells.push({
          row_idx: r,
          col_idx: c,
          answer_count: intersectionCount
        })
        
        if (intersectionCount === 0) {
          throw new Error(`Empty intersection at (${r},${c})`)
        }
      }
    }
    
    console.log('All intersections valid!')
    
    // Generate puzzle
    const puzzleId = crypto.randomUUID()
    const today = new Date().toISOString().split('T')[0]
    
    // Insert puzzle
    const { error: puzzleError } = await supabaseAdmin
      .from('rg_daily_puzzles')
      .upsert({
        id: puzzleId,
        date: today,
        row_show_ids: rowShows,
        col_show_ids: colShows,
        seed: today
      }, { onConflict: 'date' })
    
    if (puzzleError) {
      throw puzzleError
    }
    
    // Insert cells
    const cellsData = cells.map(cell => ({
      ...cell,
      puzzle_id: puzzleId
    }))
    
    const { error: cellsError } = await supabaseAdmin
      .from('rg_daily_cells')
      .upsert(cellsData, { onConflict: 'puzzle_id,row_idx,col_idx' })
    
    if (cellsError) {
      throw cellsError
    }
    
    console.log(`✅ Generated puzzle ${puzzleId}`)
    console.log('Cell grid:')
    for (let r = 0; r < 3; r++) {
      const row = cells.filter(c => c.row_idx === r)
        .sort((a, b) => a.col_idx - b.col_idx)
        .map(c => c.answer_count.toString().padStart(2))
        .join(' ')
      console.log(`  ${row}`)
    }
    
    return puzzleId
    
  } catch (error) {
    console.error('❌ Puzzle generation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  generateSimplePuzzle()
    .then(puzzleId => {
      console.log(`🎉 Success! Puzzle ID: ${puzzleId}`)
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { generateSimplePuzzle }