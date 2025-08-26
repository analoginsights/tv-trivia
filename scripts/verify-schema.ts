import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function verifySchema() {
  console.log('🔍 Verifying Reality Grid schema...\n')
  
  // T1: Verify schema exists
  console.log('=== T1: Schema Verification ===')
  
  const tablesToCheck = [
    'rg_shows',
    'rg_people', 
    'rg_appearances',
    'rg_daily_puzzles',
    'rg_daily_cells'
  ]
  
  for (const table of tablesToCheck) {
    try {
      const { data, error, count } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true })
      
      if (error) {
        console.log(`❌ ${table}: ${error.message}`)
        return false
      } else {
        console.log(`✅ ${table}: exists (${count} rows)`)
      }
    } catch (err) {
      console.log(`❌ ${table}: ${err}`)
      return false
    }
  }
  
  // Check functions exist
  console.log('\n=== Functions Check ===')
  const functionsToCheck = [
    'rg_derive_eligibility',
    'rg_shows_with_eligible_count',
    'rg_show_intersection_count'
  ]
  
  for (const func of functionsToCheck) {
    try {
      const { data, error } = await supabaseAdmin.rpc(func)
      if (error && !error.message.includes('parameter')) {
        console.log(`❌ ${func}: ${error.message}`)
      } else {
        console.log(`✅ ${func}: exists`)
      }
    } catch (err) {
      console.log(`❌ ${func}: function not found`)
    }
  }
  
  // Check view exists
  console.log('\n=== Views Check ===')
  try {
    const { data, error } = await supabaseAdmin
      .from('rg_eligible_appearances')
      .select('*', { count: 'exact', head: true })
    
    if (error) {
      console.log(`❌ rg_eligible_appearances: ${error.message}`)
    } else {
      console.log(`✅ rg_eligible_appearances: exists`)
    }
  } catch (err) {
    console.log(`❌ rg_eligible_appearances: view not found`)
  }
  
  console.log('\n✅ Schema verification complete!')
  return true
}

// Run if executed directly
if (require.main === module) {
  verifySchema()
    .then(success => {
      if (success) {
        console.log('\n🎉 Schema verification passed!')
        process.exit(0)
      } else {
        console.log('\n⚠️  Schema verification failed. Please run the SQL schema first.')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('Schema verification error:', error)
      process.exit(1)
    })
}

export { verifySchema }