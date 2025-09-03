import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

/**
 * Fetch top 300 people who appear in >=1 Bravo (network 74) show,
 * where appearances on show id 22980 DO NOT count toward that >=1.
 * Then populate the gwb_people table with the results.
 */

const TMDB = 'https://api.themoviedb.org/3'
const NETWORK_ID = 74     // Bravo
const EXCLUDE_SHOW_ID = 22980
const MAX_PEOPLE = 300

// Tune these if needed
const DISCOVER_PAGES = 'ALL'   // number or 'ALL' to traverse all pages
const CREDITS_CONCURRENCY = 4  // parallelism for fetching credits

type Show = { id: number; name?: string }
type Castish = { id: number; name: string; popularity?: number; profile_path?: string | null }
type PersonAgg = {
  id: number
  name: string
  popularity: number          // best-known popularity we've seen
  showIds: Set<number>        // qualifying show IDs (excluding EXCLUDE_SHOW_ID)
  profile_path?: string | null
}

async function tmdb(path: string, params: Record<string, any> = {}) {
  const url = new URL(`${TMDB}${path}`)
  const readToken = process.env.TMDB_READ_TOKEN
  const apiKey = process.env.TMDB_API_KEY
  
  if (!readToken && !apiKey) throw new Error('Missing TMDB_READ_TOKEN or TMDB_API_KEY')
  
  // If we have an API key, use it as a query param
  if (apiKey) {
    url.searchParams.set('api_key', apiKey)
  }
  
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  
  // Use Bearer token if we have a read token (preferred)
  const headers: any = {}
  if (readToken) {
    headers['Authorization'] = `Bearer ${readToken}`
    headers['accept'] = 'application/json'
  }
  
  const r = await fetch(url, { 
    cache: 'no-store',
    headers
  })
  
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`TMDB ${path} ${r.status}: ${body}`)
  }
  return r.json()
}

async function discoverBravoShows(): Promise<Show[]> {
  console.log('Discovering Bravo shows...')
  const first = await tmdb('/discover/tv', { with_networks: NETWORK_ID, page: 1 })
  const totalPages = first.total_pages ?? 1
  const pagesToFetch =
    DISCOVER_PAGES === 'ALL' ? totalPages : Math.min(Number(DISCOVER_PAGES), totalPages)
  
  console.log(`Fetching ${pagesToFetch} pages of shows...`)
  const shows: Show[] = (first.results ?? []).map((s: any) => ({ id: s.id, name: s.name }))
  
  for (let p = 2; p <= pagesToFetch; p++) {
    process.stdout.write(`\rFetching page ${p}/${pagesToFetch}...`)
    const d = await tmdb('/discover/tv', { with_networks: NETWORK_ID, page: p })
    ;(d.results ?? []).forEach((s: any) => shows.push({ id: s.id, name: s.name }))
  }
  console.log('')
  
  // Ensure the excluded show is removed even if discover returns it
  const filtered = shows.filter(s => s.id !== EXCLUDE_SHOW_ID)
  console.log(`Found ${filtered.length} qualifying shows (excluding show ${EXCLUDE_SHOW_ID})`)
  return filtered
}

async function getShowCast(tvId: number): Promise<Castish[]> {
  // Prefer aggregate_credits (includes guest/recurring); fallback to credits
  try {
    const a = await tmdb(`/tv/${tvId}/aggregate_credits`)
    return (a.cast ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      popularity: c.popularity, // usually present
      profile_path: c.profile_path
    }))
  } catch {
    const c = await tmdb(`/tv/${tvId}/credits`)
    return (c.cast ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      popularity: p.popularity,
      profile_path: p.profile_path
    }))
  }
}

async function populateDatabase(people: PersonAgg[]) {
  console.log('\nPopulating database...')
  
  // First, clear existing records
  console.log('Clearing existing records...')
  const { error: deleteError } = await supabaseAdmin
    .from('gwb_people')
    .delete()
    .gte('id', 0) // Delete all records
  
  if (deleteError) {
    console.error('Error clearing existing records:', deleteError)
    throw deleteError
  }
  
  // Prepare data for insertion
  const records = people.map(p => ({
    id: p.id, // Use TMDB ID as the primary key
    full_name: p.name,
    first_name: p.name.split(' ')[0],
    last_name: p.name.split(' ').slice(1).join(' ') || null,
    image_url: p.profile_path 
      ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
      : `https://via.placeholder.com/500x750.jpg?text=${encodeURIComponent(p.name)}`,
    is_active: true,
    aliases: [p.name.split(' ')[0]] // Just first name as alias for now
  }))
  
  // Insert in batches of 50 to avoid timeouts
  const batchSize = 50
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, Math.min(i + batchSize, records.length))
    process.stdout.write(`\rInserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(records.length/batchSize)}...`)
    
    const { error: insertError } = await supabaseAdmin
      .from('gwb_people')
      .insert(batch)
    
    if (insertError) {
      console.error('\nError inserting batch:', insertError)
      throw insertError
    }
  }
  
  console.log('\n✅ Successfully populated gwb_people table with', records.length, 'people')
}

async function main() {
  try {
    // 1) All Bravo shows (excluding 22980)
    const shows = await discoverBravoShows()
    const showIds = [...new Set(shows.map(s => s.id))]
    
    // 2) Fetch credits for each show, with small concurrency
    console.log(`\nFetching cast for ${showIds.length} shows...`)
    const queue = [...showIds]
    const people: Map<number, PersonAgg> = new Map()
    let processed = 0
    
    const workers = Array.from({ length: CREDITS_CONCURRENCY }, async () => {
      while (queue.length) {
        const tvId = queue.shift()!
        const cast = await getShowCast(tvId)
        processed++
        process.stdout.write(`\rProcessed ${processed}/${showIds.length} shows...`)
        
        for (const p of cast) {
          if (!p?.id) continue
          // We only count this show toward eligibility if it's not the excluded show
          const countsToward = tvId !== EXCLUDE_SHOW_ID
          
          const existing = people.get(p.id)
          if (!existing) {
            people.set(p.id, {
              id: p.id,
              name: p.name,
              popularity: p.popularity ?? 0,
              showIds: new Set(countsToward ? [tvId] : []),
              profile_path: p.profile_path
            })
          } else {
            existing.popularity = Math.max(existing.popularity, p.popularity ?? 0)
            if (countsToward) existing.showIds.add(tvId)
            // Keep the profile_path if we have one
            if (p.profile_path && !existing.profile_path) {
              existing.profile_path = p.profile_path
            }
          }
        }
      }
    })
    
    await Promise.all(workers)
    console.log('')
    
    // 3) Filter to people who appear in >=1 qualifying show (i.e., excluding 22980-only)
    const eligible = [...people.values()].filter(p => p.showIds.size >= 1)
    console.log(`Found ${eligible.length} people who appear in >=1 qualifying show`)
    
    // 4) Sort by popularity desc and take top 300
    eligible.sort((a, b) => b.popularity - a.popularity)
    const top = eligible.slice(0, MAX_PEOPLE)
    console.log(`Selected top ${top.length} most popular people`)
    
    // 5) Populate the database
    await populateDatabase(top)
    
    // 6) Also output JSON for reference
    const output = top.slice(0, 10).map(p => ({
      id: p.id,
      name: p.name,
      popularity: Number.isFinite(p.popularity) ? Number(p.popularity.toFixed(4)) : 0,
      qualifying_show_count: p.showIds.size,
      has_image: !!p.profile_path
    }))
    
    console.log('\nTop 10 people for reference:')
    console.log(JSON.stringify(output, null, 2))
    
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main().then(() => {
  console.log('\n✅ Script completed successfully')
  process.exit(0)
})