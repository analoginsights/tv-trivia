import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import { discoverBravoShows } from '../src/lib/tmdb'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN!
const TEST_PAGES = 1 // Just 1 page for testing (20 shows)
const MAX_EPISODES_PER_SEASON = 2 // Reduced for testing
const MAX_SEASONS_TO_SCAN = 1 // Just 1 season for testing

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

async function testFixedETL() {
  console.log('🧪 Testing Fixed ETL with Small Dataset...\n')
  
  const allShows = new Map<number, any>()
  const allPeople = new Map<number, any>()
  const appearanceMap = new Map<string, any>()
  
  try {
    // Step 1: Get test shows (just first page)
    console.log(`📺 Fetching ${TEST_PAGES} page of Bravo shows for testing...`)
    const shows = await discoverBravoShows(1)
    
    // Take only first 5 shows for quick testing
    const testShows = shows.slice(0, 5)
    testShows.forEach((show, idx) => {
      allShows.set(show.id, {
        id: show.id,
        name: show.name,
        poster_path: show.poster_path,
        popularity_rank: idx + 1
      })
    })
    
    console.log(`✅ Selected ${allShows.size} shows for testing\n`)
    
    // Step 2: Process test shows
    console.log('🎭 Processing test shows...')
    let showCount = 0
    
    for (const [showId, show] of allShows) {
      showCount++
      console.log(`\n[${showCount}/${allShows.size}] ${show.name}`)
      
      try {
        // Get main cast
        console.log('  📋 Fetching main cast...')
        try {
          const credits = await tmdbFetch<any>(`/tv/${showId}/aggregate_credits`)
          
          credits.cast.slice(0, 50).forEach((person: any) => { // Limit to 50 per show for testing
            allPeople.set(person.id, {
              id: person.id,
              name: person.name,
              profile_path: person.profile_path
            })
            
            const episodeCount = person.roles?.reduce((sum: number, role: any) => sum + (role.episode_count || 0), 0) || 1
            
            const key = `${showId}-${person.id}`
            appearanceMap.set(key, {
              show_id: showId,
              person_id: person.id,
              episode_count: episodeCount,
              guest_episode_count: 0,
              appearance_kind: 'main'
            })
          })
          
          console.log(`    ✅ Found ${Math.min(credits.cast.length, 50)} main cast members`)
        } catch (error) {
          console.log('    ⚠️  No main cast credits available')
        }
        
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Get limited guest stars for testing
        try {
          const showDetails = await tmdbFetch<any>(`/tv/${showId}`)
          
          if (showDetails.number_of_seasons > 0 && showDetails.number_of_seasons <= 10) {
            console.log(`  🌟 Scanning guest stars (limited for testing)...`)
            
            const guestSet = new Set<number>()
            
            // Just scan first season, first 2 episodes
            for (let episode = 1; episode <= MAX_EPISODES_PER_SEASON; episode++) {
              try {
                const episodeCredits = await tmdbFetch<any>(`/tv/${showId}/season/1/episode/${episode}/credits`)
                
                episodeCredits.guest_stars?.slice(0, 10).forEach((person: any) => { // Limit guests
                  guestSet.add(person.id)
                  
                  allPeople.set(person.id, {
                    id: person.id,
                    name: person.name,
                    profile_path: person.profile_path
                  })
                  
                  const key = `${showId}-${person.id}`
                  const existing = appearanceMap.get(key)
                  
                  appearanceMap.set(key, {
                    show_id: showId,
                    person_id: person.id,
                    episode_count: existing?.episode_count || 0,
                    guest_episode_count: (existing?.guest_episode_count || 0) + 1,
                    appearance_kind: existing ? 'both' : 'guest'
                  })
                })
                
                await new Promise(resolve => setTimeout(resolve, 50))
              } catch {
                break
              }
            }
            
            console.log(`    ✅ Found ${guestSet.size} guest stars`)
          } else {
            console.log(`    ⏩ Skipping guest scan`)
          }
        } catch (error) {
          console.log('    ⚠️  Could not get show details')
        }
        
      } catch (error) {
        console.error(`  ❌ Failed to process show ${showId}:`, error)
      }
    }
    
    // Update appearance kinds
    appearanceMap.forEach(appearance => {
      if (appearance.episode_count > 0 && appearance.guest_episode_count > 0) {
        appearance.appearance_kind = 'both'
      } else if (appearance.episode_count > 0) {
        appearance.appearance_kind = 'main'
      } else if (appearance.guest_episode_count > 0) {
        appearance.appearance_kind = 'guest'
      }
    })
    
    console.log(`\n📊 Test Data Collection Summary:`)
    console.log(`  Shows: ${allShows.size}`)
    console.log(`  People: ${allPeople.size}`)
    console.log(`  Appearances: ${appearanceMap.size}`)
    
    // Step 3: Pre-upsert Validation
    console.log('\n🔍 Pre-upsert Validation...')
    
    const showsData = Array.from(allShows.values())
    const peopleData = Array.from(allPeople.values())
    const appearancesData = Array.from(appearanceMap.values())
    
    const peopleIds = new Set(peopleData.map(p => p.id))
    const showIds = new Set(showsData.map(s => s.id))
    const invalidAppearances = appearancesData.filter(app => !peopleIds.has(app.person_id) || !showIds.has(app.show_id))
    
    if (invalidAppearances.length > 0) {
      console.error(`❌ Found ${invalidAppearances.length} appearances with invalid references!`)
      throw new Error('Validation failed')
    } else {
      console.log('✅ All appearance references are valid')
    }
    
    // Step 4: Test Upsert (DRY RUN - Don't actually insert)
    console.log('\n💾 TEST UPSERT (Dry Run):')
    console.log(`  Would upsert ${showsData.length} shows`)
    console.log(`  Would upsert ${peopleData.length} people`)  
    console.log(`  Would upsert ${appearancesData.length} appearances`)
    
    // Show sample data
    console.log('\n📋 Sample Data:')
    console.log('Sample shows:', showsData.slice(0, 3).map(s => s.name))
    console.log('Sample people:', peopleData.slice(0, 5).map(p => p.name))
    console.log('Sample appearances:', appearancesData.slice(0, 3).map(a => 
      `${peopleData.find(p => p.id === a.person_id)?.name} in ${showsData.find(s => s.id === a.show_id)?.name} (${a.appearance_kind})`
    ))
    
    console.log('\n✅ Test ETL completed successfully!')
    console.log('🎯 Data structure is correct and ready for full ETL')
    
    return {
      shows: showsData.length,
      people: peopleData.length,
      appearances: appearancesData.length,
      validReferences: true
    }
    
  } catch (error) {
    console.error('❌ Test ETL failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  testFixedETL()
    .then(stats => {
      console.log(`\n🎉 Test passed! Ready to run full ETL with ${stats.appearances} test appearances`)
      process.exit(0)
    })
    .catch(error => {
      console.error('Test failed:', error)
      process.exit(1)
    })
}

export { testFixedETL }