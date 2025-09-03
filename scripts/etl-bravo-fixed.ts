import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import { discoverBravoShows } from '../src/lib/tmdb'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN!
const ETL_PAGES = 3 // 3 pages = 60 shows
const MAX_EPISODES_PER_SEASON = 3
const MAX_SEASONS_TO_SCAN = 2

interface Show {
  id: number
  name: string
  poster_path: string | null
  popularity_rank: number
}

interface Person {
  id: number
  name: string
  profile_path: string | null
}

interface Appearance {
  show_id: number
  person_id: number
  episode_count: number
  guest_episode_count: number
  appearance_kind: 'main' | 'guest' | 'both'
}

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

async function fixedEnhancedETL() {
  console.log('🚀 Starting Fixed Enhanced Bravo ETL...\n')
  
  const allShows = new Map<number, Show>()
  const allPeople = new Map<number, Person>()
  const appearanceMap = new Map<string, Appearance>()
  
  try {
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
    
    // Step 2: Process each show with enhanced data collection
    console.log('🎭 Processing shows with enhanced cast and guest collection...')
    let showCount = 0
    let totalMainCast = 0
    let totalGuestStars = 0
    
    for (const [showId, show] of allShows) {
      showCount++
      console.log(`\n[${showCount}/${allShows.size}] ${show.name}`)
      
      try {
        // Get main cast
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
            const existing = appearanceMap.get(key)
            
            appearanceMap.set(key, {
              show_id: showId,
              person_id: person.id,
              episode_count: Math.max(existing?.episode_count || 0, episodeCount),
              guest_episode_count: existing?.guest_episode_count || 0,
              appearance_kind: existing?.appearance_kind || 'main'
            })
            
            mainCastCount++
          })
          
          console.log(`    ✅ Found ${mainCastCount} main cast members`)
          totalMainCast += mainCastCount
        } catch (error) {
          console.log('    ⚠️  No main cast credits available')
        }
        
        await new Promise(resolve => setTimeout(resolve, 150))
        
        // Get guest stars (optimized)
        let guestStarsCount = 0
        
        try {
          const showDetails = await tmdbFetch<any>(`/tv/${showId}`)
          
          if (showDetails.number_of_seasons > 0 && showDetails.number_of_seasons <= 15) {
            console.log(`  🌟 Scanning guest stars (${Math.min(MAX_SEASONS_TO_SCAN, showDetails.number_of_seasons)} seasons, ${MAX_EPISODES_PER_SEASON} episodes each)...`)
            
            const guestSet = new Set<number>()
            const seasonsToScan = Math.min(MAX_SEASONS_TO_SCAN, showDetails.number_of_seasons)
            
            for (let season = 1; season <= seasonsToScan; season++) {
              for (let episode = 1; episode <= MAX_EPISODES_PER_SEASON; episode++) {
                try {
                  const episodeCredits = await tmdbFetch<any>(`/tv/${showId}/season/${season}/episode/${episode}/credits`)
                  
                  episodeCredits.guest_stars?.forEach((person: any) => {
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
                  
                  await new Promise(resolve => setTimeout(resolve, 80))
                } catch {
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
    
    // Update appearance kinds based on episode counts
    appearanceMap.forEach(appearance => {
      if (appearance.episode_count > 0 && appearance.guest_episode_count > 0) {
        appearance.appearance_kind = 'both'
      } else if (appearance.episode_count > 0) {
        appearance.appearance_kind = 'main'
      } else if (appearance.guest_episode_count > 0) {
        appearance.appearance_kind = 'guest'
      }
    })
    
    console.log(`\n📊 Enhanced ETL Summary:`)
    console.log(`  Shows processed: ${allShows.size}`)
    console.log(`  People found: ${allPeople.size}`)
    console.log(`  Appearances: ${appearanceMap.size}`)
    console.log(`  Total main cast: ${totalMainCast}`)
    console.log(`  Total guest stars: ${totalGuestStars}`)
    
    // Step 3: Data Validation Before Upsert
    console.log('\n🔍 Pre-upsert Data Validation...')
    
    const showsData = Array.from(allShows.values())
    const peopleData = Array.from(allPeople.values())
    const appearancesData = Array.from(appearanceMap.values())
    
    console.log('✅ Data validation passed:')
    console.log(`  - ${showsData.length} shows ready for upsert`)
    console.log(`  - ${peopleData.length} people ready for upsert`)
    console.log(`  - ${appearancesData.length} appearances ready for upsert`)
    
    // Validate that all appearance person_ids exist in people data
    const peopleIds = new Set(peopleData.map(p => p.id))
    const invalidAppearances = appearancesData.filter(app => !peopleIds.has(app.person_id))
    
    if (invalidAppearances.length > 0) {
      console.error(`❌ Found ${invalidAppearances.length} appearances with invalid person_ids!`)
      throw new Error('Data validation failed: Invalid person references')
    }
    
    // Step 4: ORDERED Upsert to Supabase (CRITICAL: Order matters!)
    console.log('\n💾 Upserting data to Supabase in correct order...')
    
    // FIRST: Upsert shows (no dependencies)
    console.log('  1/3 Upserting shows...')
    const { error: showsError } = await supabaseAdmin
      .from('rg_shows')
      .upsert(showsData, { onConflict: 'id' })
    
    if (showsError) {
      console.error('❌ Shows upsert failed:', showsError)
      throw showsError
    }
    console.log(`  ✅ Successfully upserted ${showsData.length} shows`)
    
    // SECOND: Upsert people (no dependencies) 
    console.log('  2/3 Upserting people...')
    const { error: peopleError } = await supabaseAdmin
      .from('rg_people')
      .upsert(peopleData, { onConflict: 'id' })
    
    if (peopleError) {
      console.error('❌ People upsert failed:', peopleError)
      throw peopleError
    }
    console.log(`  ✅ Successfully upserted ${peopleData.length} people`)
    
    // THIRD: Upsert appearances (depends on shows and people)
    console.log('  3/3 Upserting appearances...')
    const { error: appearancesError } = await supabaseAdmin
      .from('rg_appearances')
      .upsert(appearancesData, { onConflict: 'show_id,person_id' })
    
    if (appearancesError) {
      console.error('❌ Appearances upsert failed:', appearancesError)
      throw appearancesError
    }
    console.log(`  ✅ Successfully upserted ${appearancesData.length} appearances`)
    
    // Step 5: Post-upsert Validation
    console.log('\n🔍 Post-upsert Validation...')
    
    const { data: finalShows } = await supabaseAdmin.from('rg_shows').select('id', { count: 'exact' })
    const { data: finalPeople } = await supabaseAdmin.from('rg_people').select('id', { count: 'exact' })
    const { data: finalAppearances } = await supabaseAdmin.from('rg_appearances').select('*', { count: 'exact' })
    
    console.log('✅ Final database counts:')
    console.log(`  Shows in DB: ${finalShows?.length || 0} (expected: ${showsData.length})`)
    console.log(`  People in DB: ${finalPeople?.length || 0} (expected: ${peopleData.length})`)
    console.log(`  Appearances in DB: ${finalAppearances?.length || 0} (expected: ${appearancesData.length})`)
    
    // Check for data loss
    const showsLoss = showsData.length - (finalShows?.length || 0)
    const peopleLoss = peopleData.length - (finalPeople?.length || 0)
    const appearancesLoss = appearancesData.length - (finalAppearances?.length || 0)
    
    if (showsLoss > 0) console.warn(`⚠️  Lost ${showsLoss} shows during upsert`)
    if (peopleLoss > 0) console.warn(`⚠️  Lost ${peopleLoss} people during upsert`)
    if (appearancesLoss > 0) console.warn(`⚠️  Lost ${appearancesLoss} appearances during upsert`)
    
    if (showsLoss === 0 && peopleLoss === 0 && appearancesLoss === 0) {
      console.log('✅ No data loss detected!')
    }
    
    // Appearance breakdown
    const mainOnly = finalAppearances?.filter(a => a.appearance_kind === 'main').length || 0
    const guestOnly = finalAppearances?.filter(a => a.appearance_kind === 'guest').length || 0
    const both = finalAppearances?.filter(a => a.appearance_kind === 'both').length || 0
    
    console.log(`\n🎉 Fixed Enhanced ETL Complete!`)
    console.log(`\n📊 Final Statistics:`)
    console.log(`  Total shows: ${finalShows?.length || 0}`)
    console.log(`  Total people: ${finalPeople?.length || 0}`)
    console.log(`  Total appearances: ${finalAppearances?.length || 0}`)
    console.log(`  Main cast only: ${mainOnly}`)
    console.log(`  Guest stars only: ${guestOnly}`)
    console.log(`  Both main & guest: ${both}`)
    
    return {
      shows: finalShows?.length || 0,
      people: finalPeople?.length || 0,
      appearances: finalAppearances?.length || 0,
      mainOnly,
      guestOnly,
      both
    }
    
  } catch (error) {
    console.error('❌ Fixed Enhanced ETL failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  fixedEnhancedETL()
    .then(stats => {
      console.log('\n🎯 ETL Success! Data integrity maintained.')
      console.log(`   Ready for eligibility calculation with ${stats.appearances} appearances`)
      process.exit(0)
    })
    .catch(error => {
      console.error('ETL failed:', error)
      process.exit(1)
    })
}

export { fixedEnhancedETL }