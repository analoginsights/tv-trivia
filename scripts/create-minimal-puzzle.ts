import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import crypto from 'crypto'

async function createMinimalPuzzle() {
  console.log('🎮 Creating minimal working puzzle...')
  
  try {
    // Use shows we know work well together from the analysis
    // Watch What Happens Live is the key connector
    
    // Get the exact show IDs
    const { data: allShows } = await supabaseAdmin
      .from('rg_shows')
      .select('id, name')
    
    if (!allShows) {
      throw new Error('Could not fetch shows')
    }
    
    const showMap = new Map(allShows.map(s => [s.name, s.id]))
    
    // Use the shows we know have good intersections
    const watchWhatHappensId = showMap.get('Watch What Happens Live with Andy Cohen')
    const projectRunwayId = showMap.get('Project Runway')  
    const winterHouseId = showMap.get('Winter House')
    const summerHouseId = showMap.get('Summer House')
    
    if (!watchWhatHappensId || !projectRunwayId || !winterHouseId || !summerHouseId) {
      throw new Error('Could not find required shows')
    }
    
    // Create a strategic 3x3 using the connector show smartly
    // Strategy: Put connector show in positions that maximize coverage
    const rowShows = [
      watchWhatHappensId,  // Row 0: Watch What Happens Live (connects to many)
      watchWhatHappensId,  // Row 1: Watch What Happens Live (same show = guaranteed intersection)
      winterHouseId        // Row 2: Winter House (has some connections)
    ]
    
    const colShows = [
      projectRunwayId,     // Col 0: Project Runway (intersects with Watch What Happens Live)
      watchWhatHappensId,  // Col 1: Watch What Happens Live (ensures intersections)
      summerHouseId        // Col 2: Summer House (intersects with Watch What Happens Live & Winter House)
    ]
    
    console.log('Using strategic placement with connector show...')
    
    // Test the grid
    const cells = []
    let hasEmptyCell = false
    
    for (let r = 0; r < 3; r++) {
      const rowResults = []
      for (let c = 0; c < 3; c++) {
        const { data: count, error } = await supabaseAdmin
          .rpc('rg_show_intersection_count', {
            show_id_1: rowShows[r],
            show_id_2: colShows[c]
          })
        
        if (error) {
          throw error
        }
        
        const intersectionCount = count || 0
        cells.push({
          row_idx: r,
          col_idx: c,
          answer_count: intersectionCount
        })
        
        rowResults.push(intersectionCount.toString().padStart(2))
        
        if (intersectionCount === 0) {
          hasEmptyCell = true
        }
      }
      console.log(`Row ${r}: ${rowResults.join(' ')}`)
    }
    
    if (hasEmptyCell) {
      console.log('\n⚠️  Some cells are empty, but generating puzzle anyway for testing...')
    }
    
    // Generate puzzle regardless (for testing purposes)
    const today = new Date().toISOString().split('T')[0]
    
    // First, clear any existing data for today
    const { data: existingPuzzle } = await supabaseAdmin
      .from('rg_daily_puzzles')
      .select('id')
      .eq('date', today)
      .single()
    
    if (existingPuzzle) {
      console.log('Clearing existing puzzle and cells for today...')
      // Delete cells first (due to foreign key constraint)
      await supabaseAdmin
        .from('rg_daily_cells')
        .delete()
        .eq('puzzle_id', existingPuzzle.id)
      
      // Then delete the puzzle
      await supabaseAdmin
        .from('rg_daily_puzzles')
        .delete()
        .eq('id', existingPuzzle.id)
    }
    
    // Create new puzzle
    const puzzleId = crypto.randomUUID()
    const { error: puzzleError } = await supabaseAdmin
      .from('rg_daily_puzzles')
      .insert({
        id: puzzleId,
        date: today,
        row_show_ids: rowShows,
        col_show_ids: colShows,
        seed: today
      })
    
    if (puzzleError) {
      throw puzzleError
    }
    
    // Insert new cells
    const { error: cellsError } = await supabaseAdmin
      .from('rg_daily_cells')
      .insert(cells.map(cell => ({
        ...cell,
        puzzle_id: puzzleId
      })))
    
    if (cellsError) {
      throw cellsError
    }
    
    // Display results
    const showNames = new Map(allShows.map(s => [s.id, s.name]))
    
    console.log(`\n✅ Created puzzle: ${puzzleId}`)
    
    console.log('\nRow Shows:')
    rowShows.forEach((id, i) => {
      console.log(`  ${i}: ${showNames.get(id)}`)
    })
    
    console.log('\nCol Shows:')  
    colShows.forEach((id, i) => {
      console.log(`  ${i}: ${showNames.get(id)}`)
    })
    
    console.log(`\nPuzzle Summary:`)
    console.log(`- Empty cells: ${cells.filter(c => c.answer_count === 0).length}/9`)
    console.log(`- Valid cells: ${cells.filter(c => c.answer_count > 0).length}/9`)
    console.log(`- Total answers: ${cells.reduce((sum, c) => sum + c.answer_count, 0)}`)
    
    return puzzleId
    
  } catch (error) {
    console.error('❌ Minimal puzzle creation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  createMinimalPuzzle()
    .then(puzzleId => {
      console.log(`\n🎉 Minimal puzzle created: ${puzzleId}`)
      console.log('📝 Note: This puzzle may have some empty cells for testing purposes.')
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { createMinimalPuzzle }