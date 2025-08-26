import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function fixEligibilitySafe() {
  console.log('🔧 Fixing eligibility calculation (safe mode)...')
  
  try {
    // Get show counts per person
    console.log('1. Calculating show counts...')
    
    const { data: appearances, error: appearError } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, show_id')
    
    if (appearError) throw appearError
    
    // Count unique shows per person
    const showCounts = new Map<number, Set<number>>()
    appearances?.forEach(({ person_id, show_id }) => {
      if (!showCounts.has(person_id)) {
        showCounts.set(person_id, new Set())
      }
      showCounts.get(person_id)!.add(show_id)
    })
    
    console.log(`Found ${showCounts.size} people with appearances`)
    
    // Update each person individually (safer)
    console.log('2. Updating people one by one...')
    
    let updated = 0
    let eligible = 0
    
    for (const [personId, shows] of showCounts) {
      const showCount = shows.size
      const isValid = showCount >= 3
      
      if (isValid) eligible++
      
      const { error } = await supabaseAdmin
        .from('rg_people')
        .update({ 
          show_count: showCount, 
          is_valid: isValid 
        })
        .eq('id', personId)
      
      if (error) {
        console.log(`⚠️  Failed to update person ${personId}: ${error.message}`)
      } else {
        updated++
      }
      
      if (updated % 100 === 0) {
        console.log(`  Updated ${updated}/${showCounts.size}`)
      }
    }
    
    console.log(`\n✅ Eligibility update complete!`)
    console.log(`  People updated: ${updated}/${showCounts.size}`)
    console.log(`  Eligible people (≥3 shows): ${eligible}`)
    console.log(`  Eligibility rate: ${((eligible / updated) * 100).toFixed(1)}%`)
    
    // Show distribution
    const distribution = new Map<number, number>()
    showCounts.forEach((shows, _) => {
      const count = shows.size
      distribution.set(count, (distribution.get(count) || 0) + 1)
    })
    
    console.log(`\n📊 Show Count Distribution:`)
    for (let i = 1; i <= Math.min(15, Math.max(...distribution.keys())); i++) {
      const peopleCount = distribution.get(i) || 0
      if (peopleCount > 0) {
        console.log(`  ${i} show${i > 1 ? 's' : ''}: ${peopleCount} people${i >= 3 ? ' ✅' : ''}`)
      }
    }
    
    const moreThan15 = Array.from(distribution.entries())
      .filter(([shows, _]) => shows > 15)
      .reduce((sum, [_, people]) => sum + people, 0)
    
    if (moreThan15 > 0) {
      console.log(`  >15 shows: ${moreThan15} people ✅`)
    }
    
    return { eligible, total: updated }
    
  } catch (error) {
    console.error('❌ Safe eligibility fix failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  fixEligibilitySafe()
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

export { fixEligibilitySafe }