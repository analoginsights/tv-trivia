import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function testUpsert() {
  console.log('🧪 Testing Supabase upsert behavior...')
  
  try {
    // Clear existing data first
    console.log('1. Clearing existing appearances...')
    const { error: deleteError } = await supabaseAdmin
      .from('rg_appearances')
      .delete()
      .neq('show_id', -1) // Delete all
    
    if (deleteError) {
      console.error('Delete error:', deleteError)
    } else {
      console.log('   ✅ Cleared existing appearances')
    }
    
    // Test with small batch of fake data
    console.log('\n2. Testing small batch upsert...')
    const testData = [
      { show_id: 1, person_id: 101, episode_count: 5, guest_episode_count: 0, appearance_kind: 'main' },
      { show_id: 1, person_id: 102, episode_count: 3, guest_episode_count: 0, appearance_kind: 'main' },
      { show_id: 2, person_id: 101, episode_count: 2, guest_episode_count: 0, appearance_kind: 'main' },
      { show_id: 2, person_id: 103, episode_count: 0, guest_episode_count: 1, appearance_kind: 'guest' },
      { show_id: 3, person_id: 101, episode_count: 1, guest_episode_count: 2, appearance_kind: 'both' },
    ]
    
    const { error: upsertError } = await supabaseAdmin
      .from('rg_appearances')
      .upsert(testData, { onConflict: 'show_id,person_id' })
    
    if (upsertError) {
      console.error('Upsert error:', upsertError)
      throw upsertError
    }
    
    console.log('   ✅ Test upsert successful')
    
    // Verify the data
    console.log('\n3. Verifying upserted data...')
    const { data: verifyData } = await supabaseAdmin
      .from('rg_appearances')
      .select('*')
    
    console.log(`   Found ${verifyData?.length || 0} records:`)
    verifyData?.forEach((record, i) => {
      console.log(`   ${i + 1}. Show ${record.show_id}, Person ${record.person_id}: ${record.appearance_kind}`)
    })
    
    // Test person with multiple shows
    const personShowCounts = new Map()
    verifyData?.forEach(app => {
      if (!personShowCounts.has(app.person_id)) {
        personShowCounts.set(app.person_id, new Set())
      }
      personShowCounts.get(app.person_id).add(app.show_id)
    })
    
    console.log('\n4. Multi-show people:')
    personShowCounts.forEach((shows, personId) => {
      console.log(`   Person ${personId}: ${shows.size} shows`)
    })
    
    // Test larger batch (simulate more realistic data)
    console.log('\n5. Testing larger batch (100 records)...')
    const largerBatch = []
    for (let i = 1; i <= 20; i++) {
      for (let j = 1; j <= 5; j++) {
        largerBatch.push({
          show_id: i,
          person_id: j * 10,
          episode_count: Math.floor(Math.random() * 5) + 1,
          guest_episode_count: Math.floor(Math.random() * 3),
          appearance_kind: 'main'
        })
      }
    }
    
    console.log(`   Upserting ${largerBatch.length} records...`)
    const { error: largeBatchError } = await supabaseAdmin
      .from('rg_appearances')
      .upsert(largerBatch, { onConflict: 'show_id,person_id' })
    
    if (largeBatchError) {
      console.error('Large batch error:', largeBatchError)
      throw largeBatchError
    }
    
    const { data: finalData } = await supabaseAdmin
      .from('rg_appearances')
      .select('*', { count: 'exact' })
    
    console.log(`   ✅ Final count: ${finalData?.length || 0} records`)
    
    return { success: true, finalCount: finalData?.length || 0 }
    
  } catch (error) {
    console.error('❌ Upsert test failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  testUpsert()
    .then(({ finalCount }) => {
      if (finalCount > 90) {
        console.log('✅ Upsert test passed - Supabase is working correctly')
        console.log('   The issue must be in the ETL data collection/processing')
      } else {
        console.log('⚠️  Upsert test shows data persistence issues')
      }
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { testUpsert }