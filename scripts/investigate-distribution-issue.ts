import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function investigateDistributionIssue() {
  console.log('🔍 Investigating appearance distribution issue...\n')
  
  try {
    // Step 1: Check actual data in database
    console.log('1. Checking current database state:')
    
    const { data: shows } = await supabaseAdmin
      .from('rg_shows')
      .select('id, name')
      .range(0, 10)
      
    const { data: appearances } = await supabaseAdmin
      .from('rg_appearances')  
      .select('show_id, person_id')
      .range(0, 20) // Sample first 20 appearances
      
    console.log(`   Total shows in database: ${shows?.length || 0}`)
    console.log(`   Sample shows:`)
    shows?.forEach(show => {
      console.log(`     ${show.id}: ${show.name}`)
    })
    
    console.log(`\n   Sample appearances:`)
    const showCounts = new Map()
    appearances?.forEach(app => {
      showCounts.set(app.show_id, (showCounts.get(app.show_id) || 0) + 1)
      console.log(`     Person ${app.person_id} -> Show ${app.show_id}`)
    })
    
    console.log(`\n   Show distribution in sample:`)
    for (const [showId, count] of showCounts.entries()) {
      const show = shows?.find(s => s.id === showId)
      console.log(`     Show ${showId} (${show?.name || 'Unknown'}): ${count} appearances`)
    }
    
    // Step 2: Check all unique show IDs in appearances
    console.log('\n2. Checking unique show IDs in all appearances:')
    
    const { data: allAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('show_id')
      .range(0, 9999) // Get all appearances with proper limit
      
    const allShowCounts = new Map()
    allAppearances?.forEach(app => {
      allShowCounts.set(app.show_id, (allShowCounts.get(app.show_id) || 0) + 1)
    })
    
    console.log(`   Total appearances checked: ${allAppearances?.length || 0}`)
    console.log(`   Unique shows with appearances: ${allShowCounts.size}`)
    console.log(`   Distribution:`)
    
    const sorted = Array.from(allShowCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      
    for (const [showId, count] of sorted) {
      const show = shows?.find(s => s.id === showId)
      console.log(`     Show ${showId} (${show?.name || 'Unknown'}): ${count} appearances`)
    }
    
    // Step 3: Check if people appear in multiple shows
    console.log('\n3. Checking cross-show appearances:')
    
    const { data: peopleAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, show_id')
      .range(0, 9999)
      
    const personShowMap = new Map()
    peopleAppearances?.forEach(app => {
      if (!personShowMap.has(app.person_id)) {
        personShowMap.set(app.person_id, new Set())
      }
      personShowMap.get(app.person_id).add(app.show_id)
    })
    
    let multiShowPeople = 0
    let maxShows = 0
    let sampleMultiShow = null
    
    for (const [personId, showSet] of personShowMap.entries()) {
      if (showSet.size > 1) {
        multiShowPeople++
        if (showSet.size > maxShows) {
          maxShows = showSet.size
          sampleMultiShow = { personId, shows: Array.from(showSet) }
        }
      }
    }
    
    console.log(`   People appearing in multiple shows: ${multiShowPeople}`)
    console.log(`   Maximum shows per person: ${maxShows}`)
    if (sampleMultiShow) {
      console.log(`   Sample multi-show person: ${sampleMultiShow.personId} appears in shows: ${sampleMultiShow.shows.join(', ')}`)
    }
    
    // Step 4: Identify the issue
    console.log('\n4. Issue Analysis:')
    
    if (allShowCounts.size === 1) {
      console.log('   🚨 CRITICAL: All appearances assigned to single show')
      console.log('   🔍 Root cause: ETL logic is not correctly distributing appearances')
      console.log('   🎯 Action needed: Fix appearance assignment in ETL process')
    } else if (allShowCounts.size < 10) {
      console.log(`   ⚠️  WARNING: Appearances concentrated in only ${allShowCounts.size} shows`)
      console.log('   🔍 Possible cause: ETL processing or upsert logic issue') 
    } else {
      console.log(`   ✅ GOOD: Appearances distributed across ${allShowCounts.size} shows`)
    }
    
    if (multiShowPeople === 0) {
      console.log('   🚨 CRITICAL: No cross-show appearances found')
      console.log('   🎯 Puzzle generation impossible without intersections')
    } else {
      console.log(`   ✅ GOOD: ${multiShowPeople} people appear in multiple shows`)
    }
    
    return {
      totalShows: shows?.length || 0,
      totalAppearances: allAppearances?.length || 0,
      uniqueShowsWithAppearances: allShowCounts.size,
      multiShowPeople,
      maxShowsPerPerson: maxShows,
      topShowId: sorted[0]?.[0],
      topShowCount: sorted[0]?.[1]
    }
    
  } catch (error) {
    console.error('❌ Investigation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  investigateDistributionIssue()
    .then(results => {
      console.log('\n📊 Investigation Summary:')
      console.log(`   Shows in DB: ${results.totalShows}`)
      console.log(`   Total appearances: ${results.totalAppearances}`)
      console.log(`   Shows with appearances: ${results.uniqueShowsWithAppearances}`)
      console.log(`   Multi-show people: ${results.multiShowPeople}`)
      console.log(`   Max shows per person: ${results.maxShowsPerPerson}`)
      
      if (results.uniqueShowsWithAppearances === 1) {
        console.log('\n🎯 Next steps: Analyze and fix ETL appearance assignment logic')
      }
      
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { investigateDistributionIssue }