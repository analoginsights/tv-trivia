import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import { discoverBravoShows } from '../src/lib/tmdb'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN!

async function tmdbFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${TMDB_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      accept: 'application/json'
    }
  })
  
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`)
  }
  
  return response.json()
}

async function debugETLDistribution() {
  console.log('🔍 Debugging ETL Distribution Logic...\n')
  
  try {
    // Step 1: Get just 3 shows for debugging
    console.log('1. Fetching sample shows...')
    const shows = await discoverBravoShows(1)
    const testShows = shows.slice(0, 3) // Just first 3 shows
    
    console.log('Test shows:')
    testShows.forEach((show, i) => {
      console.log(`  ${i + 1}. ID: ${show.id}, Name: ${show.name}`)
    })
    
    const allShows = new Map()
    const allPeople = new Map()
    const appearanceMap = new Map()
    
    // Add shows to map
    testShows.forEach((show, idx) => {
      allShows.set(show.id, {
        id: show.id,
        name: show.name,
        poster_path: show.poster_path,
        popularity_rank: idx + 1
      })
    })
    
    // Step 2: Process each show and trace the data
    console.log('\n2. Processing shows with detailed tracing...')
    
    for (const [showId, show] of allShows) {
      console.log(`\n--- Processing Show: ${show.name} (ID: ${showId}) ---`)
      
      try {
        const credits = await tmdbFetch<any>(`/tv/${showId}/aggregate_credits`)
        console.log(`  TMDB returned ${credits.cast?.length || 0} cast members`)
        
        // Process only first 5 cast members for debugging
        const sampleCast = credits.cast.slice(0, 5)
        
        sampleCast.forEach((person: any, i) => {
          console.log(`    Processing person ${i + 1}: ${person.name} (ID: ${person.id})`)
          
          // Add person
          allPeople.set(person.id, {
            id: person.id,
            name: person.name,
            profile_path: person.profile_path
          })
          console.log(`      Added person ${person.id} to people map`)
          
          // Create appearance
          const episodeCount = person.roles?.reduce((sum: number, role: any) => sum + (role.episode_count || 0), 0) || 1
          const key = `${showId}-${person.id}`
          
          console.log(`      Creating appearance with key: ${key}`)
          console.log(`      Show ID: ${showId}, Person ID: ${person.id}`)
          
          const appearance = {
            show_id: showId,  // This should be different for each show!
            person_id: person.id,
            episode_count: episodeCount,
            guest_episode_count: 0,
            appearance_kind: 'main' as const
          }
          
          appearanceMap.set(key, appearance)
          console.log(`      Stored appearance: ${JSON.stringify(appearance)}`)
        })
        
        console.log(`  ✅ Processed ${sampleCast.length} cast members for show ${showId}`)
        
      } catch (error) {
        console.error(`  ❌ Failed to process show ${showId}:`, error)
      }
      
      await new Promise(resolve => setTimeout(resolve, 500)) // Delay between shows
    }
    
    // Step 3: Check the final appearance map
    console.log('\n3. Analyzing final appearance map...')
    
    const appearancesData = Array.from(appearanceMap.values())
    console.log(`Total appearances created: ${appearancesData.length}`)
    
    const showDistribution = new Map()
    appearancesData.forEach(app => {
      showDistribution.set(app.show_id, (showDistribution.get(app.show_id) || 0) + 1)
    })
    
    console.log('\nShow distribution in appearance map:')
    for (const [showId, count] of showDistribution.entries()) {
      const show = Array.from(allShows.values()).find(s => s.id === showId)
      console.log(`  Show ${showId} (${show?.name || 'Unknown'}): ${count} appearances`)
    }
    
    // Step 4: Sample the data before upsert
    console.log('\nSample appearances before upsert:')
    appearancesData.slice(0, 10).forEach((app, i) => {
      console.log(`  ${i + 1}. Person ${app.person_id} -> Show ${app.show_id} (${app.appearance_kind})`)
    })
    
    // If distribution looks good, we can skip the actual upsert for debugging
    console.log('\n✅ Debug complete - data distribution analysis finished')
    
    return {
      totalShows: allShows.size,
      totalPeople: allPeople.size,
      totalAppearances: appearancesData.length,
      showDistribution: Object.fromEntries(showDistribution)
    }
    
  } catch (error) {
    console.error('❌ Debug ETL failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  debugETLDistribution()
    .then(result => {
      console.log('\n📊 Debug Summary:')
      console.log(`  Shows processed: ${result.totalShows}`)
      console.log(`  People found: ${result.totalPeople}`)
      console.log(`  Appearances created: ${result.totalAppearances}`)
      console.log(`  Show distribution: ${JSON.stringify(result.showDistribution, null, 2)}`)
      
      const uniqueShows = Object.keys(result.showDistribution).length
      if (uniqueShows > 1) {
        console.log(`\n✅ GOOD: Appearances distributed across ${uniqueShows} shows`)
      } else {
        console.log(`\n🚨 ISSUE: All appearances assigned to single show`)
      }
      
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { debugETLDistribution }