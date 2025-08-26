import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function runDataQualityChecks() {
  console.log('Running data quality checks...\n')
  
  const results: any = {}
  
  // Check 1: Count eligible people
  const { data: eligibleCount } = await supabaseAdmin
    .from('rg_people')
    .select('id', { count: 'exact', head: true })
    .eq('is_valid', true)
  
  results.eligiblePeople = eligibleCount
  console.log(`✓ Eligible people count: ${eligibleCount}`)
  
  // Check 2: Count total shows
  const { data: showCount } = await supabaseAdmin
    .from('rg_shows')
    .select('id', { count: 'exact', head: true })
  
  results.totalShows = showCount
  console.log(`✓ Total shows: ${showCount}`)
  
  // Check 3: Count total appearances
  const { data: appearanceCount } = await supabaseAdmin
    .from('rg_appearances')
    .select('show_id', { count: 'exact', head: true })
  
  results.totalAppearances = appearanceCount
  console.log(`✓ Total appearances: ${appearanceCount}`)
  
  // Check 4: Shows with most eligible people
  const { data: topShows, error: topShowsError } = await supabaseAdmin
    .rpc('rg_shows_with_eligible_count')
    .limit(10)
  
  if (!topShowsError && topShows) {
    results.topShowsWithEligible = topShows
    console.log('\n✓ Top shows by eligible cast:')
    topShows.forEach((show: any) => {
      console.log(`  - ${show.name}: ${show.eligible_count} eligible people`)
    })
  }
  
  // Check 5: Sample intersection checks
  console.log('\n✓ Checking random show pair intersections...')
  const { data: sampleShows } = await supabaseAdmin
    .from('rg_shows')
    .select('id, name')
    .limit(10)
  
  if (sampleShows && sampleShows.length >= 2) {
    const intersections = []
    for (let i = 0; i < Math.min(5, sampleShows.length - 1); i++) {
      for (let j = i + 1; j < Math.min(6, sampleShows.length); j++) {
        const show1 = sampleShows[i]
        const show2 = sampleShows[j]
        
        const { data: intersection } = await supabaseAdmin
          .rpc('rg_show_intersection_count', {
            show_id_1: show1.id,
            show_id_2: show2.id
          })
        
        intersections.push({
          show1: show1.name,
          show2: show2.name,
          count: intersection
        })
        
        console.log(`  - "${show1.name}" ∩ "${show2.name}": ${intersection} people`)
      }
    }
    results.sampleIntersections = intersections
  }
  
  // Check 6: Feasibility check
  const canGeneratePuzzle = results.eligiblePeople > 200 && results.totalShows >= 6
  results.canGeneratePuzzle = canGeneratePuzzle
  
  console.log('\n=== Data Quality Summary ===')
  console.log(`Eligible People: ${results.eligiblePeople}`)
  console.log(`Total Shows: ${results.totalShows}`)
  console.log(`Total Appearances: ${results.totalAppearances}`)
  console.log(`Can Generate Puzzle: ${canGeneratePuzzle ? '✅ YES' : '❌ NO'}`)
  
  if (!canGeneratePuzzle) {
    console.log('\n⚠️  Need more data to generate puzzles!')
    console.log('  - Run ETL with more pages')
    console.log('  - Ensure eligibility derivation was run')
  }
  
  return results
}

// Run if executed directly
if (require.main === module) {
  runDataQualityChecks()
    .then(results => {
      console.log('\n✅ Data quality checks complete')
      process.exit(0)
    })
    .catch(error => {
      console.error('Data quality checks failed:', error)
      process.exit(1)
    })
}

export { runDataQualityChecks }