import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import crypto from 'crypto'

async function generateValidPuzzle() {
  console.log('🎯 Generating valid puzzle using connection analysis...')
  
  try {
    // Get the key connector show (Watch What Happens Live)
    const { data: connectorShows } = await supabaseAdmin
      .rpc('rg_shows_with_eligible_count')
      .limit(1)
    
    if (!connectorShows || connectorShows.length === 0) {
      throw new Error('No connector show found')
    }
    
    const connectorShow = connectorShows[0]
    console.log(`Using connector show: ${connectorShow.name} (${connectorShow.eligible_count} eligible people)`)
    
    // Strategy: Use the connector show as the middle row/column
    // This maximizes the chance of intersections
    
    // Get other well-connected shows
    const { data: otherShows } = await supabaseAdmin
      .rpc('rg_shows_with_eligible_count')
      .range(1, 10) // Skip the first (connector) show
    
    if (!otherShows || otherShows.length < 5) {
      throw new Error('Not enough other shows')
    }
    
    // Pick shows that we know have intersections with the connector
    // Based on our analysis: Project Runway, Winter House, Summer House work well
    const rowShows = [
      connectorShow.id,  // Watch What Happens Live (row 0)
      otherShows.find((s: any) => s.name.includes('Project Runway'))?.id || otherShows[0].id,  // Project Runway (row 1)
      otherShows.find((s: any) => s.name.includes('Winter House'))?.id || otherShows[1].id     // Winter House (row 2)
    ]
    
    const colShows = [
      otherShows.find((s: any) => s.name.includes('Vanderpump'))?.id || otherShows[2].id,   // Vanderpump Rules (col 0)
      connectorShow.id,  // Watch What Happens Live (col 1) - ensures row 0 & 1 & 2 all intersect
      otherShows.find((s: any) => s.name.includes('Summer House'))?.id || otherShows[3].id   // Summer House (col 2)  
    ]
    
    console.log('Testing combination with connector as middle column...')
    
    // Verify intersections
    let isValid = true
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
          answer_count: intersectionCount || 0
        })
        
        if (intersectionCount === 0) {
          console.log(`❌ Empty intersection at (${r},${c})`)
          isValid = false
        }
      }
    }
    
    if (!isValid) {
      // Fallback: Create a simpler 2x2 puzzle or use manual selection
      throw new Error('Could not create valid 3x3 grid with current data')
    }
    
    // Generate and save puzzle
    const puzzleId = crypto.randomUUID()
    const today = new Date().toISOString().split('T')[0]
    
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
    
    const { error: cellsError } = await supabaseAdmin
      .from('rg_daily_cells')
      .upsert(cells.map(cell => ({
        ...cell,
        puzzle_id: puzzleId
      })), { onConflict: 'puzzle_id,row_idx,col_idx' })
    
    if (cellsError) {
      throw cellsError
    }
    
    // Display results
    const { data: shows } = await supabaseAdmin
      .from('rg_shows')
      .select('id, name')
      .in('id', [...rowShows, ...colShows])
    
    const showMap = new Map(shows?.map(s => [s.id, s.name]) || [])
    
    console.log(`\n✅ Generated valid puzzle: ${puzzleId}`)
    
    console.log('\nRow Shows:')
    rowShows.forEach((id, i) => {
      console.log(`  ${i}: ${showMap.get(id)}`)
    })
    
    console.log('\nCol Shows:')  
    colShows.forEach((id, i) => {
      console.log(`  ${i}: ${showMap.get(id)}`)
    })
    
    console.log('\nAnswer Count Matrix:')
    for (let r = 0; r < 3; r++) {
      const row = cells
        .filter(c => c.row_idx === r)
        .sort((a, b) => a.col_idx - b.col_idx)
        .map(c => c.answer_count.toString().padStart(2))
        .join(' ')
      console.log(`  ${row}`)
    }
    
    return puzzleId
    
  } catch (error) {
    console.error('❌ Valid puzzle generation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  generateValidPuzzle()
    .then(puzzleId => {
      console.log(`\n🎉 Success! Generated valid puzzle: ${puzzleId}`)
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { generateValidPuzzle }