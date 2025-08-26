import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function investigateDatabase() {
  console.log('🔍 Investigating database state...')
  
  try {
    // Check raw counts in all tables
    console.log('1. Raw table counts:')
    
    const { data: shows, error: showsError } = await supabaseAdmin
      .from('rg_shows')
      .select('*', { count: 'exact' })
    if (showsError) throw showsError
    
    const { data: people, error: peopleError } = await supabaseAdmin
      .from('rg_people')
      .select('*', { count: 'exact' })
    if (peopleError) throw peopleError
    
    const { data: appearances, error: appearancesError } = await supabaseAdmin
      .from('rg_appearances')
      .select('*', { count: 'exact' })
    if (appearancesError) throw appearancesError
    
    console.log(`   Shows: ${shows?.length || 0}`)
    console.log(`   People: ${people?.length || 0}`)
    console.log(`   Appearances: ${appearances?.length || 0}`)
    
    // Check for any database constraints or limits
    console.log('\n2. Recent appearances (sample):')
    const { data: recentAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    recentAppearances?.forEach((app, i) => {
      console.log(`   ${i + 1}. Person ${app.person_id} -> Show ${app.show_id} (${app.appearance_kind})`)
    })
    
    // Check unique constraints
    console.log('\n3. Checking for unique show-person pairs:')
    const { data: uniquePairs } = await supabaseAdmin
      .rpc('count_unique_appearance_pairs')
      .single()
    
    if (uniquePairs) {
      console.log(`   Unique pairs: ${uniquePairs}`)
    } else {
      // Manual count
      const uniqueKeys = new Set()
      appearances?.forEach(app => {
        uniqueKeys.add(`${app.show_id}-${app.person_id}`)
      })
      console.log(`   Unique pairs (manual): ${uniqueKeys.size}`)
    }
    
    // Check for show distribution
    console.log('\n4. Shows with most appearances:')
    const showAppearanceCounts = new Map()
    appearances?.forEach(app => {
      const count = showAppearanceCounts.get(app.show_id) || 0
      showAppearanceCounts.set(app.show_id, count + 1)
    })
    
    const topShows = Array.from(showAppearanceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    
    for (const [showId, count] of topShows) {
      const show = shows?.find(s => s.id === showId)
      console.log(`   ${show?.name || 'Unknown'}: ${count} appearances`)
    }
    
    // Check if there are any errors in the database logs
    console.log('\n5. Checking for people with multiple show appearances:')
    const personShowCounts = new Map()
    appearances?.forEach(app => {
      if (!personShowCounts.has(app.person_id)) {
        personShowCounts.set(app.person_id, new Set())
      }
      personShowCounts.get(app.person_id).add(app.show_id)
    })
    
    let multiShowPeople = 0
    const distribution = new Map()
    
    personShowCounts.forEach((shows, personId) => {
      const count = shows.size
      distribution.set(count, (distribution.get(count) || 0) + 1)
      if (count >= 3) multiShowPeople++
    })
    
    console.log(`   People with ≥3 shows: ${multiShowPeople}`)
    console.log('   Distribution:')
    for (let i = 1; i <= Math.min(10, Math.max(...distribution.keys())); i++) {
      const count = distribution.get(i) || 0
      if (count > 0) {
        console.log(`     ${i} show${i > 1 ? 's' : ''}: ${count} people${i >= 3 ? ' ✅' : ''}`)
      }
    }
    
    return {
      shows: shows?.length || 0,
      people: people?.length || 0,
      appearances: appearances?.length || 0,
      eligible: multiShowPeople
    }
    
  } catch (error) {
    console.error('❌ Investigation failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  investigateDatabase()
    .then((stats) => {
      console.log(`\n📊 Investigation complete:`)
      console.log(`   ${stats.eligible}/${stats.people} people eligible for puzzles`)
      
      if (stats.appearances < 2000) {
        console.log('\n⚠️  Data appears truncated. ETL may have failed to persist all records.')
      }
      
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { investigateDatabase }