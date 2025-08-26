import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function deriveEligibility() {
  console.log('Deriving eligibility for people...')
  
  // Step 1: Calculate show counts and update eligibility
  const { data: countData, error: countError } = await supabaseAdmin
    .rpc('rg_derive_eligibility')
  
  if (countError) {
    console.error('Error deriving eligibility:', countError)
    throw countError
  }
  
  console.log('Eligibility derived successfully')
  
  // Step 2: Get statistics
  const { data: stats, error: statsError } = await supabaseAdmin
    .from('rg_people')
    .select('is_valid')
  
  if (statsError) {
    console.error('Error fetching stats:', statsError)
    throw statsError
  }
  
  const eligible = stats.filter(p => p.is_valid).length
  const total = stats.length
  
  console.log(`\n=== Eligibility Statistics ===`)
  console.log(`Total people: ${total}`)
  console.log(`Eligible people (≥3 shows): ${eligible}`)
  console.log(`Eligibility rate: ${((eligible / total) * 100).toFixed(2)}%`)
  
  return { eligible, total }
}

// Run if executed directly
if (require.main === module) {
  deriveEligibility()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Failed to derive eligibility:', error)
      process.exit(1)
    })
}

export { deriveEligibility }