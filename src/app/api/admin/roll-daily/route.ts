import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p'
const TMDB_API_KEY = process.env.TMDB_READ_TOKEN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = process.env.PUBLIC_STORAGE_BUCKET || 'gwb'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Map our database person IDs to TMDB person IDs
function getTmdbPersonId(databaseId: number): number | null {
  const idMapping: Record<number, number> = {
    1001: 1223167, // NeNe Leakes - you'd get actual TMDB IDs
    1002: 1344819, // Kandi Burruss 
    1003: 1344820, // Kenya Moore
    1004: 1344821, // Porsha Williams
    1011: 1344822, // Kyle Richards
    1012: 1344823, // Lisa Vanderpump
    1013: 1344824, // Erika Jayne
    1014: 1344825, // Garcelle Beauvais
    1015: 1344826, // Dorit Kemsley
    1021: 1344827, // Bethenny Frankel
    1022: 97783,   // Ramona Singer - known working ID
    // Add more mappings as you populate with real TMDB person IDs
  }
  
  return idMapping[databaseId] || null
}

async function tmdb(path: string, params: Record<string, any> = {}) {
  const url = new URL(`${TMDB_BASE}${path}`)
  url.searchParams.set('api_key', TMDB_API_KEY)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  
  const response = await fetch(url, { 
    headers: {
      'Authorization': `Bearer ${TMDB_API_KEY}`,
      'Accept': 'application/json'
    }
  })
  
  if (!response.ok) throw new Error(`TMDB ${path} ${response.status}`)
  return response.json()
}

async function getBravoShowIds(pages = [1, 2, 3]) {
  const ids: number[] = []
  
  for (const page of pages) {
    try {
      const data = await tmdb('/discover/tv', { 
        with_networks: 74, 
        page,
        sort_by: 'popularity.desc'
      })
      
      for (const show of data.results) {
        if (show.id !== 22980) { // Exclude series 22980
          ids.push(show.id)
        }
      }
    } catch (error) {
      console.error(`Failed to fetch page ${page}:`, error)
    }
  }
  
  return [...new Set(ids)]
}

async function getCastForShow(tvId: number) {
  try {
    const data = await tmdb(`/tv/${tvId}/aggregate_credits`)
    return (data.cast || []).map((c: any) => c.id).filter(Boolean)
  } catch {
    try {
      const data = await tmdb(`/tv/${tvId}/credits`)
      return (data.cast || []).map((c: any) => c.id).filter(Boolean)
    } catch {
      return []
    }
  }
}

function choice<T>(arr: T[]): T { 
  return arr[Math.floor(Math.random() * arr.length)] 
}

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    
    console.log('Creating daily puzzle from existing gwb_people...')
    
    // 1) Get a random active person from gwb_people
    const { data: people, error: peopleError } = await supabase
      .from('gwb_people')
      .select('id, full_name, image_url')
      .eq('is_active', true)
    
    if (peopleError || !people?.length) {
      console.error('Failed to fetch people:', peopleError)
      return new NextResponse('No people found in gwb_people', { status: 204 })
    }
    
    console.log(`Found ${people.length} active people in gwb_people`)
    
    // 2) Pick a random person
    const person = choice(people)
    console.log(`Selected person: ${person.full_name} (ID: ${person.id})`)
    
    // 3) Fetch real TMDB profile image and store in S3 bucket
    const tmdbPersonId = getTmdbPersonId(person.id)
    let imageUrl: string
    let imageSource: string
    
    if (!tmdbPersonId) {
      console.log(`No TMDB mapping for ${person.full_name} (ID: ${person.id}), using placeholder`)
      imageUrl = `https://picsum.photos/400/400?random=${person.id}`
      imageSource = 'placeholder'
    } else {
      console.log(`Fetching TMDB images for ${person.full_name} (TMDB ID: ${tmdbPersonId})`)
      
      try {
        // Fetch profile images from TMDB
        const tmdbImagesResponse = await fetch(`${TMDB_BASE}/person/${tmdbPersonId}/images`, {
          headers: {
            'Authorization': `Bearer ${TMDB_API_KEY}`,
            'Accept': 'application/json'
          }
        })
        
        if (!tmdbImagesResponse.ok) {
          throw new Error(`TMDB API failed: ${tmdbImagesResponse.status}`)
        }
        
        const imagesData = await tmdbImagesResponse.json()
        const profiles = imagesData.profiles || []
        
        if (profiles.length === 0) {
          throw new Error('No profile images found')
        }
        
        // Select the first available profile image
        const selectedProfile = profiles[0]
        imageUrl = `${IMAGE_BASE}/w500${selectedProfile.file_path}`
        imageSource = 'tmdb'
        
        console.log(`Selected TMDB image: ${imageUrl}`)
        console.log(`Image size: ${selectedProfile.width}x${selectedProfile.height}`)
        
      } catch (error) {
        console.log(`TMDB fetch failed for ${person.full_name}: ${error}`)
        console.log('Falling back to placeholder')
        imageUrl = `https://picsum.photos/400/400?random=${person.id}`
        imageSource = 'placeholder'
      }
    }
    
    console.log(`Downloading ${imageSource} image from: ${imageUrl}`)
    const imgResponse = await fetch(imageUrl)
    
    if (!imgResponse.ok || !imgResponse.body) {
      console.error('Image fetch failed for:', imageUrl)
      return new NextResponse('Image fetch failed', { status: 502 })
    }
    
    const storagePath = `bravo/people/${person.id}/${today}.jpg`
    
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, await imgResponse.arrayBuffer(), {
        contentType: imgResponse.headers.get('content-type') || 'image/jpeg',
        upsert: true
      })
    
    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new NextResponse(uploadError.message, { status: 500 })
    }
    
    console.log(`Image uploaded to: ${storagePath}`)
    
    // 4) Upsert daily row 
    const { error: dbError } = await supabase
      .from('gwb_daily')
      .upsert({
        date_utc: today,
        person_id: person.id
      }, { 
        onConflict: 'date_utc' 
      })
    
    if (dbError) {
      console.error('DB error:', dbError)
      return new NextResponse(dbError.message, { status: 500 })
    }
    
    console.log(`Daily puzzle created successfully`)
    
    return NextResponse.json({
      date: today,
      person: { 
        id: person.id, 
        name: person.full_name 
      },
      image_path: storagePath
    })
    
  } catch (error) {
    console.error('Roll daily error:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}