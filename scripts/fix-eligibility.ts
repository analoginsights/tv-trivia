import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function fixEligibility() {
  console.log('🔧 Fixing eligibility calculation...')
  
  try {
    // Manual eligibility calculation (safer than the RPC)
    console.log('1. Calculating show counts manually...')
    
    const { data: showCounts, error: countError } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, show_id')
    
    if (countError) throw countError
    
    // Group by person and count unique shows
    const personShowCounts = new Map<number, number>()
    showCounts?.forEach(appearance => {
      const current = personShowCounts.get(appearance.person_id) || 0
      personShowCounts.set(appearance.person_id, current + 1)
    })
    
    console.log(`Found show counts for ${personShowCounts.size} people`)
    
    // Update people table in batches
    console.log('2. Updating eligibility in database...')
    
    const updates = Array.from(personShowCounts.entries()).map(([personId, showCount]) => ({
      id: personId,
      show_count: showCount,
      is_valid: showCount >= 3
    }))
    
    console.log(`Updating ${updates.length} people...`)
    
    // Update in batches of 100
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100)
      const { error: updateError } = await supabaseAdmin
        .from('rg_people')
        .upsert(batch, { onConflict: 'id' })
      
      if (updateError) {
        console.error('Batch update error:', updateError)
        throw updateError
      }
      
      if (i % 500 === 0) {
        console.log(`  Updated ${Math.min(i + 100, updates.length)}/${updates.length}`)
      }
    }
    
    // Get final statistics
    const { data: stats } = await supabaseAdmin
      .from('rg_people')
      .select('is_valid')
    
    const eligible = stats?.filter(p => p.is_valid).length || 0
    const total = stats?.length || 0
    
    console.log(`\n✅ Eligibility calculation complete!`)
    console.log(`  Total people: ${total}`)
    console.log(`  Eligible people (≥3 shows): ${eligible}`)
    console.log(`  Eligibility rate: ${((eligible / total) * 100).toFixed(1)}%`)
    
    // Show distribution
    const distribution = new Map<number, number>()
    updates.forEach(person => {
      const count = distribution.get(person.show_count) || 0
      distribution.set(person.show_count, count + 1)
    })
    
    console.log(`\n📊 Show Count Distribution:`)
    for (let i = 1; i <= 10; i++) {
      const count = distribution.get(i) || 0
      if (count > 0) {
        console.log(`  ${i} show${i > 1 ? 's' : ''}: ${count} people${i >= 3 ? ' ✅' : ''}`)
      }
    }
    
    const moreThan10 = Array.from(distribution.entries())
      .filter(([shows, _]) => shows > 10)
      .reduce((sum, [_, people]) => sum + people, 0)
    
    if (moreThan10 > 0) {
      console.log(`  >10 shows: ${moreThan10} people ✅`)
    }
    
    return { eligible, total }
    
  } catch (error) {
    console.error('❌ Eligibility fix failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  fixEligibility()
    .then(({ eligible, total }) => {
      if (eligible > 500) {
        console.log('\n🎉 Excellent! We have plenty of eligible people for puzzles.')
      } else if (eligible > 100) {
        console.log('\n✅ Good! We have enough eligible people for basic puzzles.')
      } else {
        console.log('\n⚠️  We need more eligible people. Consider expanding the data.')
      }
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { fixEligibility }