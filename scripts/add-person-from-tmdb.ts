import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const tmdbToken = process.env.TMDB_READ_TOKEN!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function addPersonFromTMDB() {
  const tmdbId = 226372
  
  console.log(`Fetching person ${tmdbId} from TMDB...`)
  
  try {
    const response = await fetch(`https://api.themoviedb.org/3/person/${tmdbId}`, {
      headers: {
        'Authorization': `Bearer ${tmdbToken}`,
        'accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`)
    }
    
    const person = await response.json()
    
    console.log(`Found person: ${person.name}`)
    
    // Get images for this person
    const imagesResponse = await fetch(`https://api.themoviedb.org/3/person/${tmdbId}/images`, {
      headers: {
        'Authorization': `Bearer ${tmdbToken}`,
        'accept': 'application/json'
      }
    })
    
    const images = await imagesResponse.json()
    const profileImage = images.profiles?.[0]
    
    if (!profileImage) {
      console.error('No profile image found for this person')
      return
    }
    
    const imageUrl = `https://image.tmdb.org/t/media/${profileImage.file_path}`
    
    // Insert into gwb_people table
    const { data, error } = await supabase
      .from('gwb_people')
      .insert({
        id: tmdbId, // Use TMDB ID as the primary key
        id_tmdb: tmdbId,
        full_name: person.name,
        first_name: person.name.split(' ')[0],
        last_name: person.name.split(' ').slice(1).join(' '),
        image_url: imageUrl,
        is_active: true
      })
      .select()
      
    if (error) {
      console.error('Error inserting person:', error)
      return
    }
    
    console.log('✅ Added person to database:', data)
    
  } catch (error) {
    console.error('Error fetching from TMDB:', error)
  }
}

addPersonFromTMDB()