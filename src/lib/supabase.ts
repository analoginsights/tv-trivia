import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE!

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