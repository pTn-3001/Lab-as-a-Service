'use client';

import { type VariantProps, cva } from 'class-variance-authority';

import * as React from 'react';

import { cn } from '../../lib/utils/cn';

const badgeVariants = cva(
  // Base styles cho badge
  'inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',

        // For level badge in course card
        beginner: 'bg-emerald-50 text-emerald-600 border border-emerald-100/50',
        intermediate: 'bg-amber-50 text-amber-600 border border-amber-100/50',
        advanced: 'bg-rose-50 text-rose-600 border border-rose-100/50',
      },
      size: {
        sm: 'text-[10px]',
        md: 'text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

// Tập hợp các props cho Badge component gồm các props của <span> và các biến thể từ badgeVariants
export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge – dùng cho tag, status pill, level của course card.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <span
        ref={ref}
        data-slot="badge"
        data-variant={variant}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export { badgeVariants };
