import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables:')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'SET' : 'MISSING')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function updateDailyPuzzle() {
  const today = new Date().toISOString().split('T')[0]
  const personId = parseInt(process.argv[2])
  
  if (!personId) {
    console.error('Please provide a person ID as argument')
    process.exit(1)
  }
  
  console.log(`Updating daily puzzle for ${today} to person ID ${personId}`)
  
  const { data, error } = await supabase
    .from('gwb_daily')
    .update({ person_id: personId })
    .eq('date_utc', today)
    .select()
    
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log('✅ Updated daily puzzle:', data)
}

updateDailyPuzzle()