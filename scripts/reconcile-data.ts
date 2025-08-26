import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function reconcileData() {
  console.log('🔄 Reconciling enhanced ETL data...')
  
  try {
    // Check current state
    console.log('1. Current state:')
    const { data: allPeople } = await supabaseAdmin
      .from('rg_people')
      .select('id', { count: 'exact' })
    
    const { data: allAppearances } = await supabaseAdmin
      .from('rg_appearances')  
      .select('person_id, show_id', { count: 'exact' })
    
    console.log(`   People: ${allPeople?.length || 0}`)
    console.log(`   Appearances: ${allAppearances?.length || 0}`)
    
    // The appearances table should have ~4072 records from the enhanced ETL
    // Let's check if we lost data
    console.log('\n2. Checking appearance data integrity:')
    
    const { data: fullAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, show_id, episode_count, guest_episode_count, appearance_kind')
    
    console.log(`   Total appearances: ${fullAppearances?.length || 0}`)
    
    const mainAppearances = fullAppearances?.filter(a => a.appearance_kind === 'main') || []
    const guestAppearances = fullAppearances?.filter(a => a.appearance_kind === 'guest') || []
    const bothAppearances = fullAppearances?.filter(a => a.appearance_kind === 'both') || []
    
    console.log(`   Main cast: ${mainAppearances.length}`)
    console.log(`   Guest stars: ${guestAppearances.length}`)
    console.log(`   Both: ${bothAppearances.length}`)
    
    // Calculate actual eligibility from current data
    console.log('\n3. Recalculating eligibility from current data:')
    
    // Count unique shows per person from actual appearance data
    const showCounts = new Map<number, Set<number>>()
    fullAppearances?.forEach(({ person_id, show_id }) => {
      if (!showCounts.has(person_id)) {
        showCounts.set(person_id, new Set())
      }
      showCounts.get(person_id)!.add(show_id)
    })
    
    console.log(`   People with appearances: ${showCounts.size}`)
    
    let eligible = 0
    const distribution = new Map<number, number>()
    
    showCounts.forEach((shows, _) => {
      const count = shows.size
      distribution.set(count, (distribution.get(count) || 0) + 1)
      if (count >= 3) eligible++
    })
    
    console.log(`   Actually eligible (≥3 shows): ${eligible}`)
    
    console.log('\n   Show count distribution:')
    for (let i = 1; i <= Math.min(10, Math.max(...distribution.keys())); i++) {
      const count = distribution.get(i) || 0
      if (count > 0) {
        console.log(`     ${i} show${i > 1 ? 's' : ''}: ${count} people${i >= 3 ? ' ✅' : ''}`)
      }
    }
    
    // Check if we need to re-run the enhanced ETL
    if (fullAppearances?.length && fullAppearances.length < 3000) {
      console.log('\n⚠️  It looks like the enhanced ETL data may not have been fully loaded.')
      console.log('   Expected ~4000+ appearances but only found', fullAppearances.length)
      console.log('   Consider re-running: npm run etl:bravo:optimized')
    }
    
    return {
      totalPeople: allPeople?.length || 0,
      totalAppearances: fullAppearances?.length || 0,
      peopleWithAppearances: showCounts.size,
      eligiblePeople: eligible,
      distribution: Object.fromEntries(distribution)
    }
    
  } catch (error) {
    console.error('❌ Reconciliation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  reconcileData()
    .then((stats) => {
      console.log('\n📊 Reconciliation complete:')
      console.log(`   ${stats.eligiblePeople}/${stats.peopleWithAppearances} people are eligible`)
      
      if (stats.eligiblePeople > 100) {
        console.log('✅ Good! We have enough eligible people for puzzles.')
      } else {
        console.log('⚠️  Need more eligible people. Consider re-running enhanced ETL.')
      }
      
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { reconcileData }