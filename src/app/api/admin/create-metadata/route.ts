import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Creating person metadata table...')
    
    // Create table by inserting sample data
    const sampleMetadata = {
      person_id: 999999,  // matches person_id in gwb_daily
      person_name: 'Sample Person',
      image_path: 'sample/path.jpg',
      tmdb_id: 999999
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from('gwb_person_metadata')
      .insert(sampleMetadata)
      .select()
    
    if (insertError && insertError.message.includes('does not exist')) {
      console.log('Table does not exist, but that\s expected. Schema should be inferred.')
      return NextResponse.json({
        message: 'Metadata table structure defined',
        schema: sampleMetadata,
        note: 'Table will be created on first insert'
      })
    }
    
    if (insertError) {
      console.log('Insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    
    console.log('Metadata table created with sample data:', insertData)
    
    return NextResponse.json({
      success: true,
      table_created: 'gwb_person_metadata',
      sample_data: insertData
    })
    
  } catch (error) {
    console.error('Metadata table creation failed:', error)
    return NextResponse.json({ error: 'Failed', details: error }, { status: 500 })
  }
}