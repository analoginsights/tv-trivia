'use client'

import { useState, useEffect } from 'react'
import { PixelatedImage, useRevealPixelSize, Typeahead } from '@/lib'

interface DailyPuzzle {
  date: string
  person: {
    id: number
    full_name: string
    image_urls: {
      original: string
      progressive: string[]
    }
  }
  reveal_schedule_seconds: number[]
  total_time_seconds: number
  max_guesses: number
}

interface GameState {
  timeRemaining: number
  guessesUsed: number
  isGameOver: boolean
  hasWon: boolean
  currentGuess: string
  isPaused: boolean
  gameStarted: boolean
}

// Generate a simple client ID for tracking
const getClientId = () => {
  if (typeof window === 'undefined') return 'server'
  
  let clientId = localStorage.getItem('gwb_client_id')
  if (!clientId) {
    clientId = 'gwb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('gwb_client_id', clientId)
  }
  return clientId
}

export default function GuessWho() {
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null)
  const [gameState, setGameState] = useState<GameState>({
    timeRemaining: 20,
    guessesUsed: 0,
    isGameOver: false,
    hasWon: false,
    currentGuess: '',
    isPaused: false,
    gameStarted: false
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  // Mount check for SSR
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Load daily puzzle
  useEffect(() => {
    const loadDailyPuzzle = async () => {
      try {
        const clientId = getClientId()
        const response = await fetch(`/api/gwb/daily?client_id=${encodeURIComponent(clientId)}`)
        
        if (response.status === 204) {
          setError('No daily puzzle available today. Check back later!')
          return
        }
        
        if (!response.ok) {
          throw new Error('Failed to load daily puzzle')
        }
        
        const data = await response.json()
        setPuzzle(data)
        
        // Check if user has already played this puzzle
        if (data.game_status?.already_played) {
          setGameState(prev => ({
            ...prev,
            timeRemaining: data.game_status.has_won ? data.total_time_seconds : 0,
            guessesUsed: data.game_status.guesses_used,
            isGameOver: data.game_status.is_complete,
            hasWon: data.game_status.has_won,
            gameStarted: data.game_status.is_complete
          }))
        } else {
          setGameState(prev => ({
            ...prev,
            timeRemaining: data.total_time_seconds
          }))
        }
      } catch (err) {
        console.error('Error loading puzzle:', err)
        setError('Failed to load today&apos;s puzzle. Please try again later.')
      } finally {
        setIsLoading(false)
      }
    }

    loadDailyPuzzle()
  }, [])

  // Timer logic
  useEffect(() => {
    if (!puzzle || !gameState.gameStarted || gameState.isPaused || gameState.isGameOver) {
      return
    }

    const interval = setInterval(() => {
      setGameState(prev => {
        const newTimeRemaining = Math.max(0, prev.timeRemaining - 0.1)
        
        // Check if time is up
        const timeUp = newTimeRemaining <= 0
        
        return {
          ...prev,
          timeRemaining: newTimeRemaining,
          isGameOver: timeUp ? true : prev.isGameOver,
          hasWon: timeUp ? false : prev.hasWon
        }
      })
    }, 100)

    return () => clearInterval(interval)
  }, [puzzle, gameState.gameStarted, gameState.isPaused, gameState.isGameOver])

  // Get current pixelation level based on time remaining
  const currentPixelSize = useRevealPixelSize(gameState.timeRemaining)

  const startGame = () => {
    setGameState(prev => ({ ...prev, gameStarted: true }))
  }

  const submitGuess = async (guessText: string) => {
    if (!puzzle || gameState.isGameOver || gameState.guessesUsed >= puzzle.max_guesses) {
      return
    }

    const trimmedGuess = guessText.trim()
    if (!trimmedGuess) return

    // Pause the timer
    setGameState(prev => ({ ...prev, isPaused: true, currentGuess: '' }))

    try {
      const response = await fetch('/api/gwb/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: getClientId(),
          play_date: puzzle.date,
          guess_text: trimmedGuess,
          elapsed_ms: Math.round((puzzle.total_time_seconds - gameState.timeRemaining) * 1000)
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        if (result.error === 'Already completed') {
          // User has already completed today's puzzle
          setGameState(prev => ({
            ...prev,
            isGameOver: true,
            hasWon: true,
            isPaused: false
          }))
        } else if (result.error === 'No more guesses allowed') {
          // Out of guesses
          setGameState(prev => ({
            ...prev,
            isGameOver: true,
            hasWon: false,
            isPaused: false
          }))
        } else {
          console.error('Guess API error:', result.error)
          setGameState(prev => ({ ...prev, isPaused: false }))
        }
        return
      }
      
      if (result.correct) {
        // Won the game!
        setGameState(prev => ({
          ...prev,
          isGameOver: true,
          hasWon: true,
          guessesUsed: result.guesses_used,
          isPaused: false
        }))
      } else {
        // Wrong guess, resume timer or end game if out of guesses
        setGameState(prev => ({
          ...prev,
          guessesUsed: result.guesses_used,
          isPaused: false,
          isGameOver: result.is_game_over,
          hasWon: false
        }))
      }
    } catch (error) {
      console.error('Error submitting guess:', error)
      // Resume timer on error
      setGameState(prev => ({ ...prev, isPaused: false }))
    }
  }

  const resetGame = () => {
    setGameState({
      timeRemaining: puzzle?.total_time_seconds || 20,
      guessesUsed: 0,
      isGameOver: false,
      hasWon: false,
      currentGuess: '',
      isPaused: false,
      gameStarted: false
    })
  }

  const generateShareText = () => {
    if (!gameState.hasWon && !gameState.isGameOver) return ''
    
    const guessEmojis = Array(puzzle?.max_guesses || 6).fill('')
    for (let i = 0; i < gameState.guessesUsed; i++) {
      guessEmojis[i] = i === gameState.guessesUsed - 1 && gameState.hasWon ? '✅' : '❌'
    }
    
    const timeLeft = Math.max(0, Math.round(gameState.timeRemaining))
    const result = gameState.hasWon 
      ? `${gameState.guessesUsed}/6 with ${timeLeft}s left`
      : `${gameState.guessesUsed}/6 - failed`
    
    return `GuessWho Bravo ${puzzle?.date} ${result}\n${guessEmojis.join('')}`
  }


  if (!isMounted || isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading today&apos;s puzzle...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">GuessWho</h1>
          <h2 className="text-xl text-blue-600 mb-6">Bravo Edition</h2>
          <p className="text-red-600">{error}</p>
          <div className="mt-8 bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              This product uses the TMDB API but is not endorsed or certified by TMDB.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!puzzle) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">GuessWho</h1>
          <h2 className="text-xl text-blue-600 mb-6">Bravo Edition</h2>
          <p className="text-gray-600">No puzzle available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-3">GuessWho</h1>
          <h2 className="text-2xl text-blue-600 font-medium italic mb-4">Bravo Edition</h2>
          <div className="flex justify-center items-center gap-4">
            <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-medium">
              {puzzle.date}
            </span>
            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
              {gameState.guessesUsed}/{puzzle.max_guesses} guesses
            </span>
          </div>
        </div>

        {/* Game Area */}
        <div className="bg-white rounded-lg shadow-2xl border border-gray-100 p-6">
          {/* Image */}
          <div className="relative mb-6">
            <div className="max-w-sm mx-auto bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden shadow-md">
              <PixelatedImage
                src={puzzle.person.image_urls.original}
                pixelSize={gameState.isGameOver ? 1 : currentPixelSize}
                width={300}
                height={450}
                objectFit="cover"
                className="rounded-lg"
                alt={gameState.isGameOver && gameState.hasWon ? puzzle.person.full_name : "Mystery Bravo personality"}
              />
            </div>
          </div>

          {/* Timer */}
          <div className="text-center mb-6">
            <div className="text-4xl font-mono font-bold text-gray-900 mb-3">
              {Math.max(0, Math.round(gameState.timeRemaining))}s
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className={`h-3 rounded-full transition-all duration-500 ${
                  gameState.timeRemaining > 10 ? 'bg-green-500' :
                  gameState.timeRemaining > 5 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${(gameState.timeRemaining / puzzle.total_time_seconds) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Game States */}
          {!gameState.gameStarted && !gameState.isGameOver && (
            <div className="text-center">
              <button
                onClick={startGame}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full font-semibold shadow-md hover:shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
              >
                Start Game
              </button>
              <p className="text-sm text-gray-500 mt-2">
                You have {puzzle.total_time_seconds} seconds and {puzzle.max_guesses} guesses
              </p>
            </div>
          )}

          {gameState.gameStarted && !gameState.isGameOver && (
            <div className="space-y-4">
              {/* Input with Typeahead */}
              <div>
                <Typeahead
                  value={gameState.currentGuess}
                  onChange={(value) => setGameState(prev => ({ ...prev, currentGuess: value }))}
                  onSelect={(person) => {
                    setGameState(prev => ({ ...prev, currentGuess: person.full_name }))
                    // Auto-submit when a person is selected from typeahead
                    setTimeout(() => submitGuess(person.full_name), 100)
                  }}
                  onEnterPress={(value) => {
                    if (!gameState.isPaused && value.trim()) {
                      submitGuess(value.trim())
                    }
                  }}
                  searchEndpoint="/api/gwb/people/search"
                  placeholder="Who is this Bravo personality?"
                  className="px-4 py-3 text-lg"
                  disabled={gameState.isPaused}
                  minLength={2}
                  debounceMs={300}
                />
              </div>

              {/* Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => gameState.currentGuess.trim() && submitGuess(gameState.currentGuess.trim())}
                  disabled={!gameState.currentGuess.trim() || gameState.isPaused}
                  className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-full font-semibold shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed"
                >
                  {gameState.isPaused ? 'Checking...' : 'Submit Guess'}
                </button>

                <button
                  onClick={() => submitGuess('')}
                  disabled={gameState.isPaused}
                  className="w-full px-4 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-full font-semibold shadow-md hover:shadow-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-200 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed"
                >
                  I Don&apos;t Know
                </button>
              </div>
            </div>
          )}

          {/* Game Over */}
          {gameState.isGameOver && (
            <div className="text-center space-y-4">
              {gameState.hasWon ? (
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-green-600">🎉 Correct!</h2>
                  <p className="text-lg font-semibold">{puzzle.person.full_name}</p>
                  <p className="text-gray-600">
                    Solved in {gameState.guessesUsed}/{puzzle.max_guesses} guesses 
                    with {Math.round(gameState.timeRemaining)}s remaining
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-red-600">Time&apos;s Up!</h2>
                  <p className="text-lg font-semibold">The answer was: {puzzle.person.full_name}</p>
                  <p className="text-gray-600">Better luck tomorrow!</p>
                </div>
              )}
              
              {/* Share button */}
              <button
                onClick={() => navigator.clipboard?.writeText(generateShareText())}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full font-semibold shadow-md hover:shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
              >
                Share Result
              </button>
              
              <button
                onClick={resetGame}
                className="block mx-auto px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-full font-semibold shadow-md hover:shadow-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-200"
              >
                Play Again
              </button>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-blue-800 mb-4 text-lg">How to Play</h3>
          <ul className="text-blue-700 space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-lg">👁️</span>
              <span className="font-medium">Identify the Bravo personality from the progressively clearing image</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg">⏱️</span>
              <span className="font-medium">You have <strong>{puzzle.total_time_seconds} seconds</strong> and <strong>{puzzle.max_guesses} guesses</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg">❓</span>
              <span className="font-medium">Click &quot;I Don&apos;t Know&quot; to skip if you&apos;re stuck</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg">🔄</span>
              <span className="font-medium">A new puzzle is available daily at midnight</span>
            </li>
          </ul>
        </div>

        {/* TMDB Attribution */}
        <div className="text-center bg-gray-50 py-3 px-4 rounded-lg">
          <p className="text-sm text-gray-500">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </div>
        </div>
      </div>
    </div>
  )
}