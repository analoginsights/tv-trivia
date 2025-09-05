import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')
    
    // Get today's daily person with person details
    const { data: dailyData, error: dailyError } = await supabase
      .from('gwb_daily')
      .select(`
        date_utc,
        person_id,
        gwb_people!inner (
          id,
          full_name,
          image_url
        )
      `)
      .eq('date_utc', today)
      .single()
    
    if (dailyError || !dailyData) {
      console.log('No daily puzzle found for today')
      return new NextResponse(null, { status: 204 })
    }
    
    // Handle case where gwb_people might be an array
    const person = Array.isArray(dailyData.gwb_people) 
      ? dailyData.gwb_people[0] 
      : dailyData.gwb_people
    
    if (!person) {
      console.log('Person data not found')
      return new NextResponse(null, { status: 204 })
    }
    
    // Use the image URL from the database or fallback to storage
    let imageUrl = person.image_url
    
    if (!imageUrl) {
      // Fallback to storage bucket if no image_url in database
      const storagePath = `bravo/people/${person.id}/${dailyData.date_utc}.jpg`
      const { data: imageData } = supabase.storage
        .from('gwb')
        .getPublicUrl(storagePath)
      imageUrl = imageData.publicUrl
    }
    
    // If it's an external image that needs proxying for CORS
    if (imageUrl && imageUrl.includes('tmdb.org')) {
      imageUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
    }
    // Placeholder services already handle CORS, no proxy needed
    
    console.log(`Serving image: ${imageUrl}`)
    
    // Check if client has already played this puzzle
    let gameStatus = null
    if (clientId) {
      const { data: guesses } = await supabase
        .from('gwb_guesses')
        .select('guess_order, is_correct')
        .eq('play_date_utc', today)
        .eq('client_id', clientId)
        .order('guess_order', { ascending: true })
      
      if (guesses && guesses.length > 0) {
        const hasWon = guesses.some(g => g.is_correct)
        const guessesUsed = guesses.length
        
        gameStatus = {
          already_played: true,
          has_won: hasWon,
          guesses_used: guessesUsed,
          is_complete: hasWon || guessesUsed >= 6
        }
      }
    }
    
    const response = {
      date: dailyData.date_utc,
      person: {
        id: person.id,
        full_name: person.full_name,
        image_urls: {
          original: imageUrl,
          progressive: [
            `${imageUrl}#blur-18`,
            `${imageUrl}#blur-15`, 
            `${imageUrl}#blur-12`,
            `${imageUrl}#blur-9`,
            `${imageUrl}#blur-6`,
            `${imageUrl}#blur-3`,
            `${imageUrl}#blur-0`
          ]
        }
      },
      reveal_schedule_seconds: [18, 15, 12, 9, 6, 3, 0],
      total_time_seconds: 20,
      max_guesses: 6,
      game_status: gameStatus
    }
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('Error fetching daily puzzle:', error)
    return NextResponse.json(
      { error: 'Failed to fetch daily puzzle' },
      { status: 500 }
    )
  }
}