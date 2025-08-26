import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')
    
    if (!query || query.length < 2) {
      return NextResponse.json([])
    }
    
    // Search for eligible people only
    const { data, error } = await supabase
      .from('rg_people')
      .select('id, name, profile_path, show_count')
      .eq('is_valid', true)
      .ilike('name', `%${query}%`)
      .order('show_count', { ascending: false })
      .limit(10)
    
    if (error) {
      throw error
    }
    
    const results = data?.map(person => ({
      id: person.id,
      name: person.name,
      profile_url: person.profile_path 
        ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
        : null,
      show_count: person.show_count || 0
    })) || []
    
    return NextResponse.json(results)
  } catch (error) {
    console.error('Typeahead error:', error)
    return NextResponse.json(
      { error: 'Failed to search people' },
      { status: 500 }
    )
  }
}