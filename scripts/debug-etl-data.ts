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

async function debugETLData() {
  console.log('🔍 Debugging ETL data collection...')
  
  try {
    const allShows = new Map<number, any>()
    const allPeople = new Map<number, any>()
    const appearanceMap = new Map<string, any>()
    
    // Only process first 3 shows for debugging
    console.log('📺 Fetching first page of Bravo shows...')
    const shows = await discoverBravoShows(1)
    
    const testShows = shows.slice(0, 3) // Just first 3 shows
    testShows.forEach((show, idx) => {
      allShows.set(show.id, {
        id: show.id,
        name: show.name,
        poster_path: show.poster_path,
        popularity_rank: idx + 1
      })
    })
    
    console.log(`\nProcessing ${testShows.length} shows for debugging:`)
    testShows.forEach(show => {
      console.log(`  - ${show.name} (ID: ${show.id})`)
    })
    
    // Process each show
    for (const [showId, show] of allShows) {
      console.log(`\n🎬 Processing: ${show.name}`)
      
      try {
        // Get main cast
        console.log('  📋 Fetching main cast...')
        const credits = await tmdbFetch<any>(`/tv/${showId}/aggregate_credits`)
        
        console.log(`    Found ${credits.cast.length} main cast members`)
        
        credits.cast.slice(0, 5).forEach((person: any) => {
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
          
          console.log(`      - ${person.name} (${person.id}): ${episodeCount} episodes`)
        })
        
        if (credits.cast.length > 5) {
          console.log(`      ... and ${credits.cast.length - 5} more cast members`)
        }
        
        // Add all cast members to the maps
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
        
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        console.error(`  ❌ Failed to process show ${showId}:`, error)
      }
    }
    
    console.log(`\n📊 Data Collection Results:`)
    console.log(`  Shows: ${allShows.size}`)
    console.log(`  People: ${allPeople.size}`)
    console.log(`  Appearances: ${appearanceMap.size}`)
    
    // Prepare data for upsert
    const showsData = Array.from(allShows.values())
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
      
      return {
        show_id: app.show_id,
        person_id: app.person_id,
        episode_count: app.episode_count,
        guest_episode_count: app.guest_episode_count,
        appearance_kind
      }
    })
    
    console.log(`\n💾 Debug Upsert (DRY RUN):`)
    console.log(`  Would upsert ${showsData.length} shows`)
    console.log(`  Would upsert ${peopleData.length} people`)
    console.log(`  Would upsert ${appearancesData.length} appearances`)
    
    console.log(`\n📋 Sample appearances data:`)
    appearancesData.slice(0, 10).forEach((app, i) => {
      const show = showsData.find(s => s.id === app.show_id)
      const person = peopleData.find(p => p.id === app.person_id)
      console.log(`  ${i + 1}. ${person?.name} in "${show?.name}" (${app.appearance_kind})`)
    })
    
    // Check for data that would be rejected by foreign keys
    console.log(`\n🔍 Checking for foreign key issues...`)
    const { data: existingShows } = await supabaseAdmin
      .from('rg_shows')
      .select('id')
    
    const { data: existingPeople } = await supabaseAdmin
      .from('rg_people')
      .select('id')
    
    const existingShowIds = new Set(existingShows?.map(s => s.id) || [])
    const existingPeopleIds = new Set(existingPeople?.map(p => p.id) || [])
    
    const rejectedShows = appearancesData.filter(app => !existingShowIds.has(app.show_id))
    const rejectedPeople = appearancesData.filter(app => !existingPeopleIds.has(app.person_id))
    
    console.log(`  Appearances with missing shows: ${rejectedShows.length}`)
    console.log(`  Appearances with missing people: ${rejectedPeople.length}`)
    
    if (rejectedShows.length > 0) {
      console.log('  Missing show IDs:', Array.from(new Set(rejectedShows.map(a => a.show_id))))
    }
    
    if (rejectedPeople.length > 0) {
      console.log('  Missing person IDs:', Array.from(new Set(rejectedPeople.map(a => a.person_id))).slice(0, 10))
    }
    
    return {
      shows: showsData.length,
      people: peopleData.length,
      appearances: appearancesData.length,
      rejectedShows: rejectedShows.length,
      rejectedPeople: rejectedPeople.length
    }
    
  } catch (error) {
    console.error('❌ Debug ETL failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  debugETLData()
    .then((stats) => {
      console.log(`\n✅ Debug ETL complete:`)
      console.log(`   Data collected: ${stats.shows} shows, ${stats.people} people, ${stats.appearances} appearances`)
      console.log(`   Potential rejections: ${stats.rejectedShows} shows, ${stats.rejectedPeople} people`)
      
      if (stats.rejectedShows > 0 || stats.rejectedPeople > 0) {
        console.log('\n⚠️  Foreign key constraint issues detected!')
        console.log('   This explains why the ETL data isn\'t persisting properly.')
      }
      
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { debugETLData }