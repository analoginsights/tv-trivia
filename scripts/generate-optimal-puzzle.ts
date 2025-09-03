import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import crypto from 'crypto'

async function generateOptimalPuzzle() {
  console.log('🎯 Generating optimal puzzle with guaranteed solutions...\n')
  
  try {
    // Step 1: Get all shows with their appearance data
    console.log('1. Analyzing show connectivity...')
    const { data: allShows } = await supabaseAdmin
      .from('rg_shows')
      .select('id, name, poster_path')
      .range(0, 999)
      
    if (!allShows || allShows.length === 0) {
      throw new Error('No shows found')
    }
    
    // Get all appearances
    const { data: allAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('show_id, person_id')
      .range(0, 9999)
      
    if (!allAppearances || allAppearances.length === 0) {
      throw new Error('No appearances found')
    }
    
    console.log(`Found ${allShows.length} shows and ${allAppearances.length} appearances`)
    
    // Step 2: Build show connectivity map
    const showPeople = new Map<number, Set<number>>()
    const personShows = new Map<number, Set<number>>()
    
    allAppearances.forEach(app => {
      // Track people per show
      if (!showPeople.has(app.show_id)) {
        showPeople.set(app.show_id, new Set())
      }
      showPeople.get(app.show_id)!.add(app.person_id)
      
      // Track shows per person
      if (!personShows.has(app.person_id)) {
        personShows.set(app.person_id, new Set())
      }
      personShows.get(app.person_id)!.add(app.show_id)
    })
    
    // Step 3: Calculate pairwise intersections between all shows
    const connectedShows = allShows
      .filter(show => showPeople.has(show.id))
      .map(show => ({
        ...show,
        peopleCount: showPeople.get(show.id)?.size || 0
      }))
      .sort((a, b) => b.peopleCount - a.peopleCount)
    
    console.log(`Found ${connectedShows.length} shows with appearances`)
    
    // Calculate intersection matrix
    const intersectionMatrix = new Map<string, number>()
    const intersectionPeople = new Map<string, Set<number>>()
    
    for (let i = 0; i < connectedShows.length; i++) {
      for (let j = i + 1; j < connectedShows.length; j++) {
        const show1 = connectedShows[i]
        const show2 = connectedShows[j]
        const key = `${show1.id}-${show2.id}`
        
        const people1 = showPeople.get(show1.id) || new Set()
        const people2 = showPeople.get(show2.id) || new Set()
        const intersection = new Set([...people1].filter(x => people2.has(x)))
        
        intersectionMatrix.set(key, intersection.size)
        intersectionPeople.set(key, intersection)
      }
    }
    
    // Step 4: Find optimal 3x3 grid configuration
    console.log('\n2. Finding optimal 3x3 configuration...')
    
    function getIntersectionCount(show1Id: number, show2Id: number): number {
      const key1 = `${show1Id}-${show2Id}`
      const key2 = `${show2Id}-${show1Id}`
      return intersectionMatrix.get(key1) || intersectionMatrix.get(key2) || 0
    }
    
    function getIntersectionPeople(show1Id: number, show2Id: number): Set<number> {
      const key1 = `${show1Id}-${show2Id}`
      const key2 = `${show2Id}-${show1Id}`
      return intersectionPeople.get(key1) || intersectionPeople.get(key2) || new Set()
    }
    
    let bestConfig: any = null
    let bestScore = 0
    let bestMinIntersection = 0
    
    // Try different combinations of shows for rows and columns
    const topShows = connectedShows.slice(0, Math.min(12, connectedShows.length))
    
    for (let attempt = 0; attempt < 1000 && !bestConfig; attempt++) {
      const shuffled = [...topShows].sort(() => Math.random() - 0.5)
      const rowShows = shuffled.slice(0, 3)
      const colShows = shuffled.slice(3, 6)
      
      // Calculate all intersections for this configuration
      const cells = []
      let totalScore = 0
      let minIntersection = Infinity
      let hasEmptyCell = false
      
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const count = getIntersectionCount(rowShows[row].id, colShows[col].id)
          cells.push({ row, col, count })
          totalScore += count
          minIntersection = Math.min(minIntersection, count)
          if (count === 0) hasEmptyCell = true
        }
      }
      
      // Only consider configurations where every cell has at least 1 solution
      if (!hasEmptyCell && minIntersection > bestMinIntersection) {
        bestConfig = {
          rowShows,
          colShows,
          cells,
          totalScore,
          minIntersection
        }
        bestScore = totalScore
        bestMinIntersection = minIntersection
        
        console.log(`   Found valid config: min=${minIntersection}, total=${totalScore}`)
      }
    }
    
    if (!bestConfig) {
      // Fallback: find the best available configuration even with some empty cells
      console.log('   No perfect configuration found, using best available...')
      
      const fallbackShows = connectedShows.slice(0, 6)
      const rowShows = fallbackShows.slice(0, 3)
      const colShows = fallbackShows.slice(3, 6)
      
      const cells = []
      let totalScore = 0
      
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const count = getIntersectionCount(rowShows[row].id, colShows[col].id)
          cells.push({ row, col, count })
          totalScore += count
        }
      }
      
      bestConfig = { rowShows, colShows, cells, totalScore, minIntersection: 0 }
    }
    
    console.log(`\n✅ Selected configuration:`)
    console.log(`   Rows: ${bestConfig.rowShows.map(s => s.name).join(', ')}`)
    console.log(`   Cols: ${bestConfig.colShows.map(s => s.name).join(', ')}`)
    console.log(`   Min intersection: ${bestConfig.minIntersection}`)
    console.log(`   Total intersections: ${bestConfig.totalScore}`)
    
    // Step 5: Generate detailed cell data with actual people
    console.log('\n3. Generating detailed cell data...')
    
    const detailedCells = []
    for (const cell of bestConfig.cells) {
      const rowShow = bestConfig.rowShows[cell.row]
      const colShow = bestConfig.colShows[cell.col]
      const peopleInCell = getIntersectionPeople(rowShow.id, colShow.id)
      
      // Get person details for this cell
      const cellPeople = []
      for (const personId of peopleInCell) {
        const { data: person } = await supabaseAdmin
          .from('rg_people')
          .select('id, name, profile_path')
          .eq('id', personId)
          .single()
          
        if (person) {
          cellPeople.push({
            id: person.id,
            name: person.name,
            profile_path: person.profile_path
          })
        }
      }
      
      detailedCells.push({
        row_idx: cell.row,
        col_idx: cell.col,
        answer_count: cell.count,
        people: cellPeople
      })
      
      console.log(`   [${cell.row},${cell.col}] ${rowShow.name} ∩ ${colShow.name}: ${cell.count} people`)
    }
    
    // Step 6: Save puzzle to database
    const puzzleDate = new Date().toISOString().split('T')[0]
    const puzzleId = crypto.randomUUID()
    
    console.log(`\n4. Saving optimal puzzle for ${puzzleDate}...`)
    
    // Delete existing puzzle
    await supabaseAdmin
      .from('rg_daily_puzzles')
      .delete()
      .eq('date', puzzleDate)
      
    await supabaseAdmin
      .from('rg_daily_cells')
      .delete()
      .in('puzzle_id', ['temp'])
    
    // Insert puzzle
    const { error: puzzleError } = await supabaseAdmin
      .from('rg_daily_puzzles')
      .insert({
        id: puzzleId,
        date: puzzleDate,
        row_show_ids: bestConfig.rowShows.map(s => s.id),
        col_show_ids: bestConfig.colShows.map(s => s.id),
        seed: Math.floor(Math.random() * 1000000).toString()
      })
      
    if (puzzleError) {
      console.error('Failed to save puzzle:', puzzleError)
      throw puzzleError
    }
    
    // Insert cells (without people data for now)
    const cellsForDB = detailedCells.map(cell => ({
      puzzle_id: puzzleId,
      row_idx: cell.row_idx,
      col_idx: cell.col_idx,
      answer_count: cell.answer_count
    }))
    
    const { error: cellsError } = await supabaseAdmin
      .from('rg_daily_cells')
      .insert(cellsForDB)
      
    if (cellsError) {
      console.error('Failed to save cells:', cellsError)
      throw cellsError
    }
    
    // Step 7: Display results
    console.log(`\n🎉 Optimal puzzle generated successfully!`)
    console.log(`   Puzzle ID: ${puzzleId}`)
    console.log(`   Date: ${puzzleDate}`)
    console.log(`   Cells with solutions: ${detailedCells.filter(c => c.answer_count > 0).length}/9`)
    console.log(`   Minimum solutions per cell: ${bestConfig.minIntersection}`)
    console.log(`   Total solutions: ${bestConfig.totalScore}`)
    
    console.log('\n🎮 Final Grid Layout:')
    console.log('     |  Col 0  |  Col 1  |  Col 2')
    console.log('-----|---------|---------|--------')
    for (let row = 0; row < 3; row++) {
      const rowCells = detailedCells.filter(c => c.row_idx === row)
      const rowText = `Row ${row}|   ${rowCells[0].answer_count.toString().padStart(3)}   |   ${rowCells[1].answer_count.toString().padStart(3)}   |   ${rowCells[2].answer_count.toString().padStart(3)}`
      console.log(rowText)
    }
    
    return {
      puzzleId,
      date: puzzleDate,
      rowShows: bestConfig.rowShows.map(s => ({ id: s.id, name: s.name })),
      colShows: bestConfig.colShows.map(s => ({ id: s.id, name: s.name })),
      cells: detailedCells,
      totalSolutions: bestConfig.totalScore,
      minSolutions: bestConfig.minIntersection,
      perfectGrid: bestConfig.minIntersection > 0
    }
    
  } catch (error) {
    console.error('❌ Optimal puzzle generation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  generateOptimalPuzzle()
    .then(result => {
      console.log(`\n🎯 Optimal Puzzle Summary:`)
      console.log(`   Perfect grid (all cells solvable): ${result.perfectGrid ? 'YES ✅' : 'NO ⚠️'}`)
      console.log(`   Total solutions: ${result.totalSolutions}`)
      console.log(`   Minimum solutions per cell: ${result.minSolutions}`)
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { generateOptimalPuzzle }