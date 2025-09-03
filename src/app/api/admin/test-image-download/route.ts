import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = process.env.PUBLIC_STORAGE_BUCKET || 'gwb'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Testing image download...')
    
    // Test with a known working image URL - using a placeholder service
    const testImageUrl = 'https://picsum.photos/400/400'
    console.log(`Testing download from: ${testImageUrl}`)
    
    // Try fetching with different headers
    const imgResponse = await fetch(testImageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })
    
    console.log(`Response status: ${imgResponse.status}`)
    console.log(`Response headers:`, Object.fromEntries(imgResponse.headers.entries()))
    
    if (!imgResponse.ok) {
      return NextResponse.json({
        error: 'Image fetch failed',
        status: imgResponse.status,
        statusText: imgResponse.statusText,
        url: testImageUrl
      }, { status: 502 })
    }
    
    const imageBuffer = await imgResponse.arrayBuffer()
    console.log(`Downloaded ${imageBuffer.byteLength} bytes`)
    
    // Test upload to S3
    const testPath = `test/image-${Date.now()}.jpg`
    
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(testPath, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      })
    
    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({
        error: 'Upload failed',
        details: uploadError,
        downloadSuccess: true,
        imageSize: imageBuffer.byteLength
      }, { status: 500 })
    }
    
    console.log(`Image uploaded to: ${testPath}`)
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(testPath)
    
    return NextResponse.json({
      success: true,
      originalUrl: testImageUrl,
      storagePath: testPath,
      publicUrl: urlData.publicUrl,
      imageSize: imageBuffer.byteLength
    })
    
  } catch (error) {
    console.error('Test failed:', error)
    return NextResponse.json({ error: 'Test failed', details: String(error) }, { status: 500 })
  }
}