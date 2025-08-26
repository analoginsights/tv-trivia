import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'
import { discoverBravoShows, getShowCredits } from '../src/lib/tmdb'

const ETL_PAGES = 3 // Start with 3 pages for testing

async function extractAndCacheBravoData() {
  console.log('Starting Bravo ETL process...')
  
  const allShows = new Map<number, any>()
  const allPeople = new Map<number, any>()
  const allAppearances = new Set<string>()
  
  // Step 1: Discover Bravo shows
  console.log(`Fetching ${ETL_PAGES} pages of Bravo shows...`)
  for (let page = 1; page <= ETL_PAGES; page++) {
    console.log(`Fetching page ${page}...`)
    const shows = await discoverBravoShows(page)
    
    shows.forEach((show, idx) => {
      allShows.set(show.id, {
        id: show.id,
        name: show.name,
        poster_path: show.poster_path,
        popularity_rank: (page - 1) * 20 + idx + 1
      })
    })
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  
  console.log(`Found ${allShows.size} Bravo shows`)
  
  // Step 2: Fetch cast for each show
  console.log('Fetching cast data for each show...')
  let showCount = 0
  
  for (const [showId, show] of allShows) {
    showCount++
    console.log(`[${showCount}/${allShows.size}] Fetching cast for: ${show.name}`)
    
    try {
      const credits = await getShowCredits(showId)
      
      credits.cast.forEach(person => {
        allPeople.set(person.id, {
          id: person.id,
          name: person.name,
          profile_path: person.profile_path
        })
        
        allAppearances.add(`${showId}-${person.id}`)
      })
    } catch (error) {
      console.error(`Failed to fetch credits for show ${showId}:`, error)
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  
  console.log(`Found ${allPeople.size} unique people`)
  console.log(`Found ${allAppearances.size} appearances`)
  
  // Step 3: Upsert to Supabase
  console.log('Upserting data to Supabase...')
  
  // Upsert shows
  const showsData = Array.from(allShows.values())
  const { error: showsError } = await supabaseAdmin
    .from('rg_shows')
    .upsert(showsData, { onConflict: 'id' })
  
  if (showsError) {
    console.error('Error upserting shows:', showsError)
    throw showsError
  }
  console.log(`Upserted ${showsData.length} shows`)
  
  // Upsert people
  const peopleData = Array.from(allPeople.values())
  const { error: peopleError } = await supabaseAdmin
    .from('rg_people')
    .upsert(peopleData, { onConflict: 'id' })
  
  if (peopleError) {
    console.error('Error upserting people:', peopleError)
    throw peopleError
  }
  console.log(`Upserted ${peopleData.length} people`)
  
  // Upsert appearances
  const appearancesData = Array.from(allAppearances).map(key => {
    const [showId, personId] = key.split('-').map(Number)
    return { show_id: showId, person_id: personId }
  })
  
  const { error: appearancesError } = await supabaseAdmin
    .from('rg_appearances')
    .upsert(appearancesData, { onConflict: 'show_id,person_id' })
  
  if (appearancesError) {
    console.error('Error upserting appearances:', appearancesError)
    throw appearancesError
  }
  console.log(`Upserted ${appearancesData.length} appearances`)
  
  console.log('ETL process complete!')
  
  // Return statistics
  return {
    shows: showsData.length,
    people: peopleData.length,
    appearances: appearancesData.length
  }
}

// Run if executed directly
if (require.main === module) {
  extractAndCacheBravoData()
    .then(stats => {
      console.log('\n=== ETL Statistics ===')
      console.log(`Shows cached: ${stats.shows}`)
      console.log(`People cached: ${stats.people}`)
      console.log(`Appearances cached: ${stats.appearances}`)
      process.exit(0)
    })
    .catch(error => {
      console.error('ETL failed:', error)
      process.exit(1)
    })
}

export { extractAndCacheBravoData }