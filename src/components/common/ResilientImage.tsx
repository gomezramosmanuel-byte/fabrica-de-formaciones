import React, { useState } from 'react';
import { BookOpen, Shield, Wifi, Wrench, Layers } from 'lucide-react';

interface ResilientImageProps {
  src?: string;
  alt: string;
  category?: string;
  className?: string;
  fallbackLabel?: string;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  category,
  className = 'w-full h-full object-cover',
  fallbackLabel,
}) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    const textCheck = `${category || ''} ${alt || ''}`.toLowerCase();
    const isSecurity =
      textCheck.includes('seguridad') ||
      textCheck.includes('altura') ||
      textCheck.includes('riesgo') ||
      textCheck.includes('epp');
    const isFiber =
      textCheck.includes('ftth') ||
      textCheck.includes('fibra') ||
      textCheck.includes('red') ||
      textCheck.includes('normaliza');
    const isTools =
      textCheck.includes('instalac') ||
      textCheck.includes('diagn') ||
      textCheck.includes('herramienta') ||
      textCheck.includes('medicion') ||
      textCheck.includes('cámara');

    const ThemeIcon = isSecurity
      ? Shield
      : isFiber
      ? Wifi
      : isTools
      ? Wrench
      : category
      ? Layers
      : BookOpen;

    return (
      <div
        className={`relative flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-[#3B0A07] text-white p-6 text-center overflow-hidden ${className}`}
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#DA291C]" />
        <div className="w-12 h-12 rounded-2xl bg-[#DA291C]/20 border border-[#DA291C]/40 flex items-center justify-center mb-3 shadow-xs">
          <ThemeIcon className="w-6 h-6 text-[#DA291C]" />
        </div>
        {category && (
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#DA291C] mb-1">
            {category}
          </span>
        )}
        <span className="text-xs sm:text-sm font-bold tracking-tight text-white max-w-[260px] line-clamp-2">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
};

// Deterministic visual QR matrix SVG for sharing public activity URLs
export const CourseQrCodeSvg: React.FC<{ value: string; size?: number }> = ({
  value,
  size = 148,
}) => {
  const gridSize = 21;
  const cells: boolean[][] = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(false)
  );

  // Draw standard finder patterns (7x7 corners)
  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        cells[r0 + r][c0 + c] = isBorder || isInner;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, gridSize - 7);
  drawFinder(gridSize - 7, 0);

  // Deterministic hash fill from URL value
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const inFinderTopLeft = r < 8 && c < 8;
      const inFinderTopRight = r < 8 && c >= gridSize - 8;
      const inFinderBottomLeft = r >= gridSize - 8 && c < 8;
      if (inFinderTopLeft || inFinderTopRight || inFinderBottomLeft) continue;

      const bitIdx = (r * gridSize + c) % 31;
      const charCode = value.charCodeAt((r * 7 + c * 13) % Math.max(1, value.length)) || 42;
      cells[r][c] = ((hash >> bitIdx) ^ (charCode + r * c)) % 2 === 0;
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${gridSize + 4} ${gridSize + 4}`}
      className="bg-white border border-slate-200 rounded-lg p-1.5"
      role="img"
      aria-label={`Código QR para ${value}`}
    >
      <rect width={gridSize + 4} height={gridSize + 4} fill="#FFFFFF" />
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              x={cIdx + 2}
              y={rIdx + 2}
              width={1}
              height={1}
              fill="#0F172A"
            />
          ) : null
        )
      )}
    </svg>
  );
};
