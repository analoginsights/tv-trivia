import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export type Show = {
  id: number
  name: string
  poster_path: string | null
  popularity_rank: number
}

export type Person = {
  id: number
  name: string
  profile_path: string | null
  show_count?: number
  is_valid?: boolean
}

export type Appearance = {
  show_id: number
  person_id: number
}

export type DailyPuzzle = {
  id: string
  date: string
  row_show_ids: number[]
  col_show_ids: number[]
  seed: string
  created_at: string
}

export type DailyCell = {
  puzzle_id: string
  row_idx: number
  col_idx: number
  answer_count: number
}

// GuessWho types
export type GWBPerson = {
  id: number
  full_name: string
  first_name: string | null
  last_name: string | null
  aliases: string[] | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type GWBSeries = {
  id: number
  name: string
  franchise: string | null
  network: string
  created_at: string
}

export type GWBAppearance = {
  id: number
  person_id: number
  series_id: number
  role: 'main' | 'guest' | 'friend'
  first_air_date: string | null
  seasons: number[] | null
  created_at: string
}

export type GWBDaily = {
  date_utc: string
  person_id: number
  created_at: string
}

export type GWBGuess = {
  id: number
  play_date_utc: string
  client_id: string
  guess_order: number
  value: string
  is_correct: boolean
  elapsed_ms: number
  created_at: string
}