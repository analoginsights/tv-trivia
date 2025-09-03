import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createTomorrowsDaily() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  
  // Use bethenny frankel (ID: 226372) 
  const personId = 226372
  
  console.log(`Creating daily puzzle for ${tomorrowStr} with person ID ${personId}`)
  
  const { data, error } = await supabase
    .from('gwb_daily')
    .insert({
      date_utc: tomorrowStr,
      person_id: personId
    })
    .select()
    
  if (error) {
    if (error.code === '23505') { // unique constraint violation
      console.log('Puzzle already exists for tomorrow, updating instead...')
      
      const { data: updateData, error: updateError } = await supabase
        .from('gwb_daily')
        .update({ person_id: personId })
        .eq('date_utc', tomorrowStr)
        .select()
        
      if (updateError) {
        console.error('Error updating:', updateError)
        return
      }
      
      console.log('✅ Updated tomorrow\'s puzzle:', updateData)
    } else {
      console.error('Error creating:', error)
      return
    }
  } else {
    console.log('✅ Created tomorrow\'s puzzle:', data)
  }
}

createTomorrowsDaily()