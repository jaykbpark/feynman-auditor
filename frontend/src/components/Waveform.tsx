'use client';

import { useEffect, useRef } from 'react';

interface WaveformProps {
  audioLevel: number;
  isActive: boolean;
}

export function Waveform({ audioLevel, isActive }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const phaseRef = useRef(0);
  const smoothLevelRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerY = height / 2;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Smooth the audio level (less jumpy)
      const targetLevel = isActive ? audioLevel : 0;
      smoothLevelRef.current += (targetLevel - smoothLevelRef.current) * 0.15;
      const level = smoothLevelRef.current;

      // Slow phase animation
      phaseRef.current += 0.02;

      // Max amplitude - subtle
      const maxAmplitude = height * 0.15;
      const amplitude = level * maxAmplitude;

      // Draw line
      ctx.strokeStyle = isActive 
        ? `rgba(255, 255, 255, ${0.4 + level * 0.5})` 
        : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      for (let i = 0; i < width; i++) {
        // Simple, clean sine wave
        const x = i / width;
        const wave = Math.sin(x * Math.PI * 4 + phaseRef.current) * amplitude;
        const y = centerY + wave;

        if (i === 0) {
          ctx.moveTo(i, y);
        } else {
          ctx.lineTo(i, y);
        }
      }

      ctx.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioLevel, isActive]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ width: '100%', height: '48px' }}
    />
  );
}
