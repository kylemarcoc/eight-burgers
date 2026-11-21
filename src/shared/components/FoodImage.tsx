import { useState } from 'react';
import type { MenuCategory } from '@/shared/shop/types';

type FoodImageProps = {
  src: string;
  alt: string;
  category?: MenuCategory;
  badgeText?: string;
  className?: string;
};

const CATEGORY_GRADIENTS: Record<MenuCategory, string> = {
  'classic-burgers': 'from-amber-900/90 via-orange-900/80 to-stone-900/95',
  'specialty-burgers': 'from-orange-900/90 via-red-900/80 to-stone-900/95',
  heavyweights: 'from-stone-900/95 via-amber-950/85 to-orange-950/95',
  'sides-snacks': 'from-yellow-900/90 via-amber-900/80 to-stone-900/95',
};

function BurgerFallbackArtwork({ category }: { category: MenuCategory }) {
  if (category === 'sides-snacks') {
    return (
      <svg
        viewBox="0 0 120 90"
        aria-hidden="true"
        className="h-16 w-20 text-amber-200/90 drop-shadow-sm"
      >
        <path
          d="M28 48 L36 78 C37 81 40 83 44 83 L76 83 C80 83 83 81 84 78 L92 48 Z"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect x="36" y="18" width="9" height="32" rx="3" fill="currentColor" opacity="0.88" />
        <rect x="50" y="12" width="9" height="38" rx="3" fill="currentColor" opacity="0.95" />
        <rect x="64" y="16" width="9" height="34" rx="3" fill="currentColor" opacity="0.82" />
        <rect x="77" y="22" width="8" height="28" rx="3" fill="currentColor" opacity="0.72" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 120 90"
      aria-hidden="true"
      className="h-16 w-20 text-amber-200/95 drop-shadow-sm"
    >
      <path
        d="M22 40 C22 20 40 12 60 12 C80 12 98 20 98 40 Z"
        fill="currentColor"
        fillOpacity="0.28"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="44" cy="26" r="2" fill="currentColor" />
      <circle cx="60" cy="22" r="2" fill="currentColor" />
      <circle cx="75" cy="27" r="2" fill="currentColor" />
      <path
        d="M18 47 Q30 42 42 47 T66 47 T90 47 T102 47"
        fill="none"
        stroke="#86efac"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="18" y="52" width="84" height="11" rx="5.5" fill="#fb923c" fillOpacity="0.85" />
      {category === 'heavyweights' ? (
        <rect x="20" y="65" width="80" height="8" rx="4" fill="#fdba74" fillOpacity="0.78" />
      ) : null}
      <path
        d="M22 72 L98 72 C98 79 92 83 84 83 L36 83 C28 83 22 79 22 72 Z"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
}

export function FoodImage({
  src,
  alt,
  category = 'classic-burgers',
  badgeText,
  className = '',
}: FoodImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showFallback = !src.trim() || failedSrc === src;
  const gradient = CATEGORY_GRADIENTS[category];

  if (showFallback) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br ${gradient} p-4 text-center text-amber-50 ${className}`}
      >
        <BurgerFallbackArtwork category={category} />
        <span className="mt-2 line-clamp-2 text-xs font-semibold tracking-wide text-amber-100/90 uppercase">
          {badgeText ?? '8Burgers Kitchen'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={`object-cover ${className}`}
    />
  );
}
