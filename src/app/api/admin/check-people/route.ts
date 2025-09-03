import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Checking gwb_people table...')
    
    // Check what's in gwb_people
    const { data: peopleData, error: peopleError } = await supabase
      .from('gwb_people')
      .select('*')
      .limit(10)
    
    console.log('People data:', peopleData)
    console.log('People error:', peopleError)
    
    return NextResponse.json({
      people_sample: peopleData || [],
      people_count: peopleData?.length || 0,
      error: peopleError?.message || null
    })
    
  } catch (error) {
    console.error('Check failed:', error)
    return NextResponse.json({ error: 'Check failed', details: error }, { status: 500 })
  }
}