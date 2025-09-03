import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Creating new daily puzzle table...')
    
    // Create a new table with a different name
    const tableName = 'gwb_daily_new'
    
    // Use the direct table creation approach (this should work with Supabase)
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', tableName)
      .limit(1)
    
    console.log('Checking if table exists:', data, error)
    
    // Since direct SQL doesn't work, let's try creating via raw INSERT
    // We'll insert a row and let Supabase infer the schema
    const testInsert = {
      date_utc: '2025-08-27',
      person_tmdb_id: 999999,
      person_name: 'Schema Test Person',
      image_path: 'schema/test/path.jpg'
    }
    
    console.log('Attempting to create table by inserting data...')
    const { data: insertData, error: insertError } = await supabase
      .from(tableName)
      .insert(testInsert)
      .select()
    
    if (insertError) {
      console.log('Insert error (expected):', insertError.message)
      
      // Table doesn't exist, we need to create it manually
      // Let's try a different approach - use the existing table structure
      // but modify our API to handle the column differences
      
      return NextResponse.json({
        message: 'Will use existing table structure with API adaptations',
        existing_table: 'gwb_daily',
        existing_columns: ['date_utc', 'person_id', 'created_at'],
        approach: 'modify_api_to_match_existing_schema'
      })
    }
    
    console.log('New table created successfully:', insertData)
    
    return NextResponse.json({
      success: true,
      table_created: tableName,
      test_data: insertData
    })
    
  } catch (error) {
    console.error('Table creation failed:', error)
    return NextResponse.json({ error: 'Table creation failed', details: error }, { status: 500 })
  }
}