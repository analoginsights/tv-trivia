import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function analyzeEnhancedData() {
  console.log('🔍 Analyzing Enhanced Reality Grid Data\n')
  
  // Check if new columns exist
  console.log('=== Schema Check ===')
  const { data: sampleAppearance } = await supabaseAdmin
    .from('rg_appearances')
    .select('*')
    .limit(1)
    .single()
  
  if (sampleAppearance?.appearance_kind !== undefined) {
    console.log('✅ New columns detected (appearance_kind, episode_count, guest_episode_count)')
  } else {
    console.log('❌ Schema not updated. Run update-appearances-schema.sql first!')
    return
  }
  
  // Get overall statistics
  console.log('\n=== Overall Statistics ===')
  const { data: showCount } = await supabaseAdmin
    .from('rg_shows')
    .select('id', { count: 'exact', head: true })
  
  const { data: peopleCount } = await supabaseAdmin
    .from('rg_people')
    .select('id', { count: 'exact', head: true })
  
  const { data: appearanceCount } = await supabaseAdmin
    .from('rg_appearances')
    .select('show_id', { count: 'exact', head: true })
  
  console.log(`Shows: ${showCount}`)
  console.log(`People: ${peopleCount}`)
  console.log(`Appearances: ${appearanceCount}`)
  
  // Eligibility stats
  const { data: eligiblePeople } = await supabaseAdmin
    .from('rg_people')
    .select('id', { count: 'exact', head: true })
    .eq('is_valid', true)
  
  console.log(`Eligible people (≥3 shows): ${eligiblePeople} (${((Number(eligiblePeople) / Number(peopleCount)) * 100).toFixed(1)}%)`)
  
  // Appearance kind breakdown
  console.log('\n=== Appearance Type Breakdown ===')
  const { data: appearances } = await supabaseAdmin
    .from('rg_appearances')
    .select('appearance_kind')
  
  const breakdown = {
    main: 0,
    guest: 0,
    both: 0,
    null: 0
  }
  
  appearances?.forEach(a => {
    if (a.appearance_kind === 'main') breakdown.main++
    else if (a.appearance_kind === 'guest') breakdown.guest++
    else if (a.appearance_kind === 'both') breakdown.both++
    else breakdown.null++
  })
  
  console.log(`Main cast only: ${breakdown.main} (${((breakdown.main / appearanceCount!) * 100).toFixed(1)}%)`)
  console.log(`Guest stars only: ${breakdown.guest} (${((breakdown.guest / appearanceCount!) * 100).toFixed(1)}%)`)
  console.log(`Both main & guest: ${breakdown.both} (${((breakdown.both / appearanceCount!) * 100).toFixed(1)}%)`)
  if (breakdown.null > 0) {
    console.log(`⚠️  Unclassified: ${breakdown.null}`)
  }
  
  // Top shows with guest stars
  console.log('\n=== Top Shows by Guest Star Count ===')
  const { data: topGuestShows } = await supabaseAdmin
    .from('rg_appearances')
    .select('show_id, rg_shows!inner(name)')
    .in('appearance_kind', ['guest', 'both'])
    .limit(10)
  
  const guestShowCounts = new Map()
  topGuestShows?.forEach(a => {
    const name = (a as any).rg_shows?.name
    if (name) {
      guestShowCounts.set(name, (guestShowCounts.get(name) || 0) + 1)
    }
  })
  
  const sortedGuestShows = Array.from(guestShowCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  
  sortedGuestShows.forEach(([name, count], i) => {
    console.log(`${i + 1}. ${name}: ${count} guest appearances`)
  })
  
  // Check if we have better show connectivity now
  console.log('\n=== Show Connectivity Analysis ===')
  const { data: showsWithEligible } = await supabaseAdmin.rpc('rg_shows_with_eligible_count')
  
  const wellConnected = showsWithEligible?.filter((s: any) => s.eligible_count >= 10) || []
  console.log(`Shows with ≥10 eligible people: ${wellConnected.length}`)
  
  // Sample intersection improvements
  console.log('\n=== Sample Intersection Test ===')
  if (showsWithEligible && showsWithEligible.length >= 6) {
    const testShows = showsWithEligible.slice(0, 6)
    console.log('Testing top 6 shows for intersections:')
    
    let validPairs = 0
    let totalPairs = 0
    
    for (let i = 0; i < 3; i++) {
      for (let j = 3; j < 6; j++) {
        const { data: count } = await supabaseAdmin
          .rpc('rg_show_intersection_count', {
            show_id_1: testShows[i].id,
            show_id_2: testShows[j].id
          })
        
        totalPairs++
        if (count && count > 0) {
          validPairs++
        }
        
        console.log(`  ${testShows[i].name.substring(0, 20)} ∩ ${testShows[j].name.substring(0, 20)}: ${count || 0}`)
      }
    }
    
    console.log(`\n✅ Valid pairs: ${validPairs}/${totalPairs} (${((validPairs/totalPairs) * 100).toFixed(0)}%)`)
  }
  
  // People who appear as both main and guest
  console.log('\n=== Notable Cross-appearances ===')
  const { data: bothAppearances } = await supabaseAdmin
    .from('rg_appearances')
    .select('person_id, rg_people!inner(name)')
    .eq('appearance_kind', 'both')
    .limit(5)
  
  if (bothAppearances && bothAppearances.length > 0) {
    console.log('People who appear as both main cast and guest:')
    bothAppearances.forEach((a: any, i) => {
      console.log(`${i + 1}. ${a.rg_people?.name}`)
    })
  } else {
    console.log('No people found who appear as both main and guest yet.')
  }
  
  return {
    showCount,
    peopleCount,
    appearanceCount,
    eligiblePeople,
    breakdown,
    wellConnectedShows: wellConnected.length
  }
}

// Run if executed directly
if (require.main === module) {
  analyzeEnhancedData()
    .then(stats => {
      console.log('\n✅ Analysis complete!')
      if (stats?.eligiblePeople && stats.eligiblePeople > 500) {
        console.log('🎉 Great! We have plenty of eligible people for puzzles.')
      }
      process.exit(0)
    })
    .catch(error => {
      console.error('Analysis failed:', error)
      process.exit(1)
    })
}

export { analyzeEnhancedData }