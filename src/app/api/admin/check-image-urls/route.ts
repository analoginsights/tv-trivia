import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Checking image URLs in gwb_people...')
    
    // Get sample image URLs
    const { data: people, error } = await supabase
      .from('gwb_people')
      .select('id, full_name, image_url')
      .limit(5)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Test each URL
    const results = []
    for (const person of people) {
      try {
        console.log(`Testing ${person.full_name}: ${person.image_url}`)
        const response = await fetch(person.image_url, { method: 'HEAD' })
        results.push({
          id: person.id,
          name: person.full_name,
          url: person.image_url,
          status: response.status,
          working: response.ok
        })
      } catch (err) {
        results.push({
          id: person.id,
          name: person.full_name,
          url: person.image_url,
          status: 'error',
          working: false,
          error: String(err)
        })
      }
    }
    
    return NextResponse.json({
      sample_urls: results,
      total_tested: results.length,
      working_count: results.filter(r => r.working).length
    })
    
  } catch (error) {
    console.error('Check failed:', error)
    return NextResponse.json({ error: 'Check failed', details: String(error) }, { status: 500 })
  }
}