'use client'

import { useState, useEffect, useCallback } from 'react'
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
        const response = await fetch('/api/gwb/daily')
        
        if (response.status === 204) {
          setError('No daily puzzle available today. Check back later!')
          return
        }
        
        if (!response.ok) {
          throw new Error('Failed to load daily puzzle')
        }
        
        const data = await response.json()
        setPuzzle(data)
        setGameState(prev => ({
          ...prev,
          timeRemaining: data.total_time_seconds
        }))
      } catch (err) {
        console.error('Error loading puzzle:', err)
        setError('Failed to load today\'s puzzle. Please try again later.')
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
        // Wrong guess, resume timer
        setGameState(prev => ({
          ...prev,
          guessesUsed: result.guesses_used,
          isPaused: false,
          isGameOver: result.guesses_left === 0
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !gameState.isPaused && gameState.currentGuess.trim()) {
      submitGuess(gameState.currentGuess.trim())
    }
  }

  if (!isMounted || isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading today's puzzle...</p>
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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">GuessWho</h1>
          <h2 className="text-xl text-blue-600 mb-2">Bravo Edition</h2>
          <p className="text-sm text-gray-500">
            {puzzle.date} • {gameState.guessesUsed}/{puzzle.max_guesses} guesses
          </p>
        </div>

        {/* Game Area */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* Image */}
          <div className="relative mb-6">
            <div className="max-w-sm mx-auto bg-gray-100 rounded-lg overflow-hidden">
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
            <div className="text-3xl font-mono font-bold text-gray-900 mb-2">
              {Math.max(0, Math.round(gameState.timeRemaining))}s
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-100 ${
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
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
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
                    setTimeout(() => handleSubmitGuess(), 100)
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
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {gameState.isPaused ? 'Checking...' : 'Submit Guess'}
                </button>

                <button
                  onClick={() => submitGuess('')}
                  disabled={gameState.isPaused}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  I Don't Know
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
                  <h2 className="text-2xl font-bold text-red-600">Time's Up!</h2>
                  <p className="text-lg font-semibold">The answer was: {puzzle.person.full_name}</p>
                  <p className="text-gray-600">Better luck tomorrow!</p>
                </div>
              )}
              
              {/* Share button */}
              <button
                onClick={() => navigator.clipboard?.writeText(generateShareText())}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Share Result
              </button>
              
              <button
                onClick={resetGame}
                className="block mx-auto px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700"
              >
                Play Again
              </button>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">How to Play</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Identify the Bravo personality from the progressively clearing image</li>
            <li>• You have {puzzle.total_time_seconds} seconds and {puzzle.max_guesses} guesses</li>
            <li>• Click "I Don't Know" to skip if you're stuck</li>
            <li>• A new puzzle is available daily at midnight</li>
          </ul>
        </div>

        {/* TMDB Attribution */}
        <div className="text-center text-xs text-gray-400">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </div>
      </div>
    </div>
  )
}