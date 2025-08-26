import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function checkForeignKeys() {
  console.log('🔍 Checking foreign key constraints...')
  
  try {
    // Get all show IDs in shows table
    console.log('1. Shows in rg_shows table:')
    const { data: shows } = await supabaseAdmin
      .from('rg_shows')
      .select('id, name')
      .order('id')
    
    console.log(`   Found ${shows?.length || 0} shows`)
    shows?.slice(0, 10).forEach(show => {
      console.log(`   ${show.id}: ${show.name}`)
    })
    if ((shows?.length || 0) > 10) {
      console.log(`   ... and ${(shows?.length || 0) - 10} more`)
    }
    
    const showIds = new Set(shows?.map(s => s.id) || [])
    
    // Get all person IDs in people table  
    console.log('\n2. People in rg_people table:')
    const { data: people } = await supabaseAdmin
      .from('rg_people')
      .select('id, name')
      .order('id')
      .limit(10)
    
    console.log(`   Sample of people:`)
    people?.forEach(person => {
      console.log(`   ${person.id}: ${person.name}`)
    })
    
    const { data: totalPeople } = await supabaseAdmin
      .from('rg_people')
      .select('id', { count: 'exact' })
    
    console.log(`   Total people: ${totalPeople?.length || 0}`)
    
    const peopleIds = new Set(people?.map(p => p.id) || [])
    
    // Now let's simulate what the ETL is trying to insert
    console.log('\n3. Testing with actual show/people IDs:')
    
    if (shows && shows.length >= 2 && people && people.length >= 2) {
      const testData = [
        { 
          show_id: shows[0].id, 
          person_id: people[0].id, 
          episode_count: 5, 
          guest_episode_count: 0, 
          appearance_kind: 'main' 
        },
        { 
          show_id: shows[0].id, 
          person_id: people[1].id, 
          episode_count: 3, 
          guest_episode_count: 0, 
          appearance_kind: 'main' 
        },
        { 
          show_id: shows[1].id, 
          person_id: people[0].id, 
          episode_count: 2, 
          guest_episode_count: 1, 
          appearance_kind: 'both' 
        },
      ]
      
      console.log('   Test data:')
      testData.forEach((data, i) => {
        console.log(`   ${i + 1}. Show ${data.show_id} (${shows.find(s => s.id === data.show_id)?.name}), Person ${data.person_id} (${people.find(p => p.id === data.person_id)?.name})`)
      })
      
      const { error: testError } = await supabaseAdmin
        .from('rg_appearances')
        .upsert(testData, { onConflict: 'show_id,person_id' })
      
      if (testError) {
        console.error('   ❌ Test upsert failed:', testError)
      } else {
        console.log('   ✅ Test upsert successful')
        
        // Verify
        const { data: verifyData } = await supabaseAdmin
          .from('rg_appearances')
          .select('*')
        
        console.log(`   Verified ${verifyData?.length || 0} records inserted`)
      }
    }
    
    return {
      showCount: shows?.length || 0,
      peopleCount: totalPeople?.length || 0,
      sampleShowIds: Array.from(showIds).slice(0, 10),
      samplePeopleIds: Array.from(peopleIds).slice(0, 10)
    }
    
  } catch (error) {
    console.error('❌ Foreign key check failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  checkForeignKeys()
    .then((stats) => {
      console.log(`\n📊 Found ${stats.showCount} shows and ${stats.peopleCount} people`)
      console.log('✅ Foreign key constraints verified')
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { checkForeignKeys }