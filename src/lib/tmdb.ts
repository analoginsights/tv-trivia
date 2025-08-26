const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN!
const TMDB_LANG = process.env.TMDB_LANG || 'en-US'
const BRAVO_NETWORK_ID = 74

export interface TMDBShow {
  id: number
  name: string
  poster_path: string | null
  popularity: number
}

export interface TMDBPerson {
  id: number
  name: string
  profile_path: string | null
}

export interface TMDBCredits {
  cast: TMDBPerson[]
}

async function tmdbFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })
  }
  
  const response = await fetch(url.toString(), {
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

export async function discoverBravoShows(page: number = 1): Promise<TMDBShow[]> {
  const data = await tmdbFetch<{ results: TMDBShow[] }>('/discover/tv', {
    with_networks: String(BRAVO_NETWORK_ID),
    include_adult: 'false',
    language: TMDB_LANG,
    sort_by: 'popularity.desc',
    page: String(page)
  })
  
  return data.results
}

export async function getShowCredits(tvId: number): Promise<TMDBCredits> {
  try {
    return await tmdbFetch<TMDBCredits>(`/tv/${tvId}/aggregate_credits`, {
      language: TMDB_LANG
    })
  } catch (error) {
    console.log(`Falling back to regular credits for show ${tvId}`)
    return await tmdbFetch<TMDBCredits>(`/tv/${tvId}/credits`, {
      language: TMDB_LANG
    })
  }
}