import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function analyzeIntersections() {
  console.log('🔍 Analyzing show intersections...\n')
  
  // Get top shows with most eligible people
  const { data: topShows } = await supabaseAdmin
    .rpc('rg_shows_with_eligible_count')
    .limit(10)
  
  if (!topShows || topShows.length < 6) {
    throw new Error('Not enough shows with eligible people')
  }
  
  console.log('Top shows with eligible people:')
  topShows.forEach((show: any, i) => {
    console.log(`${i + 1}. ${show.name}: ${show.eligible_count} eligible people`)
  })
  
  console.log('\n🔗 Analyzing intersections between top shows...')
  
  // Check intersections between all pairs
  const intersections: any[] = []
  
  for (let i = 0; i < topShows.length; i++) {
    for (let j = i + 1; j < topShows.length; j++) {
      const show1 = topShows[i]
      const show2 = topShows[j]
      
      const { data: intersectionCount } = await supabaseAdmin
        .rpc('rg_show_intersection_count', {
          show_id_1: show1.id,
          show_id_2: show2.id
        })
      
      intersections.push({
        show1: show1.name,
        show2: show2.name,
        show1_id: show1.id,
        show2_id: show2.id,
        count: intersectionCount || 0
      })
    }
  }
  
  // Sort by intersection count
  intersections.sort((a, b) => b.count - a.count)
  
  console.log('\nTop intersections:')
  intersections.slice(0, 15).forEach((int, i) => {
    console.log(`${i + 1}. ${int.show1} ∩ ${int.show2}: ${int.count} people`)
  })
  
  // Find shows that work well with others
  const showConnections = new Map()
  intersections.forEach(int => {
    if (int.count > 0) {
      showConnections.set(int.show1_id, (showConnections.get(int.show1_id) || 0) + 1)
      showConnections.set(int.show2_id, (showConnections.get(int.show2_id) || 0) + 1)
    }
  })
  
  const bestConnected = topShows
    .map((show: any) => ({
      ...show,
      connections: showConnections.get(show.id) || 0
    }))
    .sort((a, b) => b.connections - a.connections)
  
  console.log('\nBest connected shows (most intersections with others):')
  bestConnected.slice(0, 8).forEach((show, i) => {
    console.log(`${i + 1}. ${show.name}: ${show.connections} connections`)
  })
  
  // Try to find a workable combination
  console.log('\n🎯 Looking for workable 3x3 combinations...')
  
  const goodShows = bestConnected.slice(0, 6)
  console.log('\nUsing these 6 well-connected shows:')
  goodShows.forEach((show, i) => {
    console.log(`${i + 1}. ${show.name} (${show.eligible_count} eligible, ${show.connections} connections)`)
  })
  
  // Test this combination
  const rowShows = goodShows.slice(0, 3)
  const colShows = goodShows.slice(3, 6)
  
  console.log('\n📊 Testing 3x3 grid with these shows:')
  console.log('Rows:', rowShows.map(s => s.name))
  console.log('Cols:', colShows.map(s => s.name))
  
  console.log('\nIntersection matrix:')
  let allValid = true
  
  for (let r = 0; r < 3; r++) {
    const rowCounts = []
    for (let c = 0; c < 3; c++) {
      const { data: count } = await supabaseAdmin
        .rpc('rg_show_intersection_count', {
          show_id_1: rowShows[r].id,
          show_id_2: colShows[c].id
        })
      
      rowCounts.push((count || 0).toString().padStart(2))
      if (count === 0) allValid = false
    }
    console.log(`Row ${r}: ${rowCounts.join(' ')}`)
  }
  
  console.log(`\n${allValid ? '✅' : '❌'} Grid is ${allValid ? 'VALID' : 'INVALID'} for puzzle generation`)
  
  return { topShows, intersections, bestConnected, gridValid: allValid }
}

// Run if executed directly
if (require.main === module) {
  analyzeIntersections()
    .then(result => {
      console.log('\n✅ Analysis complete!')
      if (result.gridValid) {
        console.log('🎉 Ready to generate puzzles!')
      } else {
        console.log('⚠️  Need to find better show combinations')
      }
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ Analysis failed:', error)
      process.exit(1)
    })
}

export { analyzeIntersections }