import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import crypto from 'crypto'

async function generateImprovedPuzzle() {
  console.log('🎯 Generating improved puzzle with fixed data...\n')
  
  try {
    // Step 1: Get all shows with their appearance counts using unlimited query
    console.log('1. Analyzing show connectivity...')
    const { data: allShows } = await supabaseAdmin
      .from('rg_shows')
      .select('id, name, poster_path')
      .range(0, 999) // Get all shows
      
    if (!allShows || allShows.length === 0) {
      throw new Error('No shows found')
    }
    
    // Get appearance data with proper limits
    const { data: allAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('show_id, person_id')
      .range(0, 9999) // Get all appearances
      
    if (!allAppearances || allAppearances.length === 0) {
      throw new Error('No appearances found')
    }
    
    console.log(`Found ${allShows.length} shows and ${allAppearances.length} appearances`)
    
    // Step 2: Calculate show connectivity
    const showAppearanceCounts = new Map<number, number>()
    const showPeople = new Map<number, Set<number>>()
    
    allAppearances.forEach(app => {
      showAppearanceCounts.set(app.show_id, (showAppearanceCounts.get(app.show_id) || 0) + 1)
      
      if (!showPeople.has(app.show_id)) {
        showPeople.set(app.show_id, new Set())
      }
      showPeople.get(app.show_id)!.add(app.person_id)
    })
    
    // Find shows with good connectivity
    const connectedShows = allShows
      .map(show => ({
        ...show,
        appearanceCount: showAppearanceCounts.get(show.id) || 0,
        peopleCount: showPeople.get(show.id)?.size || 0
      }))
      .filter(show => show.appearanceCount > 0)
      .sort((a, b) => b.appearanceCount - a.appearanceCount)
      
    console.log(`\nTop 10 shows by connectivity:`)
    connectedShows.slice(0, 10).forEach((show, i) => {
      console.log(`  ${i + 1}. ${show.name}: ${show.appearanceCount} appearances, ${show.peopleCount} people`)
    })
    
    if (connectedShows.length < 6) {
      throw new Error(`Only found ${connectedShows.length} connected shows, need at least 6`)
    }
    
    // Step 3: Select shows for 3x3 grid
    // Pick diverse shows that are likely to have intersections
    const selectedShows: typeof connectedShows = []
    
    // Pick the most connected show as anchor
    selectedShows.push(connectedShows[0])
    
    // Pick shows with different sizes to maximize intersection variety
    const remaining = connectedShows.slice(1)
    
    // Pick one very connected show
    selectedShows.push(remaining.find(s => s.appearanceCount > 100) || remaining[0])
    
    // Pick some medium connected shows
    selectedShows.push(remaining.find(s => s.appearanceCount > 50 && s.appearanceCount < 200) || remaining[1])
    selectedShows.push(remaining.find(s => s.appearanceCount > 20 && s.appearanceCount < 100) || remaining[2])
    
    // Pick some smaller shows for variety
    selectedShows.push(remaining.find(s => s.appearanceCount > 10 && s.appearanceCount < 50) || remaining[3])
    selectedShows.push(remaining.find(s => s.appearanceCount < 30) || remaining[4])
    
    // Remove duplicates and ensure we have 6 unique shows
    const uniqueShows = Array.from(new Map(selectedShows.map(s => [s.id, s])).values()).slice(0, 6)
    
    console.log(`\nSelected shows for puzzle:`)
    uniqueShows.forEach((show, i) => {
      console.log(`  ${i + 1}. ${show.name}: ${show.appearanceCount} appearances`)
    })
    
    // Step 4: Calculate intersections for 3x3 grid
    const rowShows = uniqueShows.slice(0, 3)
    const colShows = uniqueShows.slice(3, 6)
    
    console.log(`\nGrid layout:`)
    console.log(`Rows: ${rowShows.map(s => s.name).join(', ')}`)
    console.log(`Cols: ${colShows.map(s => s.name).join(', ')}`)
    
    const cells = []
    let totalIntersections = 0
    
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
    
    if (totalIntersections === 0) {
      throw new Error('No intersections found - puzzle would be unsolvable')
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
      .in('puzzle_id', ['temp']) // Clean up any temp data
    
    // Insert new puzzle
    const { error: puzzleError } = await supabaseAdmin
      .from('rg_daily_puzzles')
      .insert({
        id: puzzleId,
        date: puzzleDate,
        row_show_ids: rowShows.map(s => s.id),
        col_show_ids: colShows.map(s => s.id)
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
    console.log(`   Cells with answers: ${cells.filter(c => c.answer_count > 0).length}/9`)
    
    return {
      puzzleId,
      date: puzzleDate,
      rowShows: rowShows.map(s => ({ id: s.id, name: s.name })),
      colShows: colShows.map(s => ({ id: s.id, name: s.name })),
      cells,
      totalIntersections,
      solvableCells: cells.filter(c => c.answer_count > 0).length
    }
    
  } catch (error) {
    console.error('❌ Puzzle generation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  generateImprovedPuzzle()
    .then(result => {
      console.log(`\n🎉 Puzzle generation complete!`)
      console.log(`   Generated puzzle with ${result.totalIntersections} total intersections`)
      console.log(`   ${result.solvableCells}/9 cells have answers`)
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { generateImprovedPuzzle }