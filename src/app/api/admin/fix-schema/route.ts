import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Fixing gwb_daily table schema...')
    
    // First, let's see what columns exist by selecting all
    console.log('Checking existing columns...')
    const { data: existingData, error: selectError } = await supabase
      .from('gwb_daily')
      .select('*')
      .limit(1)
    
    console.log('Existing data:', existingData)
    if (selectError) {
      console.log('Select error:', selectError)
    }
    
    // Instead of using RPC, let's use raw SQL via a stored procedure approach
    // We'll create the columns we need by using ALTER TABLE
    
    // Try to add missing columns
    const alterStatements = [
      "ALTER TABLE gwb_daily ADD COLUMN IF NOT EXISTS image_path TEXT",
      "ALTER TABLE gwb_daily ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"
    ]
    
    const results = []
    for (const stmt of alterStatements) {
      try {
        // We'll do this by creating a function and calling it
        const funcName = `temp_alter_${Date.now()}`
        
        // Create temporary function
        const createFuncSQL = `
          CREATE OR REPLACE FUNCTION ${funcName}()
          RETURNS TEXT
          LANGUAGE plpgsql
          SECURITY DEFINER
          AS $$
          BEGIN
            EXECUTE '${stmt}';
            RETURN 'success';
          END;
          $$;
        `
        
        const { error: createError } = await supabase.rpc('sql', { query: createFuncSQL })
        if (createError) {
          console.log(`Create function error for ${stmt}:`, createError)
          results.push({ statement: stmt, error: createError.message })
          continue
        }
        
        // Call the function
        const { data: funcData, error: funcError } = await supabase.rpc(funcName)
        if (funcError) {
          console.log(`Function call error for ${stmt}:`, funcError)
          results.push({ statement: stmt, error: funcError.message })
        } else {
          console.log(`Success for ${stmt}`)
          results.push({ statement: stmt, success: true })
        }
        
        // Drop the temporary function
        await supabase.rpc('sql', { query: `DROP FUNCTION IF EXISTS ${funcName}()` })
        
      } catch (err) {
        console.log(`Error with ${stmt}:`, err)
        results.push({ statement: stmt, error: String(err) })
      }
    }
    
    // Now test inserting our test data
    console.log('Testing insert after schema fix...')
    const testRow = {
      date_utc: new Date().toISOString().split('T')[0],
      person_tmdb_id: 12345,
      person_name: 'Test Person After Fix',
      image_path: 'test/path/after-fix.jpg'
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from('gwb_daily')
      .upsert(testRow, { onConflict: 'date_utc' })
      .select()
    
    console.log('Insert test result:', insertData, insertError)
    
    return NextResponse.json({
      schema_fix_results: results,
      insert_test_success: !insertError,
      insert_error: insertError?.message || null,
      test_data: insertData
    })
    
  } catch (error) {
    console.error('Schema fix failed:', error)
    return NextResponse.json({ error: 'Schema fix failed', details: error }, { status: 500 })
  }
}