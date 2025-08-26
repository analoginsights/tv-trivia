import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import { discoverBravoShows } from '../src/lib/tmdb'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN!
const ETL_PAGES = 3 // Start with 3 pages for testing
const MAX_EPISODES_TO_SCAN = 5 // Limit episodes per season for testing

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

interface ShowDetails {
  id: number
  name: string
  poster_path: string | null
  number_of_seasons: number
  seasons: Array<{
    season_number: number
    episode_count: number
  }>
}

interface AggregateCredits {
  cast: Array<{
    id: number
    name: string
    profile_path: string | null
    roles?: Array<{
      episode_count: number
    }>
  }>
}

interface EpisodeCredits {
  guest_stars: Array<{
    id: number
    name: string
    profile_path: string | null
  }>
}

async function extractAndCacheEnhancedBravoData() {
  console.log('🚀 Starting Enhanced Bravo ETL with Guest Stars...\n')
  
  const allShows = new Map<number, any>()
  const allPeople = new Map<number, any>()
  const appearanceMap = new Map<string, any>() // key: "showId-personId"
  
  // Step 1: Discover Bravo shows
  console.log(`📺 Fetching ${ETL_PAGES} pages of Bravo shows...`)
  for (let page = 1; page <= ETL_PAGES; page++) {
    console.log(`  Page ${page}...`)
    const shows = await discoverBravoShows(page)
    
    shows.forEach((show, idx) => {
      allShows.set(show.id, {
        id: show.id,
        name: show.name,
        poster_path: show.poster_path,
        popularity_rank: (page - 1) * 20 + idx + 1
      })
    })
    
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  
  console.log(`✅ Found ${allShows.size} Bravo shows\n`)
  
  // Step 2: Process each show for MAIN cast and GUEST stars
  console.log('🎭 Processing shows for main cast and guest stars...')
  let showCount = 0
  
  for (const [showId, show] of allShows) {
    showCount++
    console.log(`\n[${showCount}/${allShows.size}] ${show.name}`)
    
    try {
      // Get show details for season info
      const showDetails = await tmdbFetch<ShowDetails>(`/tv/${showId}`)
      await new Promise(resolve => setTimeout(resolve, 250))
      
      // Step 2A: Get series-level cast (main cast)
      console.log('  📋 Fetching main cast...')
      try {
        const credits = await tmdbFetch<AggregateCredits>(`/tv/${showId}/aggregate_credits`)
        
        credits.cast.forEach(person => {
          // Update person
          allPeople.set(person.id, {
            id: person.id,
            name: person.name,
            profile_path: person.profile_path
          })
          
          // Calculate total episode count
          const episodeCount = person.roles?.reduce((sum, role) => sum + (role.episode_count || 0), 0) || 1
          
          // Update appearance
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
        
        console.log(`    ✅ Found ${credits.cast.length} main cast members`)
      } catch (error) {
        console.log('    ⚠️  No aggregate credits, trying regular credits...')
        try {
          const credits = await tmdbFetch<{ cast: any[] }>(`/tv/${showId}/credits`)
          credits.cast.forEach(person => {
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
              episode_count: Math.max(existing.episode_count, 1)
            })
          })
          console.log(`    ✅ Found ${credits.cast.length} cast members`)
        } catch (err) {
          console.log('    ❌ No cast credits available')
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 250))
      
      // Step 2B: Get guest stars from episodes (limited for testing)
      if (showDetails.number_of_seasons > 0) {
        console.log(`  🌟 Scanning for guest stars (${showDetails.number_of_seasons} seasons)...`)
        
        const guestSet = new Set<number>()
        const seasonsToScan = Math.min(2, showDetails.number_of_seasons) // Limit to 2 seasons for testing
        
        for (let season = 1; season <= seasonsToScan; season++) {
          // Get just a few episodes per season for testing
          for (let episode = 1; episode <= MAX_EPISODES_TO_SCAN; episode++) {
            try {
              const episodeCredits = await tmdbFetch<EpisodeCredits>(
                `/tv/${showId}/season/${season}/episode/${episode}/credits`
              )
              
              episodeCredits.guest_stars?.forEach(person => {
                guestSet.add(person.id)
                
                // Update person
                allPeople.set(person.id, {
                  id: person.id,
                  name: person.name,
                  profile_path: person.profile_path
                })
                
                // Update appearance
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
              
              await new Promise(resolve => setTimeout(resolve, 100)) // Rate limit
            } catch (error) {
              // Episode doesn't exist or API error, skip
              break
            }
          }
        }
        
        console.log(`    ✅ Found ${guestSet.size} unique guest stars`)
      }
      
    } catch (error) {
      console.error(`  ❌ Failed to process show ${showId}:`, error)
    }
    
    // Rate limiting between shows
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  
  console.log(`\n📊 ETL Summary:`)
  console.log(`  Shows: ${allShows.size}`)
  console.log(`  People: ${allPeople.size}`)
  console.log(`  Appearances: ${appearanceMap.size}`)
  
  // Step 3: Upsert to Supabase
  console.log('\n💾 Upserting data to Supabase...')
  
  // Upsert shows
  const showsData = Array.from(allShows.values())
  const { error: showsError } = await supabaseAdmin
    .from('rg_shows')
    .upsert(showsData, { onConflict: 'id' })
  
  if (showsError) {
    console.error('Error upserting shows:', showsError)
    throw showsError
  }
  console.log(`  ✅ Upserted ${showsData.length} shows`)
  
  // Upsert people
  const peopleData = Array.from(allPeople.values())
  const { error: peopleError } = await supabaseAdmin
    .from('rg_people')
    .upsert(peopleData, { onConflict: 'id' })
  
  if (peopleError) {
    console.error('Error upserting people:', peopleError)
    throw peopleError
  }
  console.log(`  ✅ Upserted ${peopleData.length} people`)
  
  // Upsert appearances with kind
  const appearancesData = Array.from(appearanceMap.values()).map(app => {
    // Determine appearance_kind
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
  
  const { error: appearancesError } = await supabaseAdmin
    .from('rg_appearances')
    .upsert(appearancesData, { onConflict: 'show_id,person_id' })
  
  if (appearancesError) {
    console.error('Error upserting appearances:', appearancesError)
    throw appearancesError
  }
  console.log(`  ✅ Upserted ${appearancesData.length} appearances`)
  
  // Step 4: Reconcile and refresh eligibility
  console.log('\n🔄 Reconciling appearance kinds...')
  const { error: reconcileError } = await supabaseAdmin.rpc('rg_reconcile_appearance_kinds')
  if (reconcileError) {
    console.error('Error reconciling:', reconcileError)
  }
  
  console.log('🔄 Refreshing eligibility...')
  const { error: eligibilityError } = await supabaseAdmin.rpc('rg_derive_eligibility_enhanced')
  if (eligibilityError) {
    console.error('Error deriving eligibility:', eligibilityError)
  }
  
  // Get final stats
  const { data: stats } = await supabaseAdmin
    .from('rg_people')
    .select('is_valid', { count: 'exact' })
  
  const eligible = stats?.filter(p => p.is_valid).length || 0
  const total = stats?.length || 0
  
  console.log(`\n✅ Enhanced ETL Complete!`)
  console.log(`  Total people: ${total}`)
  console.log(`  Eligible people (≥3 shows): ${eligible}`)
  console.log(`  Eligibility rate: ${((eligible / total) * 100).toFixed(2)}%`)
  
  // Show breakdown of appearances
  const { data: breakdown } = await supabaseAdmin
    .from('rg_appearances')
    .select('appearance_kind', { count: 'exact' })
  
  const mainCount = breakdown?.filter(a => a.appearance_kind === 'main').length || 0
  const guestCount = breakdown?.filter(a => a.appearance_kind === 'guest').length || 0
  const bothCount = breakdown?.filter(a => a.appearance_kind === 'both').length || 0
  
  console.log(`\n📊 Appearance Breakdown:`)
  console.log(`  Main cast only: ${mainCount}`)
  console.log(`  Guest stars only: ${guestCount}`)
  console.log(`  Both main & guest: ${bothCount}`)
  
  return {
    shows: showsData.length,
    people: peopleData.length,
    appearances: appearancesData.length,
    eligible,
    mainCount,
    guestCount,
    bothCount
  }
}

// Run if executed directly
if (require.main === module) {
  extractAndCacheEnhancedBravoData()
    .then(stats => {
      console.log('\n🎉 Enhanced ETL successful!')
      process.exit(0)
    })
    .catch(error => {
      console.error('ETL failed:', error)
      process.exit(1)
    })
}

export { extractAndCacheEnhancedBravoData }