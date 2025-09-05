import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TMDB_API_KEY = process.env.TMDB_READ_TOKEN!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Extract TMDB person ID from existing image URL or use a mapping
function getTmdbPersonId(databaseId: number, name: string): number | null {
  // Create a mapping of our database IDs to known TMDB person IDs
  // You would populate this with actual TMDB person IDs for your people
  const idMapping: Record<number, number> = {
    1001: 1344818, // NeNe Leakes (example - you'd need to find actual TMDB ID)
    1002: 1344819, // Kandi Burruss (example)
    1003: 1344820, // Kenya Moore (example)
    1004: 1344821, // Porsha Williams (example)
    1022: 97783,   // Using your test person ID for Ramona Singer
    // Add more mappings as needed
  }
  
  return idMapping[databaseId] || null
}

export async function GET() {
  try {
    console.log('Testing TMDB person ID extraction and image fetching...')
    
    // Get current puzzle person
    const today = new Date().toISOString().split('T')[0]
    
    const { data: dailyData, error: dailyError } = await supabase
      .from('gwb_daily')
      .select(`
        person_id,
        gwb_people!inner (
          id,
          full_name,
          image_url
        )
      `)
      .eq('date_utc', today)
      .single()
    
    if (dailyError || !dailyData) {
      return NextResponse.json({ error: 'No daily puzzle found' }, { status: 404 })
    }
    
    // gwb_people might be an array, so handle it properly
    const person = Array.isArray(dailyData.gwb_people) 
      ? dailyData.gwb_people[0] 
      : dailyData.gwb_people
    
    if (!person) {
      return NextResponse.json({ error: 'Person data not found' }, { status: 404 })
    }
    
    const tmdbPersonId = getTmdbPersonId(person.id, person.full_name)
    
    console.log(`Person: ${person.full_name} (DB ID: ${person.id}) -> TMDB ID: ${tmdbPersonId}`)
    
    if (!tmdbPersonId) {
      return NextResponse.json({
        person: person.full_name,
        database_id: person.id,
        tmdb_id: null,
        error: 'No TMDB ID mapping found'
      })
    }
    
    // Fetch images from TMDB
    const tmdbResponse = await fetch(`https://api.themoviedb.org/3/person/${tmdbPersonId}/images`, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'accept': 'application/json'
      }
    })
    
    if (!tmdbResponse.ok) {
      return NextResponse.json({
        person: person.full_name,
        tmdb_id: tmdbPersonId,
        error: 'TMDB API failed',
        status: tmdbResponse.status
      }, { status: 502 })
    }
    
    const tmdbData = await tmdbResponse.json()
    const profiles = tmdbData.profiles || []
    
    if (profiles.length === 0) {
      return NextResponse.json({
        person: person.full_name,
        tmdb_id: tmdbPersonId,
        error: 'No profile images found'
      })
    }
    
    // Select the first available profile image
    const firstProfile = profiles[0]
    const imageUrl = `https://image.tmdb.org/t/p/w500${firstProfile.file_path}`
    
    console.log(`Selected image: ${imageUrl}`)
    
    // Test downloading the image
    const imgResponse = await fetch(imageUrl)
    const downloadSuccess = imgResponse.ok
    
    return NextResponse.json({
      person: person.full_name,
      database_id: person.id,
      tmdb_id: tmdbPersonId,
      total_profiles: profiles.length,
      selected_image: {
        file_path: firstProfile.file_path,
        full_url: imageUrl,
        width: firstProfile.width,
        height: firstProfile.height,
        aspect_ratio: firstProfile.aspect_ratio
      },
      download_test: {
        success: downloadSuccess,
        status: imgResponse.status,
        size: downloadSuccess ? imgResponse.headers.get('content-length') : null
      }
    })
    
  } catch (error) {
    console.error('Test failed:', error)
    return NextResponse.json({ error: 'Test failed', details: String(error) }, { status: 500 })
  }
}