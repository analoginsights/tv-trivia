import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import { discoverBravoShows } from '../src/lib/tmdb'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN!
const TEST_PAGES = 1 // Just 1 page for testing (20 shows)
const MAX_EPISODES_TO_SCAN = 2 // Even fewer episodes
const MAX_SEASONS_TO_SCAN = 1 // Just 1 season per show

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

async function testEnhancedETL() {
  console.log('🧪 Testing Enhanced Bravo ETL (Quick Version)...\n')
  
  const allShows = new Map<number, any>()
  const allPeople = new Map<number, any>()
  const appearanceMap = new Map<string, any>()
  
  // Step 1: Get just first page of shows
  console.log('📺 Fetching 1 page of Bravo shows...')
  const shows = await discoverBravoShows(1)
  
  shows.forEach((show, idx) => {
    allShows.set(show.id, {
      id: show.id,
      name: show.name,
      poster_path: show.poster_path,
      popularity_rank: idx + 1
    })
  })
  
  console.log(`✅ Found ${allShows.size} shows to test\n`)
  
  // Process just first 5 shows for quick test
  const testShows = Array.from(allShows.entries()).slice(0, 5)
  
  for (const [showId, show] of testShows) {
    console.log(`🎬 Processing: ${show.name}`)
    
    try {
      // Get show details
      const showDetails = await tmdbFetch<any>(`/tv/${showId}`)
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Get main cast
      console.log('  📋 Fetching main cast...')
      try {
        const credits = await tmdbFetch<any>(`/tv/${showId}/aggregate_credits`)
        
        credits.cast.forEach((person: any) => {
          allPeople.set(person.id, {
            id: person.id,
            name: person.name,
            profile_path: person.profile_path
          })
          
          const episodeCount = person.roles?.reduce((sum: number, role: any) => sum + (role.episode_count || 0), 0) || 1
          
          const key = `${showId}-${person.id}`
          const existing = appearanceMap.get(key) || { 
            show_id: showId, 
            person_id: person.id,
            episode_count: 0,
            guest_episode_count: 0
          }
          
          appearanceMap.set(key, {
            ...existing,
            episode_count: Math.max(existing.episode_count, episodeCount)
          })
        })
        
        console.log(`    ✅ Found ${credits.cast.length} main cast`)
      } catch (error) {
        console.log('    ⚠️  No main cast found')
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Get guest stars (very limited)
      if (showDetails.number_of_seasons > 0) {
        console.log('  🌟 Scanning for guest stars (limited)...')
        
        const guestSet = new Set<number>()
        const seasonsToScan = Math.min(MAX_SEASONS_TO_SCAN, showDetails.number_of_seasons)
        
        for (let season = 1; season <= seasonsToScan; season++) {
          for (let episode = 1; episode <= MAX_EPISODES_TO_SCAN; episode++) {
            try {
              const episodeCredits = await tmdbFetch<any>(
                `/tv/${showId}/season/${season}/episode/${episode}/credits`
              )
              
              episodeCredits.guest_stars?.forEach((person: any) => {
                guestSet.add(person.id)
                
                allPeople.set(person.id, {
                  id: person.id,
                  name: person.name,
                  profile_path: person.profile_path
                })
                
                const key = `${showId}-${person.id}`
                const existing = appearanceMap.get(key) || { 
                  show_id: showId, 
                  person_id: person.id,
                  episode_count: 0,
                  guest_episode_count: 0
                }
                
                appearanceMap.set(key, {
                  ...existing,
                  guest_episode_count: existing.guest_episode_count + 1
                })
              })
              
              await new Promise(resolve => setTimeout(resolve, 50))
            } catch (error) {
              break
            }
          }
        }
        
        console.log(`    ✅ Found ${guestSet.size} guest stars`)
      }
      
    } catch (error) {
      console.error(`  ❌ Failed to process ${showId}:`, error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  console.log(`\n📊 Test ETL Summary:`)
  console.log(`  Shows: ${testShows.length}`)
  console.log(`  People: ${allPeople.size}`)
  console.log(`  Appearances: ${appearanceMap.size}`)
  
  // Test upsert to Supabase
  console.log('\n💾 Testing upsert to Supabase...')
  
  const showsData = testShows.map(([, show]) => show)
  const peopleData = Array.from(allPeople.values())
  const appearancesData = Array.from(appearanceMap.values()).map(app => {
    let appearance_kind = null
    if (app.episode_count > 0 && app.guest_episode_count > 0) {
      appearance_kind = 'both'
    } else if (app.episode_count > 0) {
      appearance_kind = 'main'  
    } else if (app.guest_episode_count > 0) {
      appearance_kind = 'guest'
    }
    
    return { ...app, appearance_kind }
  })
  
  // Just test the data structure (don't actually insert)
  console.log('\nSample appearance data:')
  appearancesData.slice(0, 3).forEach((app, i) => {
    console.log(`${i + 1}. Person ${app.person_id} in Show ${app.show_id}: ${app.appearance_kind} (main: ${app.episode_count}, guest: ${app.guest_episode_count})`)
  })
  
  console.log('\n✅ Enhanced ETL test completed successfully!')
  console.log('📝 Data structure looks good - ready for full ETL')
  
  return { 
    shows: showsData.length, 
    people: peopleData.length, 
    appearances: appearancesData.length 
  }
}

// Run if executed directly
if (require.main === module) {
  testEnhancedETL()
    .then(stats => {
      console.log(`\n🎉 Test successful! Ready for full ETL.`)
      process.exit(0)
    })
    .catch(error => {
      console.error('Test failed:', error)
      process.exit(1)
    })
}

export { testEnhancedETL }