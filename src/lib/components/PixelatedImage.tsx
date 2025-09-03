import React, { useEffect, useRef } from 'react';

type PixelatedImageProps = {
  src: string;
  pixelSize: number; // >=1; 1 ~ nearly clear
  width: number;
  height: number;
  className?: string;
  alt?: string;
  objectFit?: 'contain' | 'cover'; // How to fit the image: contain (letterbox) or cover (crop)
};

export default function PixelatedImage({ src, pixelSize, width, height, className, alt = 'GuessWho image', objectFit = 'cover' }: PixelatedImageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    
    const drawErrorState = () => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Image not available', width / 2, height / 2);
    };

    img.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        // Final render size
        canvas.width = width;
        canvas.height = height;

        // Calculate aspect ratios
        const imgAspectRatio = img.naturalWidth / img.naturalHeight;
        const canvasAspectRatio = width / height;

        let drawWidth = width;
        let drawHeight = height;
        let drawX = 0;
        let drawY = 0;

        if (objectFit === 'contain') {
          // Fit entire image within canvas, may leave empty space
          if (imgAspectRatio > canvasAspectRatio) {
            // Image is wider than canvas
            drawHeight = width / imgAspectRatio;
            drawY = (height - drawHeight) / 2;
          } else {
            // Image is taller than canvas
            drawWidth = height * imgAspectRatio;
            drawX = (width - drawWidth) / 2;
          }
        } else {
          // 'cover': Fill entire canvas, may crop image
          if (imgAspectRatio > canvasAspectRatio) {
            // Image is wider, crop sides
            drawWidth = height * imgAspectRatio;
            drawX = (width - drawWidth) / 2;
          } else {
            // Image is taller, crop top/bottom
            drawHeight = width / imgAspectRatio;
            drawY = (height - drawHeight) / 2;
          }
        }

        // Compute small (downscaled) size in pixels; clamp >= 1
        const downW = Math.max(1, Math.floor(drawWidth / pixelSize));
        const downH = Math.max(1, Math.floor(drawHeight / pixelSize));

        // Offscreen tiny canvas for pixelation
        const off = document.createElement('canvas');
        off.width = downW;
        off.height = downH;
        const octx = off.getContext('2d');
        if (!octx) return;

        // Draw original into downscaled buffer with proper aspect ratio
        octx.drawImage(img, 0, 0, off.width, off.height);

        // Clear canvas and fill background if using 'contain'
        ctx.clearRect(0, 0, width, height);
        if (objectFit === 'contain') {
          ctx.fillStyle = '#000000'; // Black letterboxing
          ctx.fillRect(0, 0, width, height);
        }

        // Upscale to final canvas with NEAREST-NEIGHBOR (pixelation)
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, off.width, off.height, drawX, drawY, drawWidth, drawHeight);
      } catch (error) {
        console.error('Canvas pixelation failed:', error);
        drawErrorState();
      }
    };

    img.onerror = () => {
      console.error('Image failed to load:', src);
      drawErrorState();
    };
    
    // No need for crossOrigin since we're using our own proxy
    img.src = src;
    
    return () => { cancelled = true; };
  }, [src, pixelSize, width, height, objectFit]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      aria-label={alt}
      role="img"
    />
  );
}