import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import crypto from 'crypto'

async function generateSmartPuzzle() {
  console.log('🧠 Generating smart daily puzzle...')
  
  try {
    // Get all candidate shows with eligible people
    const { data: candidateShows, error: candidateError } = await supabaseAdmin
      .rpc('rg_shows_with_eligible_count')
    
    if (candidateError || !candidateShows || candidateShows.length < 6) {
      throw new Error(`Not enough candidate shows: ${candidateShows?.length || 0}`)
    }
    
    console.log(`Found ${candidateShows.length} candidate shows`)
    
    // Try different combinations until we find one that works
    const maxAttempts = 50
    let validCombination = null
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Shuffle and pick shows
      const shuffled = [...candidateShows].sort(() => Math.random() - 0.5)
      const rowShows = shuffled.slice(0, 3).map((s: any) => s.id)
      const colShows = shuffled.slice(3, 6).map((s: any) => s.id)
      
      console.log(`Attempt ${attempt}: Testing combination...`)
      
      // Check all intersections
      let isValid = true
      const cells = []
      
      for (let r = 0; r < 3 && isValid; r++) {
        for (let c = 0; c < 3 && isValid; c++) {
          const { data: intersectionCount, error } = await supabaseAdmin
            .rpc('rg_show_intersection_count', {
              show_id_1: rowShows[r],
              show_id_2: colShows[c]
            })
          
          if (error || intersectionCount === 0) {
            isValid = false
          } else {
            cells.push({
              row_idx: r,
              col_idx: c,
              answer_count: intersectionCount
            })
          }
        }
      }
      
      if (isValid) {
        validCombination = { rowShows, colShows, cells }
        console.log(`✅ Found valid combination on attempt ${attempt}`)
        break
      }
    }
    
    if (!validCombination) {
      throw new Error('Could not find valid puzzle after maximum attempts')
    }
    
    // Generate and save puzzle
    const puzzleId = crypto.randomUUID()
    const today = new Date().toISOString().split('T')[0]
    
    // Insert puzzle
    const { error: puzzleError } = await supabaseAdmin
      .from('rg_daily_puzzles')
      .upsert({
        id: puzzleId,
        date: today,
        row_show_ids: validCombination.rowShows,
        col_show_ids: validCombination.colShows,
        seed: today
      }, { onConflict: 'date' })
    
    if (puzzleError) {
      throw puzzleError
    }
    
    // Clear existing cells for today
    await supabaseAdmin
      .from('rg_daily_cells')
      .delete()
      .in('puzzle_id', [puzzleId])
    
    // Insert new cells
    const cellsData = validCombination.cells.map(cell => ({
      ...cell,
      puzzle_id: puzzleId
    }))
    
    const { error: cellsError } = await supabaseAdmin
      .from('rg_daily_cells')
      .insert(cellsData)
    
    if (cellsError) {
      throw cellsError
    }
    
    // Get show names for display
    const allShowIds = [...validCombination.rowShows, ...validCombination.colShows]
    const { data: shows } = await supabaseAdmin
      .from('rg_shows')
      .select('id, name')
      .in('id', allShowIds)
    
    const showMap = new Map(shows?.map(s => [s.id, s.name]) || [])
    
    console.log(`\n✅ Generated puzzle ${puzzleId}`)
    console.log('\nRow Shows:')
    validCombination.rowShows.forEach((id, i) => {
      console.log(`  ${i}: ${showMap.get(id)}`)
    })
    
    console.log('\nCol Shows:')  
    validCombination.colShows.forEach((id, i) => {
      console.log(`  ${i}: ${showMap.get(id)}`)
    })
    
    console.log('\nCell Answer Counts:')
    for (let r = 0; r < 3; r++) {
      const row = validCombination.cells
        .filter(c => c.row_idx === r)
        .sort((a, b) => a.col_idx - b.col_idx)
        .map(c => c.answer_count.toString().padStart(2))
        .join(' ')
      console.log(`  ${row}`)
    }
    
    return puzzleId
    
  } catch (error) {
    console.error('❌ Smart puzzle generation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  generateSmartPuzzle()
    .then(puzzleId => {
      console.log(`\n🎉 Success! Puzzle ID: ${puzzleId}`)
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { generateSmartPuzzle }