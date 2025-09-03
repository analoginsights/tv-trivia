import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Inspecting database structure...')
    
    // Get all tables
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .like('table_name', 'gwb%')
    
    console.log('GWB tables:', tables)
    
    // Get columns for gwb_daily if it exists
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_schema', 'public')
      .eq('table_name', 'gwb_daily')
      .order('ordinal_position')
    
    console.log('gwb_daily columns:', columns)
    
    // Try simple select to see what data exists
    const { data: sampleData, error: sampleError } = await supabase
      .from('gwb_daily')
      .select()
      .limit(3)
    
    console.log('Sample data:', sampleData)
    console.log('Sample error:', sampleError)
    
    return NextResponse.json({
      gwb_tables: tables?.map(t => t.table_name) || [],
      gwb_daily_columns: columns || [],
      sample_data: sampleData || [],
      errors: {
        tables: tablesError?.message,
        columns: columnsError?.message,
        sample: sampleError?.message
      }
    })
    
  } catch (error) {
    console.error('Inspection failed:', error)
    return NextResponse.json({ error: 'Inspection failed', details: error }, { status: 500 })
  }
}