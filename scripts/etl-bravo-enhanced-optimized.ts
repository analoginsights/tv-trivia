import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import { discoverBravoShows } from '../src/lib/tmdb'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN!
const ETL_PAGES = 3 // 3 pages = 60 shows
const MAX_EPISODES_PER_SEASON = 3 // Reduced from 5
const MAX_SEASONS_TO_SCAN = 2 // Reduced from all seasons

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

async function optimizedEnhancedETL() {
  console.log('🚀 Starting Optimized Enhanced Bravo ETL...\n')
  
  const allShows = new Map<number, any>()
  const allPeople = new Map<number, any>()
  const appearanceMap = new Map<string, any>()
  
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
    
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  console.log(`✅ Found ${allShows.size} Bravo shows\n`)
  
  // Step 2: Process each show (optimized)
  console.log('🎭 Processing shows with optimized guest star scanning...')
  let showCount = 0
  let totalMainCast = 0
  let totalGuestStars = 0
  
  for (const [showId, show] of allShows) {
    showCount++
    console.log(`\n[${showCount}/${allShows.size}] ${show.name}`)
    
    try {
      // Get main cast first (always do this)
      console.log('  📋 Fetching main cast...')
      let mainCastCount = 0
      
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
          
          mainCastCount++
        })
        
        console.log(`    ✅ Found ${mainCastCount} main cast members`)
        totalMainCast += mainCastCount
      } catch (error) {
        console.log('    ⚠️  No main cast credits available')
      }
      
      await new Promise(resolve => setTimeout(resolve, 150))
      
      // Get guest stars (optimized - only for shows with reasonable seasons)
      let guestStarsCount = 0
      
      try {
        const showDetails = await tmdbFetch<any>(`/tv/${showId}`)
        
        // Only scan for guest stars if show has reasonable number of seasons
        if (showDetails.number_of_seasons > 0 && showDetails.number_of_seasons <= 15) {
          console.log(`  🌟 Scanning guest stars (${Math.min(MAX_SEASONS_TO_SCAN, showDetails.number_of_seasons)} seasons, ${MAX_EPISODES_PER_SEASON} episodes each)...`)
          
          const guestSet = new Set<number>()
          const seasonsToScan = Math.min(MAX_SEASONS_TO_SCAN, showDetails.number_of_seasons)
          
          for (let season = 1; season <= seasonsToScan; season++) {
            for (let episode = 1; episode <= MAX_EPISODES_PER_SEASON; episode++) {
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
                
                await new Promise(resolve => setTimeout(resolve, 80))
              } catch (error) {
                break // Episode doesn't exist
              }
            }
          }
          
          guestStarsCount = guestSet.size
          console.log(`    ✅ Found ${guestStarsCount} unique guest stars`)
          totalGuestStars += guestStarsCount
        } else if (showDetails.number_of_seasons > 15) {
          console.log(`    ⏩ Skipping guest scan (${showDetails.number_of_seasons} seasons too many)`)
        }
      } catch (error) {
        console.log('    ⚠️  Could not get show details for guest scan')
      }
      
    } catch (error) {
      console.error(`  ❌ Failed to process show ${showId}:`, error)
    }
    
    // Progress update every 10 shows
    if (showCount % 10 === 0) {
      console.log(`\n📊 Progress: ${showCount}/${allShows.size} shows | ${allPeople.size} people | ${appearanceMap.size} appearances`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log(`\n📊 Enhanced ETL Summary:`)
  console.log(`  Shows processed: ${allShows.size}`)
  console.log(`  People found: ${allPeople.size}`)
  console.log(`  Appearances: ${appearanceMap.size}`)
  console.log(`  Total main cast: ${totalMainCast}`)
  console.log(`  Total guest stars: ${totalGuestStars}`)
  
  // Step 3: Upsert to Supabase
  console.log('\n💾 Upserting data to Supabase...')
  
  // Upsert shows
  const showsData = Array.from(allShows.values())
  console.log('  Upserting shows...')
  const { error: showsError } = await supabaseAdmin
    .from('rg_shows')
    .upsert(showsData, { onConflict: 'id' })
  
  if (showsError) throw showsError
  console.log(`  ✅ Upserted ${showsData.length} shows`)
  
  // Upsert people
  const peopleData = Array.from(allPeople.values())
  console.log('  Upserting people...')
  const { error: peopleError } = await supabaseAdmin
    .from('rg_people')
    .upsert(peopleData, { onConflict: 'id' })
  
  if (peopleError) throw peopleError
  console.log(`  ✅ Upserted ${peopleData.length} people`)
  
  // Upsert appearances with classification
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
  
  console.log('  Upserting appearances...')
  const { error: appearancesError } = await supabaseAdmin
    .from('rg_appearances')
    .upsert(appearancesData, { onConflict: 'show_id,person_id' })
  
  if (appearancesError) throw appearancesError
  console.log(`  ✅ Upserted ${appearancesData.length} appearances`)
  
  // Step 4: Reconcile and refresh eligibility
  console.log('\n🔄 Reconciling data and refreshing eligibility...')
  
  console.log('  Reconciling appearance kinds...')
  const { error: reconcileError } = await supabaseAdmin.rpc('rg_reconcile_appearance_kinds')
  if (reconcileError) console.error('Reconcile error:', reconcileError)
  
  console.log('  Refreshing eligibility...')
  const { error: eligibilityError } = await supabaseAdmin.rpc('rg_derive_eligibility_enhanced')
  if (eligibilityError) console.error('Eligibility error:', eligibilityError)
  
  // Get final statistics
  const { data: stats } = await supabaseAdmin
    .from('rg_people')
    .select('is_valid')
  
  const eligible = stats?.filter(p => p.is_valid).length || 0
  const total = stats?.length || 0
  
  // Appearance breakdown
  const { data: appearances } = await supabaseAdmin
    .from('rg_appearances')
    .select('appearance_kind')
  
  const mainOnly = appearances?.filter(a => a.appearance_kind === 'main').length || 0
  const guestOnly = appearances?.filter(a => a.appearance_kind === 'guest').length || 0  
  const both = appearances?.filter(a => a.appearance_kind === 'both').length || 0
  
  console.log(`\n🎉 Enhanced ETL Complete!`)
  console.log(`\n📊 Final Statistics:`)
  console.log(`  Total people: ${total}`)
  console.log(`  Eligible people (≥3 shows): ${eligible} (${((eligible / total) * 100).toFixed(1)}%)`)
  console.log(`  Main cast only: ${mainOnly}`)
  console.log(`  Guest stars only: ${guestOnly}`)
  console.log(`  Both main & guest: ${both}`)
  
  const improvementFactor = Math.round(eligible / 350) // Assume ~350 before
  console.log(`\n🚀 Estimated improvement: ${improvementFactor}x more eligible people!`)
  
  return {
    shows: showsData.length,
    people: peopleData.length,
    appearances: appearancesData.length,
    eligible,
    mainOnly,
    guestOnly,
    both
  }
}

// Run if executed directly
if (require.main === module) {
  optimizedEnhancedETL()
    .then(stats => {
      console.log('\n✅ Optimized Enhanced ETL successful!')
      process.exit(0)
    })
    .catch(error => {
      console.error('ETL failed:', error)
      process.exit(1)
    })
}

export { optimizedEnhancedETL }