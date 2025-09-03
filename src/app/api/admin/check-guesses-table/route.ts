import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Checking gwb_guesses table...')
    
    // Try to query the table
    const { data: guessData, error: guessError } = await supabase
      .from('gwb_guesses')
      .select('*')
      .limit(5)
    
    console.log('Guess data:', guessData)
    console.log('Guess error:', guessError)
    
    return NextResponse.json({
      guesses_exist: !guessError,
      sample_guesses: guessData || [],
      error: guessError?.message || null
    })
    
  } catch (error) {
    console.error('Check failed:', error)
    return NextResponse.json({ error: 'Check failed', details: error }, { status: 500 })
  }
}