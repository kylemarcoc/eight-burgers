import { useState } from 'react';

type FoodImageProps = {
  src: string;
  alt: string;
  category?: string;
  badgeText?: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  className?: string;
};

export function FoodImage({
  src,
  alt,
  badgeText,
  loading = 'lazy',
  fetchPriority,
  className = '',
}: FoodImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showFallback = !src.trim() || failedSrc === src;

  if (showFallback) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`relative flex flex-col items-center justify-center overflow-hidden bg-ui-surface-muted p-4 text-center text-ui-text-muted ${className}`}
      >
        <svg
          viewBox="0 0 64 64"
          fill="none"
          aria-hidden="true"
          className="h-10 w-10 text-ui-text-muted/60"
        >
          <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="32" cy="32" r="12" stroke="currentColor" strokeWidth="1.75" opacity="0.65" />
          <path
            d="M12 18v28M52 18v12m0 0a4 4 0 0 1-4 4h0m4-4v16"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="mt-2 line-clamp-2 text-xs font-semibold tracking-wide text-ui-text-muted">
          {badgeText ?? 'Menu Item'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={`object-cover ${className}`}
    />
  );
}
