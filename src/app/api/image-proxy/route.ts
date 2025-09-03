import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const imageUrl = searchParams.get('url')
  
  if (!imageUrl) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }
  
  // Validate that it's a TMDB image URL for security
  if (!imageUrl.startsWith('https://image.tmdb.org/')) {
    return new NextResponse('Invalid image URL', { status: 400 })
  }
  
  try {
    console.log('Proxying image:', imageUrl)
    
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TV-Trivia/1.0)',
        'Accept': 'image/*'
      }
    })
    
    console.log('Image response status:', response.status)
    
    if (!response.ok) {
      console.error('Image fetch failed:', response.status, response.statusText)
      // Try a fallback placeholder
      return generatePlaceholderImage(400, 400)
    }
    
    const imageBuffer = await response.arrayBuffer()
    
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  } catch (error) {
    console.error('Error proxying image:', error)
    return generatePlaceholderImage(400, 400)
  }
}

function generatePlaceholderImage(width: number, height: number): NextResponse {
  // Generate a simple SVG placeholder
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f3f4f6"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial, sans-serif" font-size="16" fill="#9ca3af">
        Celebrity Image
      </text>
    </svg>
  `
  
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}