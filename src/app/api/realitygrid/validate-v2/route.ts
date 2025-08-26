import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { puzzle_id, r, c, person_id } = body
    
    if (!puzzle_id || r === undefined || c === undefined || !person_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // Get the puzzle to find show IDs
    const { data: puzzle, error: puzzleError } = await supabase
      .from('rg_daily_puzzles')
      .select('row_show_ids, col_show_ids')
      .eq('id', puzzle_id)
      .single()
    
    if (puzzleError || !puzzle) {
      return NextResponse.json(
        { error: 'Invalid puzzle ID' },
        { status: 404 }
      )
    }
    
    const rowShowId = puzzle.row_show_ids[r]
    const colShowId = puzzle.col_show_ids[c]
    
    if (!rowShowId || !colShowId) {
      return NextResponse.json(
        { error: 'Invalid cell coordinates' },
        { status: 400 }
      )
    }
    
    // Use the Supabase function for validation
    const { data: isCorrect, error: validError } = await supabase
      .rpc('rg_is_valid_cell_answer', {
        p_person_id: person_id,
        p_row_show_id: rowShowId,
        p_col_show_id: colShowId
      })
    
    if (validError) {
      throw validError
    }
    
    return NextResponse.json({ is_correct: isCorrect })
  } catch (error) {
    console.error('Validation error:', error)
    return NextResponse.json(
      { error: 'Failed to validate answer' },
      { status: 500 }
    )
  }
}