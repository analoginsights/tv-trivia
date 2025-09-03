import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Debugging Supabase setup...')
    
    // Check buckets
    console.log('Checking storage buckets...')
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
    if (bucketError) {
      console.error('Bucket list error:', bucketError)
    } else {
      console.log('Available buckets:', buckets.map(b => b.name))
    }
    
    // Check existing gwb_daily table structure
    console.log('Checking gwb_daily table...')
    const { data: dailyData, error: dailyError } = await supabase
      .from('gwb_daily')
      .select('*')
      .limit(1)
    
    if (dailyError) {
      console.error('Daily table error:', dailyError)
    } else {
      console.log('Daily table data:', dailyData)
    }
    
    // Try to insert test data
    console.log('Testing insert to gwb_daily...')
    const testRow = {
      date_utc: new Date().toISOString().split('T')[0],
      person_tmdb_id: 12345,
      person_name: 'Test Person',
      image_path: 'test/path.jpg'
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from('gwb_daily')
      .upsert(testRow, { onConflict: 'date_utc' })
      .select()
    
    if (insertError) {
      console.error('Insert error:', insertError)
    } else {
      console.log('Insert successful:', insertData)
    }
    
    return NextResponse.json({
      buckets: buckets?.map(b => b.name) || [],
      daily_table_test: !dailyError,
      insert_test: !insertError,
      errors: {
        bucket: bucketError?.message,
        daily: dailyError?.message,
        insert: insertError?.message
      }
    })
    
  } catch (error) {
    console.error('Debug failed:', error)
    return NextResponse.json({ error: 'Debug failed', details: error }, { status: 500 })
  }
}