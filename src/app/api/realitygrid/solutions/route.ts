import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { row_show_id, col_show_id } = body
    
    if (!row_show_id || !col_show_id) {
      return NextResponse.json(
        { error: 'Missing required show IDs' },
        { status: 400 }
      )
    }
    
    // Find all people who appear in both shows
    const { data: rowAppearances, error: rowError } = await supabase
      .from('rg_appearances')
      .select('person_id')
      .eq('show_id', row_show_id)
      .range(0, 9999)
    
    if (rowError) throw rowError
    
    const { data: colAppearances, error: colError } = await supabase
      .from('rg_appearances')
      .select('person_id')
      .eq('show_id', col_show_id)
      .range(0, 9999)
    
    if (colError) throw colError
    
    // Find intersection of people
    const rowPeopleIds = new Set(rowAppearances?.map(a => a.person_id) || [])
    const colPeopleIds = new Set(colAppearances?.map(a => a.person_id) || [])
    const intersectionIds = [...rowPeopleIds].filter(id => colPeopleIds.has(id))
    
    if (intersectionIds.length === 0) {
      return NextResponse.json({
        solutions: [],
        count: 0
      })
    }
    
    // Get person details for all solutions
    const { data: people, error: peopleError } = await supabase
      .from('rg_people')
      .select('id, name, profile_path')
      .in('id', intersectionIds)
      .order('name')
    
    if (peopleError) throw peopleError
    
    const solutions = people?.map(person => ({
      id: person.id,
      name: person.name,
      profile_url: person.profile_path 
        ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
        : null
    })) || []
    
    return NextResponse.json({
      solutions,
      count: solutions.length
    })
    
  } catch (error) {
    console.error('Solutions error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch solutions' },
      { status: 500 }
    )
  }
}