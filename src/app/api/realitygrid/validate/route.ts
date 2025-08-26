import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { person_id, row_show_id, column_show_id } = body
    
    if (!person_id || !row_show_id || !column_show_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // Check if person appears in both shows
    const { data: appearances, error: appearError } = await supabase
      .from('rg_appearances')
      .select('show_id')
      .eq('person_id', person_id)
      .in('show_id', [row_show_id, column_show_id])
    
    if (appearError) {
      throw appearError
    }
    
    const showIds = appearances?.map(a => a.show_id) || []
    const isValid = showIds.includes(row_show_id) && showIds.includes(column_show_id)
    
    return NextResponse.json({ valid: isValid })
  } catch (error) {
    console.error('Validation error:', error)
    return NextResponse.json(
      { error: 'Failed to validate answer' },
      { status: 500 }
    )
  }
}