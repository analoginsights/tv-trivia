import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import crypto from 'crypto'

async function generateWorkingPuzzle() {
  console.log('🎯 Generating working puzzle with current data...\n')
  
  try {
    // Step 1: Get all shows with their appearance counts
    console.log('1. Analyzing available shows...')
    const { data: allShows } = await supabaseAdmin
      .from('rg_shows')
      .select('id, name, poster_path')
      .range(0, 999)
      
    if (!allShows || allShows.length === 0) {
      throw new Error('No shows found')
    }
    
    // Get appearance data
    const { data: allAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('show_id, person_id')
      .range(0, 9999)
      
    if (!allAppearances || allAppearances.length === 0) {
      throw new Error('No appearances found')
    }
    
    console.log(`Found ${allShows.length} shows and ${allAppearances.length} appearances`)
    
    // Step 2: Calculate show connectivity and people per show
    const showAppearanceCounts = new Map<number, number>()
    const showPeople = new Map<number, Set<number>>()
    
    allAppearances.forEach(app => {
      showAppearanceCounts.set(app.show_id, (showAppearanceCounts.get(app.show_id) || 0) + 1)
      
      if (!showPeople.has(app.show_id)) {
        showPeople.set(app.show_id, new Set())
      }
      showPeople.get(app.show_id)!.add(app.person_id)
    })
    
    // Find shows with appearances
    const connectedShows = allShows
      .map(show => ({
        ...show,
        appearanceCount: showAppearanceCounts.get(show.id) || 0,
        peopleCount: showPeople.get(show.id)?.size || 0
      }))
      .filter(show => show.appearanceCount > 0)
      .sort((a, b) => b.appearanceCount - a.appearanceCount)
      
    console.log(`\nConnected shows:`)
    connectedShows.forEach((show, i) => {
      console.log(`  ${i + 1}. ${show.name}: ${show.appearanceCount} appearances, ${show.peopleCount} people`)
    })
    
    if (connectedShows.length < 6) {
      throw new Error(`Only found ${connectedShows.length} connected shows, need at least 6`)
    }
    
    // Step 3: Use all 6 connected shows for the puzzle
    const selectedShows = connectedShows.slice(0, 6)
    const rowShows = selectedShows.slice(0, 3)
    const colShows = selectedShows.slice(3, 6)
    
    console.log(`\nSelected shows for 3x3 puzzle:`)
    console.log(`Rows: ${rowShows.map(s => s.name).join(', ')}`)
    console.log(`Cols: ${colShows.map(s => s.name).join(', ')}`)
    
    // Step 4: Calculate intersections for 3x3 grid
    const cells = []
    let totalIntersections = 0
    
    console.log('\nCalculating intersections:')
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const rowShow = rowShows[row]
        const colShow = colShows[col]
        
        const rowPeople = showPeople.get(rowShow.id) || new Set()
        const colPeople = showPeople.get(colShow.id) || new Set()
        
        const intersection = new Set([...rowPeople].filter(x => colPeople.has(x)))
        const answerCount = intersection.size
        
        cells.push({
          row_idx: row,
          col_idx: col,
          answer_count: answerCount
        })
        
        totalIntersections += answerCount
        console.log(`  [${row},${col}] ${rowShow.name} ∩ ${colShow.name}: ${answerCount} people`)
      }
    }
    
    console.log(`\nTotal intersections: ${totalIntersections}`)
    const solvableCells = cells.filter(c => c.answer_count > 0).length
    
    if (totalIntersections === 0) {
      console.log('⚠️  No intersections found, but creating puzzle anyway for testing')
    }
    
    // Step 5: Save puzzle to database
    const puzzleDate = new Date().toISOString().split('T')[0]
    const puzzleId = crypto.randomUUID()
    
    console.log(`\nSaving puzzle for ${puzzleDate}...`)
    
    // Delete any existing puzzle for today
    await supabaseAdmin
      .from('rg_daily_puzzles')
      .delete()
      .eq('date', puzzleDate)
      
    await supabaseAdmin
      .from('rg_daily_cells')
      .delete()
      .in('puzzle_id', ['temp'])
    
    // Insert new puzzle
    const { error: puzzleError } = await supabaseAdmin
      .from('rg_daily_puzzles')
      .insert({
        id: puzzleId,
        date: puzzleDate,
        row_show_ids: rowShows.map(s => s.id),
        col_show_ids: colShows.map(s => s.id),
        seed: Math.floor(Math.random() * 1000000).toString()
      })
      
    if (puzzleError) {
      console.error('Failed to save puzzle:', puzzleError)
      throw puzzleError
    }
    
    // Insert cells
    const cellsWithPuzzleId = cells.map(cell => ({
      ...cell,
      puzzle_id: puzzleId
    }))
    
    const { error: cellsError } = await supabaseAdmin
      .from('rg_daily_cells')
      .insert(cellsWithPuzzleId)
      
    if (cellsError) {
      console.error('Failed to save cells:', cellsError)
      throw cellsError
    }
    
    console.log(`✅ Puzzle saved successfully!`)
    console.log(`   Puzzle ID: ${puzzleId}`)
    console.log(`   Date: ${puzzleDate}`)
    console.log(`   Total intersections: ${totalIntersections}`)
    console.log(`   Solvable cells: ${solvableCells}/9`)
    
    // Show final grid layout
    console.log('\n🎮 Final Grid Layout:')
    console.log('     | Col 0 | Col 1 | Col 2')
    console.log('-----|-------|-------|-------')
    for (let row = 0; row < 3; row++) {
      const rowCells = cells.filter(c => c.row_idx === row)
      const rowText = `Row ${row}|   ${rowCells[0].answer_count}   |   ${rowCells[1].answer_count}   |   ${rowCells[2].answer_count}`
      console.log(rowText)
    }
    
    return {
      puzzleId,
      date: puzzleDate,
      rowShows: rowShows.map(s => ({ id: s.id, name: s.name })),
      colShows: colShows.map(s => ({ id: s.id, name: s.name })),
      cells,
      totalIntersections,
      solvableCells
    }
    
  } catch (error) {
    console.error('❌ Puzzle generation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  generateWorkingPuzzle()
    .then(result => {
      console.log(`\n🎉 Puzzle generation complete!`)
      console.log(`   Generated puzzle with ${result.totalIntersections} total intersections`)
      console.log(`   ${result.solvableCells}/9 cells have answers`)
      
      if (result.solvableCells > 0) {
        console.log('✅ Puzzle has solvable cells - game is playable!')
      } else {
        console.log('⚠️  Puzzle has no intersections - may need more cross-show appearances')
      }
      
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { generateWorkingPuzzle }