import React, { useEffect, useRef } from 'react';

type PixelatedImageProps = {
  src: string;
  pixelSize: number; // >=1; 1 ~ nearly clear
  width: number;
  height: number;
  className?: string;
  alt?: string;
};

export default function PixelatedImage({ src, pixelSize, width, height, className, alt = 'GuessWho image' }: PixelatedImageProps) {
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

        // Compute small (downscaled) size in pixels; clamp >= 1
        const downW = Math.max(1, Math.floor(width / pixelSize));
        const downH = Math.max(1, Math.floor(height / pixelSize));

        // Offscreen tiny canvas
        const off = document.createElement('canvas');
        off.width = downW;
        off.height = downH;
        const octx = off.getContext('2d');
        if (!octx) return;

        // Draw original into downscaled buffer (standard smoothing OK here)
        octx.drawImage(img, 0, 0, off.width, off.height);

        // Upscale to final canvas with NEAREST-NEIGHBOR (pixelation)
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, width, height);
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
  }, [src, pixelSize, width, height]);

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