import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { client_id, play_date, guess_text, elapsed_ms } = body

    if (!client_id || !play_date || typeof elapsed_ms !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Allow empty guess_text for "I Don't Know" submissions
    if (typeof guess_text !== 'string') {
      return NextResponse.json({ error: 'Invalid guess format' }, { status: 400 })
    }

    // Get today's puzzle with person details
    const { data: dailyData, error: dailyError } = await supabase
      .from('gwb_daily')
      .select(`
        person_id,
        gwb_people!inner (
          full_name
        )
      `)
      .eq('date_utc', play_date)
      .single()

    if (dailyError || !dailyData) {
      return NextResponse.json({ error: 'No puzzle found for date' }, { status: 404 })
    }

    // Get existing guesses for this client/date
    const { data: existingGuesses, error: guessError } = await supabase
      .from('gwb_guesses')
      .select('guess_order, is_correct')
      .eq('play_date_utc', play_date)
      .eq('client_id', client_id)
      .order('guess_order', { ascending: true })

    if (guessError) {
      return NextResponse.json({ error: 'Failed to fetch guesses' }, { status: 500 })
    }

    // Check if already won
    const hasWon = existingGuesses?.some(g => g.is_correct)
    if (hasWon) {
      return NextResponse.json({ error: 'Already completed' }, { status: 400 })
    }

    // Check if out of guesses
    const guessesUsed = existingGuesses?.length || 0
    if (guessesUsed >= 6) {
      return NextResponse.json({ error: 'No more guesses allowed' }, { status: 400 })
    }

    // Validate guess
    const correctName = dailyData.gwb_people.full_name.toLowerCase().trim()
    const userGuess = guess_text.toLowerCase().trim()
    
    // If empty guess (I Don't Know), it's always incorrect
    let isCorrect: boolean
    if (userGuess === '') {
      isCorrect = false
    } else {
      // Improved name matching logic
      const correctNameParts = correctName.split(' ')
      const userGuessParts = userGuess.split(' ')
      
      isCorrect = 
        // Exact match
        correctName === userGuess ||
        // Full name contains the guess (but not too short to avoid false positives)
        (userGuess.length >= 3 && correctName.includes(userGuess)) ||
        // First name exact match
        correctNameParts[0] === userGuess ||
        // Last name exact match  
        correctNameParts[correctNameParts.length - 1] === userGuess ||
        // Both first and last name provided and match
        (userGuessParts.length >= 2 && 
         correctNameParts[0] === userGuessParts[0] && 
         correctNameParts[correctNameParts.length - 1] === userGuessParts[userGuessParts.length - 1])
    }

    const nextGuessOrder = guessesUsed + 1

    // Insert guess
    const { error: insertError } = await supabase
      .from('gwb_guesses')
      .insert({
        play_date_utc: play_date,
        client_id,
        guess_order: nextGuessOrder,
        value: guess_text,
        is_correct: isCorrect,
        elapsed_ms
      })

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save guess' }, { status: 500 })
    }

    const response = {
      correct: isCorrect,
      answer: isCorrect ? dailyData.gwb_people.full_name : null,
      guesses_used: nextGuessOrder,
      guesses_left: 6 - nextGuessOrder,
      max_guesses: 6,
      is_game_over: isCorrect || nextGuessOrder >= 6,
      message: isCorrect 
        ? `Correct! It's ${dailyData.gwb_people.full_name}` 
        : nextGuessOrder >= 6 
        ? `Game over! The answer was ${dailyData.gwb_people.full_name}`
        : `Incorrect. ${6 - nextGuessOrder} guesses remaining.`
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Guess API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}