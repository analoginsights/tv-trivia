import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function findAndSetDaily() {
  const tmdbId = 226372
  
  // First, find the person by TMDB ID
  const { data: person, error: personError } = await supabase
    .from('gwb_people')
    .select('id, full_name, id_tmdb')
    .eq('id_tmdb', tmdbId)
    .single()
    
  if (personError || !person) {
    console.error('Person with TMDB ID', tmdbId, 'not found:', personError?.message)
    
    // Show some available people
    const { data: sample } = await supabase
      .from('gwb_people')
      .select('id, full_name, id_tmdb')
      .limit(10)
      
    console.log('Available people (sample):')
    sample?.forEach(p => console.log(`- ID ${p.id}: ${p.full_name} (TMDB: ${p.id_tmdb})`))
    return
  }
  
  console.log(`Found person: ${person.full_name} (ID: ${person.id}, TMDB: ${person.id_tmdb})`)
  
  // Update today's daily puzzle
  const today = new Date().toISOString().split('T')[0]
  
  const { data, error } = await supabase
    .from('gwb_daily')
    .update({ person_id: person.id })
    .eq('date_utc', today)
    .select()
    
  if (error) {
    console.error('Error updating daily puzzle:', error)
    return
  }
  
  console.log('✅ Updated daily puzzle:', data)
}

findAndSetDaily()