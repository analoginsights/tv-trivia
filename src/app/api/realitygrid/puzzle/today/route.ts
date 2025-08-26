import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Get today's puzzle
    const today = new Date().toISOString().split('T')[0]
    
    const { data: puzzle, error: puzzleError } = await supabase
      .from('rg_daily_puzzles')
      .select('*')
      .eq('date', today)
      .single()
    
    if (puzzleError || !puzzle) {
      return NextResponse.json(
        { error: 'No puzzle found for today' },
        { status: 404 }
      )
    }
    
    // Get show details
    const allShowIds = [...puzzle.row_show_ids, ...puzzle.col_show_ids]
    const { data: shows, error: showsError } = await supabase
      .from('rg_shows')
      .select('id, name, poster_path')
      .in('id', allShowIds)
    
    if (showsError) {
      throw showsError
    }
    
    const showsMap = new Map(shows?.map(s => [s.id, s]) || [])
    
    // Get cell data
    const { data: cells, error: cellsError } = await supabase
      .from('rg_daily_cells')
      .select('row_idx, col_idx, answer_count')
      .eq('puzzle_id', puzzle.id)
      .order('row_idx')
      .order('col_idx')
    
    if (cellsError) {
      throw cellsError
    }
    
    // Format response
    const response = {
      puzzle_id: puzzle.id,
      date: puzzle.date,
      rows: puzzle.row_show_ids.map(id => ({
        id,
        name: showsMap.get(id)?.name || 'Unknown',
        poster_path: showsMap.get(id)?.poster_path || null
      })),
      cols: puzzle.col_show_ids.map(id => ({
        id,
        name: showsMap.get(id)?.name || 'Unknown',
        poster_path: showsMap.get(id)?.poster_path || null
      })),
      cells: cells?.map(c => ({
        row: c.row_idx,
        col: c.col_idx,
        answer_count: c.answer_count
      })) || [],
      rules: {
        max_wrong: 9
      }
    }
    
    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching puzzle:', error)
    return NextResponse.json(
      { error: 'Failed to fetch puzzle' },
      { status: 500 }
    )
  }
}