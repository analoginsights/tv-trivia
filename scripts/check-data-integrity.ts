import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function checkDataIntegrity() {
  console.log('🔍 Checking data integrity...')
  
  try {
    // Check total counts
    console.log('1. Table counts:')
    const { data: shows, error: showsError } = await supabaseAdmin
      .from('rg_shows')
      .select('id', { count: 'exact' })
    if (showsError) throw showsError
    
    const { data: people, error: peopleError } = await supabaseAdmin
      .from('rg_people')
      .select('id', { count: 'exact' })
    if (peopleError) throw peopleError
    
    const { data: appearances, error: appearancesError } = await supabaseAdmin
      .from('rg_appearances')
      .select('show_id, person_id', { count: 'exact' })
    if (appearancesError) throw appearancesError
    
    console.log(`   Shows: ${shows?.length || 0}`)
    console.log(`   People: ${people?.length || 0}`)
    console.log(`   Appearances: ${appearances?.length || 0}`)
    
    // Check for orphaned records
    console.log('\n2. Checking for people without appearances:')
    const { data: peopleWithoutAppearances, error: orphanError } = await supabaseAdmin
      .from('rg_people')
      .select('id, name')
      .not('id', 'in', `(SELECT DISTINCT person_id FROM rg_appearances WHERE person_id IS NOT NULL)`)
      .limit(10)
    
    if (orphanError) {
      console.log('   Using alternative query...')
      // Get all people IDs from appearances
      const { data: appearancePersonIds } = await supabaseAdmin
        .from('rg_appearances')
        .select('person_id')
      
      const appearanceIds = new Set(appearancePersonIds?.map(a => a.person_id))
      
      const { data: allPeople } = await supabaseAdmin
        .from('rg_people')
        .select('id, name')
      
      const orphanedPeople = allPeople?.filter(p => !appearanceIds.has(p.id)) || []
      console.log(`   People without appearances: ${orphanedPeople.length}`)
      orphanedPeople.slice(0, 5).forEach(p => {
        console.log(`     ${p.id}: ${p.name}`)
      })
    } else {
      console.log(`   People without appearances: ${peopleWithoutAppearances?.length || 0}`)
      peopleWithoutAppearances?.slice(0, 5).forEach(p => {
        console.log(`     ${p.id}: ${p.name}`)
      })
    }
    
    // Check sample people with their current eligibility vs actual show count
    console.log('\n3. Sample people eligibility check:')
    const { data: samplePeople } = await supabaseAdmin
      .from('rg_people')
      .select('id, name, show_count, is_valid')
      .eq('is_valid', true)
      .limit(10)
    
    for (const person of samplePeople || []) {
      const { data: actualAppearances } = await supabaseAdmin
        .from('rg_appearances')
        .select('show_id')
        .eq('person_id', person.id)
      
      const actualShowCount = new Set(actualAppearances?.map(a => a.show_id)).size
      const storedCount = person.show_count || 0
      const isValid = person.is_valid
      
      console.log(`   ${person.name}: stored=${storedCount}, actual=${actualShowCount}, valid=${isValid}`)
      
      if (actualShowCount !== storedCount) {
        console.log(`     ⚠️ MISMATCH!`)
      }
    }
    
    return {
      shows: shows?.length || 0,
      people: people?.length || 0,
      appearances: appearances?.length || 0
    }
    
  } catch (error) {
    console.error('❌ Integrity check failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  checkDataIntegrity()
    .then(() => {
      console.log('\n✅ Data integrity check complete')
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { checkDataIntegrity }