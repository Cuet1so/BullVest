import type { ComponentPropsWithoutRef, CSSProperties } from 'react';

type SkeletonProps = ComponentPropsWithoutRef<'div'> & {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
};

/** Decorative placeholder; the containing loading region supplies its accessible label. */
export function Skeleton({ width, height, className = '', style, ...props }: SkeletonProps) {
  return <div {...props} aria-hidden="true" style={{ ...style, ...(width !== undefined && { width }), ...(height !== undefined && { height }) }} className={`animate-pulse rounded-lg bg-zinc-800 motion-reduce:animate-none ${className}`} />;
}
