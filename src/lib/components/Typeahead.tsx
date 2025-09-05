import React, { useState, useEffect, useRef, useCallback } from 'react'

interface TypeaheadOption {
  id: number | string
  full_name: string
  first_name?: string
  last_name?: string
}

interface TypeaheadProps {
  value: string
  onChange: (value: string) => void
  onSelect: (option: TypeaheadOption) => void
  onEnterPress?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  searchEndpoint: string
  minLength?: number
  debounceMs?: number
}

export default function Typeahead({
  value,
  onChange,
  onSelect,
  onEnterPress,
  placeholder = 'Type to search...',
  className = '',
  disabled = false,
  searchEndpoint,
  minLength = 1,
  debounceMs = 300
}: TypeaheadProps) {
  const [suggestions, setSuggestions] = useState<TypeaheadOption[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [loading, setLoading] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced search function
  const searchSuggestions = useCallback(async (query: string) => {
    if (query.length < minLength) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${searchEndpoint}?q=${encodeURIComponent(query)}`)
      if (response.ok) {
        const results = await response.json()
        setSuggestions(results)
        setShowSuggestions(true)
        setActiveSuggestion(-1)
      }
    } catch (error) {
      console.error('Search error:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [searchEndpoint, minLength])

  // Handle input changes with debouncing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    // Set new debounce
    debounceRef.current = setTimeout(() => {
      searchSuggestions(newValue)
    }, debounceMs)
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveSuggestion(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveSuggestion(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (activeSuggestion >= 0) {
          handleSelectSuggestion(suggestions[activeSuggestion])
        } else if (onEnterPress && value.trim()) {
          // If no suggestion is selected but there's a value, call the enter handler
          onEnterPress(value.trim())
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setActiveSuggestion(-1)
        break
    }
  }

  // Handle suggestion selection
  const handleSelectSuggestion = (option: TypeaheadOption) => {
    onChange(option.full_name)
    onSelect(option)
    setShowSuggestions(false)
    setActiveSuggestion(-1)
    setSuggestions([])
  }

  // Handle clicks outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current && 
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
        setActiveSuggestion(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => value.length >= minLength && suggestions.length > 0 && setShowSuggestions(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
        autoComplete="off"
      />
      
      {/* Loading indicator */}
      {loading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div 
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.id}
              className={`px-3 py-2 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                index === activeSuggestion 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setActiveSuggestion(index)}
            >
              <div className="font-medium">{suggestion.full_name}</div>
              {suggestion.first_name && suggestion.last_name && suggestion.full_name !== `${suggestion.first_name} ${suggestion.last_name}` && (
                <div className="text-sm text-gray-500">
                  {suggestion.first_name} {suggestion.last_name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* No results message */}
      {showSuggestions && !loading && suggestions.length === 0 && value.length >= minLength && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-3">
          <div className="text-gray-500 text-sm">No people found</div>
        </div>
      )}
    </div>
  )
}