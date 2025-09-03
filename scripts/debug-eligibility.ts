import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function debugEligibility() {
  console.log('🔍 Debugging eligibility calculation...')
  
  try {
    // Check appearances data
    console.log('1. Sample appearances data:')
    const { data: sampleAppearances, error: sampleError } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, show_id')
      .limit(10)
    
    if (sampleError) throw sampleError
    
    sampleAppearances?.forEach((app, i) => {
      console.log(`  ${i + 1}. Person ${app.person_id} in Show ${app.show_id}`)
    })
    
    // Check for specific person's appearances across shows
    console.log('\n2. Checking multi-show appearances:')
    const { data: multiShowPeople, error: multiError } = await supabaseAdmin
      .rpc('rg_get_multi_show_people', {}, { count: 'exact' })
    
    if (multiError) {
      console.log('   ⚠️ RPC not available, doing manual check...')
      
      // Manual check for people with multiple show appearances (use .range to get all data)
      const { data: appearances, error: appearError } = await supabaseAdmin
        .from('rg_appearances')
        .select('person_id, show_id')
        .range(0, 9999) // Handle more than 1000 rows
      
      if (appearError) throw appearError
      
      // Count shows per person
      const showCounts = new Map<number, Set<number>>()
      appearances?.forEach(({ person_id, show_id }) => {
        if (!showCounts.has(person_id)) {
          showCounts.set(person_id, new Set())
        }
        showCounts.get(person_id)!.add(show_id)
      })
      
      console.log(`   Total people: ${showCounts.size}`)
      
      // Find people with multiple shows
      let multiShowCount = 0
      const distribution = new Map<number, number>()
      
      showCounts.forEach((shows, personId) => {
        const showCount = shows.size
        distribution.set(showCount, (distribution.get(showCount) || 0) + 1)
        
        if (showCount >= 3) {
          multiShowCount++
          if (multiShowCount <= 5) {
            console.log(`   Person ${personId}: ${showCount} shows`)
          }
        }
      })
      
      console.log(`\n3. Distribution:`)
      for (let i = 1; i <= 10; i++) {
        const count = distribution.get(i) || 0
        if (count > 0) {
          console.log(`   ${i} show${i > 1 ? 's' : ''}: ${count} people${i >= 3 ? ' ✅' : ''}`)
        }
      }
      
      console.log(`\n   Multi-show people (≥3): ${multiShowCount}`)
      
    } else {
      console.log(`   Found ${multiShowPeople?.length} multi-show people`)
    }
    
    // Check current people eligibility state
    console.log('\n4. Current eligibility state:')
    const { data: eligibleCount } = await supabaseAdmin
      .from('rg_people')
      .select('is_valid', { count: 'exact' })
      .eq('is_valid', true)
    
    const { data: totalCount } = await supabaseAdmin
      .from('rg_people')
      .select('id', { count: 'exact' })
    
    console.log(`   Currently eligible: ${eligibleCount?.length || 0}`)
    console.log(`   Total people: ${totalCount?.length || 0}`)
    
    return { eligible: eligibleCount?.length || 0, total: totalCount?.length || 0 }
    
  } catch (error) {
    console.error('❌ Debug failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  debugEligibility()
    .then(({ eligible, total }) => {
      console.log(`\n📊 Debug complete: ${eligible}/${total} eligible`)
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { debugEligibility }