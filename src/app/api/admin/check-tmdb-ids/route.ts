import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TMDB_API_KEY = process.env.TMDB_READ_TOKEN!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Checking TMDB IDs in gwb_people...')
    
    // Check what columns exist and get sample data
    const { data: people, error } = await supabase
      .from('gwb_people')
      .select('*')
      .limit(3)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log('Sample person data:', people[0])
    
    // Test TMDB images API with a known person ID
    const testPersonId = 97783 // From your example
    const tmdbResponse = await fetch(`https://api.themoviedb.org/3/person/${testPersonId}/images`, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'accept': 'application/json'
      }
    })
    
    let tmdbData = null
    if (tmdbResponse.ok) {
      tmdbData = await tmdbResponse.json()
      console.log('TMDB images API response:', tmdbData)
    }
    
    return NextResponse.json({
      database_columns: Object.keys(people[0] || {}),
      sample_people: people.map(p => ({ id: p.id, name: p.full_name, image_url: p.image_url })),
      tmdb_api_test: {
        status: tmdbResponse.status,
        person_id: testPersonId,
        profile_count: tmdbData?.profiles?.length || 0,
        first_profile: tmdbData?.profiles?.[0] || null
      }
    })
    
  } catch (error) {
    console.error('Check failed:', error)
    return NextResponse.json({ error: 'Check failed', details: String(error) }, { status: 500 })
  }
}