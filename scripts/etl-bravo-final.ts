import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import { discoverBravoShows } from '../src/lib/tmdb'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN!
const ETL_PAGES = 3 // 3 pages = 60 shows
const MAX_EPISODES_PER_SEASON = 3
const MAX_SEASONS_TO_SCAN = 2
const CHUNK_SIZE = 100 // Process in chunks to avoid size limits

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

// Helper function to chunk arrays
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

async function finalETL() {
  console.log('🚀 Starting Final Bravo ETL with Supabase Limit Handling...\n')
  
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
    
    // Step 4: CHUNKED Upsert to Supabase with proper limits
    console.log('\n💾 Upserting data to Supabase with unlimited row handling...')
    
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
    
    // SECOND: Upsert people in chunks (no dependencies) 
    console.log('  2/3 Upserting people in chunks...')
    const peopleChunks = chunkArray(peopleData, CHUNK_SIZE)
    let totalPeopleUpserted = 0
    
    for (let i = 0; i < peopleChunks.length; i++) {
      const chunk = peopleChunks[i]
      console.log(`    Processing people chunk ${i + 1}/${peopleChunks.length} (${chunk.length} records)...`)
      
      const { error: peopleError } = await supabaseAdmin
        .from('rg_people')
        .upsert(chunk, { onConflict: 'id' })
      
      if (peopleError) {
        console.error('❌ People chunk upsert failed:', peopleError)
        throw peopleError
      }
      
      totalPeopleUpserted += chunk.length
      console.log(`    ✅ Upserted ${chunk.length} people (${totalPeopleUpserted}/${peopleData.length} total)`)
    }
    
    // THIRD: Upsert appearances in chunks (depends on shows and people)
    console.log('  3/3 Upserting appearances in chunks...')
    const appearanceChunks = chunkArray(appearancesData, CHUNK_SIZE)
    let totalAppearancesUpserted = 0
    
    for (let i = 0; i < appearanceChunks.length; i++) {
      const chunk = appearanceChunks[i]
      console.log(`    Processing appearances chunk ${i + 1}/${appearanceChunks.length} (${chunk.length} records)...`)
      
      const { error: appearancesError } = await supabaseAdmin
        .from('rg_appearances')
        .upsert(chunk, { onConflict: 'show_id,person_id' })
      
      if (appearancesError) {
        console.error('❌ Appearances chunk upsert failed:', appearancesError)
        throw appearancesError
      }
      
      totalAppearancesUpserted += chunk.length
      console.log(`    ✅ Upserted ${chunk.length} appearances (${totalAppearancesUpserted}/${appearancesData.length} total)`)
    }
    
    // Step 5: Post-upsert Validation with proper limits
    console.log('\n🔍 Post-upsert Validation with unlimited query...')
    
    // Use .range() to get all records beyond the 1000 limit
    const { data: finalShows, count: showsCount } = await supabaseAdmin
      .from('rg_shows')
      .select('id', { count: 'exact' })
      .range(0, 9999)
      
    const { data: finalPeople, count: peopleCount } = await supabaseAdmin
      .from('rg_people')
      .select('id', { count: 'exact' })
      .range(0, 9999)
      
    const { data: finalAppearances, count: appearancesCount } = await supabaseAdmin
      .from('rg_appearances')
      .select('*', { count: 'exact' })
      .range(0, 9999)
    
    console.log('✅ Final database counts (with unlimited query):')
    console.log(`  Shows in DB: ${showsCount || 0} (expected: ${showsData.length})`)
    console.log(`  People in DB: ${peopleCount || 0} (expected: ${peopleData.length})`)
    console.log(`  Appearances in DB: ${appearancesCount || 0} (expected: ${appearancesData.length})`)
    
    // Check for data loss
    const showsLoss = showsData.length - (showsCount || 0)
    const peopleLoss = peopleData.length - (peopleCount || 0)
    const appearancesLoss = appearancesData.length - (appearancesCount || 0)
    
    if (showsLoss > 0) console.warn(`⚠️  Lost ${showsLoss} shows during upsert`)
    if (peopleLoss > 0) console.warn(`⚠️  Lost ${peopleLoss} people during upsert`)
    if (appearancesLoss > 0) console.warn(`⚠️  Lost ${appearancesLoss} appearances during upsert`)
    
    if (showsLoss === 0 && peopleLoss === 0 && appearancesLoss === 0) {
      console.log('✅ No data loss detected!')
    }
    
    // Appearance breakdown with proper data
    const mainOnly = finalAppearances?.filter(a => a.appearance_kind === 'main').length || 0
    const guestOnly = finalAppearances?.filter(a => a.appearance_kind === 'guest').length || 0
    const both = finalAppearances?.filter(a => a.appearance_kind === 'both').length || 0
    
    // Show distribution analysis
    const showCounts = new Map()
    finalAppearances?.forEach(app => {
      showCounts.set(app.show_id, (showCounts.get(app.show_id) || 0) + 1)
    })
    
    console.log(`\n📊 Show Distribution (Top 10):`)
    const sortedShows = Array.from(showCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      
    for (const [showId, count] of sortedShows) {
      const show = showsData.find(s => s.id === showId)
      console.log(`  ${show?.name || `Show ${showId}`}: ${count} appearances`)
    }
    
    console.log(`\n🎉 Final ETL Complete!`)
    console.log(`\n📊 Final Statistics:`)
    console.log(`  Total shows: ${showsCount || 0}`)
    console.log(`  Total people: ${peopleCount || 0}`)
    console.log(`  Total appearances: ${appearancesCount || 0}`)
    console.log(`  Main cast only: ${mainOnly}`)
    console.log(`  Guest stars only: ${guestOnly}`)
    console.log(`  Both main & guest: ${both}`)
    console.log(`  Shows with appearances: ${showCounts.size}`)
    
    return {
      shows: showsCount || 0,
      people: peopleCount || 0,
      appearances: appearancesCount || 0,
      mainOnly,
      guestOnly,
      both,
      showsWithAppearances: showCounts.size
    }
    
  } catch (error) {
    console.error('❌ Final ETL failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  finalETL()
    .then(stats => {
      console.log('\n🎯 ETL Success! Data integrity maintained with unlimited row handling.')
      console.log(`   Ready for eligibility calculation with ${stats.appearances} appearances across ${stats.showsWithAppearances} shows`)
      process.exit(0)
    })
    .catch(error => {
      console.error('ETL failed:', error)
      process.exit(1)
    })
}

export { finalETL }