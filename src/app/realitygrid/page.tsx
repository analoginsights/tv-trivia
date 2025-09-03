'use client'

import { useState, useEffect } from 'react'

interface Show {
  id: number
  name: string
  poster_path: string | null
}

interface Person {
  id: number
  name: string
  profile_path: string | null
}

interface Puzzle {
  puzzle_id: string
  rows: Show[]
  cols: Show[]
  cells: { row: number; col: number; answer_count: number }[]
}

interface GameState {
  selectedCell: { row: number; col: number } | null
  answers: (Person | null)[][]
  correctAnswers: boolean[][]
  gameComplete: boolean
  score: number
}

export default function RealityGrid() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [gameState, setGameState] = useState<GameState>({
    selectedCell: null,
    answers: Array(3).fill(null).map(() => Array(3).fill(null)),
    correctAnswers: Array(3).fill(null).map(() => Array(3).fill(false)),
    gameComplete: false,
    score: 0
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [showSolutionsModal, setShowSolutionsModal] = useState(false)
  const [selectedCellSolutions, setSelectedCellSolutions] = useState<{
    solutions: Person[]
    rowShow: string
    colShow: string
    count: number
  } | null>(null)

  // Helper function to convert cells array to 2D grid
  const getCellCounts = (puzzle: Puzzle): number[][] => {
    const grid = Array(3).fill(null).map(() => Array(3).fill(0))
    puzzle.cells?.forEach(cell => {
      grid[cell.row][cell.col] = cell.answer_count
    })
    return grid
  }

  // Ensure component is mounted before rendering interactive content
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Load today's puzzle
  useEffect(() => {
    const loadPuzzle = async () => {
      try {
        const response = await fetch('/api/realitygrid/puzzle/today')
        if (response.ok) {
          const puzzleData = await response.json()
          setPuzzle(puzzleData)
        }
      } catch (error) {
        console.error('Failed to load puzzle:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadPuzzle()
  }, [])

  // Search for people
  useEffect(() => {
    const searchPeople = async () => {
      if (!searchQuery.trim() || !gameState.selectedCell) return

      setIsSearching(true)
      try {
        const response = await fetch(`/api/realitygrid/typeahead?q=${encodeURIComponent(searchQuery)}`)
        if (response.ok) {
          const results = await response.json()
          setSearchResults(results)
        }
      } catch (error) {
        console.error('Search failed:', error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }

    const timeoutId = setTimeout(searchPeople, 300)
    return () => clearTimeout(timeoutId)
  }, [searchQuery, gameState.selectedCell])

  const selectCell = (row: number, col: number) => {
    if (!puzzle || !puzzle.cells) return
    
    // Don't allow selection if cell has no valid answers
    const cellCounts = getCellCounts(puzzle)
    if (cellCounts[row]?.[col] === 0) return

    setGameState(prev => ({
      ...prev,
      selectedCell: { row, col }
    }))
    setSearchQuery('')
    setSearchResults([])
  }

  const selectPerson = async (person: Person) => {
    if (!gameState.selectedCell || !puzzle) return

    const { row, col } = gameState.selectedCell

    // Validate the answer
    try {
      const response = await fetch('/api/realitygrid/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: person.id,
          row_show_id: puzzle.rows[row].id,
          column_show_id: puzzle.cols[col].id
        })
      })

      const validation = await response.json()
      const isCorrect = validation.valid

      // Update game state
      setGameState(prev => {
        const newAnswers = [...prev.answers]
        const newCorrectAnswers = [...prev.correctAnswers]
        
        newAnswers[row][col] = person
        newCorrectAnswers[row][col] = isCorrect

        // Calculate score
        const totalCorrect = newCorrectAnswers.flat().filter(Boolean).length
        const totalCells = getCellCounts(puzzle).flat().filter(count => count > 0).length || 0
        const gameComplete = totalCells > 0 && totalCorrect === totalCells

        return {
          ...prev,
          answers: newAnswers,
          correctAnswers: newCorrectAnswers,
          score: totalCorrect,
          gameComplete,
          selectedCell: null
        }
      })

      setSearchQuery('')
      setSearchResults([])

    } catch (error) {
      console.error('Validation failed:', error)
    }
  }

  const showSolutions = async (row: number, col: number) => {
    if (!puzzle) return

    try {
      const response = await fetch('/api/realitygrid/solutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_show_id: puzzle.rows[row].id,
          col_show_id: puzzle.cols[col].id
        })
      })

      if (response.ok) {
        const data = await response.json()
        setSelectedCellSolutions({
          solutions: data.solutions,
          rowShow: puzzle.rows[row].name,
          colShow: puzzle.cols[col].name,
          count: data.count
        })
        setShowSolutionsModal(true)
      }
    } catch (error) {
      console.error('Failed to fetch solutions:', error)
    }
  }

  const resetGame = () => {
    setGameState({
      selectedCell: null,
      answers: Array(3).fill(null).map(() => Array(3).fill(null)),
      correctAnswers: Array(3).fill(null).map(() => Array(3).fill(false)),
      gameComplete: false,
      score: 0
    })
  }

  if (!isMounted || isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading today&apos;s puzzle...</p>
        </div>
      </div>
    )
  }

  if (!puzzle) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Reality Grid</h1>
          <p className="text-red-600">Failed to load today&apos;s puzzle. Please try again later.</p>
        </div>
      </div>
    )
  }

  // Debug logging
  console.log('Puzzle loaded:', puzzle)
  
  if (!puzzle.rows || !puzzle.cols || !puzzle.cells) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Reality Grid</h1>
          <p className="text-red-600">Puzzle data incomplete. Missing: {!puzzle.rows ? 'rows ' : ''}{!puzzle.cols ? 'cols ' : ''}{!puzzle.cells ? 'cells' : ''}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Reality Grid</h1>
          <p className="text-gray-600">
            Find people who appeared on both shows in each intersection
          </p>
          <div className="mt-2 text-sm text-gray-500">
            Score: {gameState.score} / {getCellCounts(puzzle).flat().filter(count => count > 0).length || 0}
          </div>
        </div>

        {/* Game Complete Message */}
        {gameState.gameComplete && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <h2 className="text-lg font-semibold text-green-800">🎉 Congratulations!</h2>
            <p className="text-green-700">You completed today&apos;s Reality Grid!</p>
            <button
              onClick={resetGame}
              className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Play Again
            </button>
          </div>
        )}

        {/* Grid */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="grid grid-cols-4 gap-2 max-w-2xl mx-auto">
            {/* Top-left empty cell */}
            <div className="aspect-square"></div>

            {/* Column headers */}
            {puzzle.cols?.map((show) => (
              <div key={`col-${show.id}`} className="aspect-square bg-blue-50 border-2 border-blue-200 rounded-lg p-2 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-xs font-semibold text-blue-800 leading-tight">
                    {show.name}
                  </div>
                </div>
              </div>
            ))}

            {/* Grid rows */}
            {puzzle.rows?.map((rowShow, rowIdx) => (
              <div key={`row-${rowShow.id}`} className="contents">
                {/* Row header */}
                <div className="aspect-square bg-green-50 border-2 border-green-200 rounded-lg p-2 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-xs font-semibold text-green-800 leading-tight">
                      {rowShow.name}
                    </div>
                  </div>
                </div>

                {/* Grid cells */}
                {puzzle.cols?.map((_, colIdx) => {
                  const cellCount = getCellCounts(puzzle)[rowIdx]?.[colIdx] ?? 0
                  const isSelected = gameState.selectedCell?.row === rowIdx && gameState.selectedCell?.col === colIdx
                  const answer = gameState.answers[rowIdx][colIdx]
                  const isCorrect = gameState.correctAnswers[rowIdx][colIdx]
                  const isEmpty = cellCount === 0

                  return (
                    <div
                      key={`cell-${rowIdx}-${colIdx}`}
                      className={`
                        aspect-square border-2 rounded-lg cursor-pointer transition-all
                        ${isEmpty ? 'bg-gray-100 border-gray-200 cursor-not-allowed' :
                          isSelected ? 'bg-yellow-100 border-yellow-400' :
                          answer ? (isCorrect ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400') :
                          'bg-white border-gray-300 hover:bg-gray-50'}
                      `}
                      onClick={() => !isEmpty && selectCell(rowIdx, colIdx)}
                      onDoubleClick={() => !isEmpty && showSolutions(rowIdx, colIdx)}
                    >
                      <div className="h-full flex items-center justify-center p-2">
                        {isEmpty ? (
                          <div className="text-gray-400 text-xs">No matches</div>
                        ) : answer ? (
                          <div className="text-center">
                            <div className="text-xs font-medium leading-tight">{answer.name}</div>
                            {isCorrect && <div className="text-green-600 mt-1">✓</div>}
                            {!isCorrect && <div className="text-red-600 mt-1">✗</div>}
                          </div>
                        ) : (
                          <div className="text-center">
                            <div className="text-xs text-gray-500">{cellCount} possible</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Search Interface */}
        {gameState.selectedCell && (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="max-w-md mx-auto">
              <h3 className="text-lg font-semibold mb-3 text-center">
                Find someone who appeared on both:{' '}
                <span className="text-green-600">{puzzle.rows?.[gameState.selectedCell.row]?.name}</span>
                {' & '}
                <span className="text-blue-600">{puzzle.cols?.[gameState.selectedCell.col]?.name}</span>
              </h3>
              
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for a person..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />

              {isSearching && (
                <div className="mt-2 text-center text-gray-500">Searching...</div>
              )}

              {searchResults.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                  {searchResults.map((person) => (
                    <button
                      key={person.id}
                      onClick={() => selectPerson(person)}
                      className="w-full px-4 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium">{person.name}</div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery && !isSearching && searchResults.length === 0 && (
                <div className="mt-2 text-center text-gray-500">No results found</div>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">How to Play</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Click on a grid cell to select it</li>
            <li>• Double-click on a cell to see all possible solutions</li>
            <li>• Search for a person who appeared on both shows</li>
            <li>• Green cells indicate correct answers, red cells indicate mistakes</li>
            <li>• Complete all valid cells to win!</li>
          </ul>
        </div>

        {/* Solutions Modal */}
        {showSolutionsModal && selectedCellSolutions && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">
                    All Solutions
                  </h2>
                  <button
                    onClick={() => setShowSolutionsModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </div>
                <p className="text-gray-600 mt-2">
                  People who appeared on both <span className="font-semibold">{selectedCellSolutions.rowShow}</span> and <span className="font-semibold">{selectedCellSolutions.colShow}</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedCellSolutions.count} {selectedCellSolutions.count === 1 ? 'person' : 'people'} found
                </p>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-96">
                {selectedCellSolutions.solutions.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedCellSolutions.solutions.map((person) => (
                      <div
                        key={person.id}
                        className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg"
                      >
                        {person.profile_url ? (
                          <img
                            src={person.profile_url}
                            alt={person.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-gray-600 text-xs">No Photo</span>
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{person.name}</div>
                          <div className="text-sm text-gray-500">Reality TV Personality</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <p>No people found who appeared on both shows.</p>
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-gray-50 rounded-b-lg">
                <button
                  onClick={() => setShowSolutionsModal(false)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}