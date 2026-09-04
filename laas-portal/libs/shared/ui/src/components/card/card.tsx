'use client';

import { Slot } from '@radix-ui/react-slot';

import * as React from 'react';

import { cn } from '../../lib/utils/cn';

export interface BaseCardProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

/**
 * BaseCard – khung card chung cho toàn hệ thống.
 *
 * Dùng cho mọi loại card (metric, chart, form, summary...).
 */
export const BaseCard = React.forwardRef<HTMLDivElement, BaseCardProps>(
  ({ asChild, className, ...props }, ref) => {
    const Component = asChild ? Slot : 'div';

    return (
      <Component
        ref={ref}
        data-slot="card"
        className={cn(
          'bg-white text-foreground rounded-2xl border border-gray-100/60 shadow-sm transition-all duration-300 ease-out hover:shadow-md hover:-translate-y-0.5',
          className
        )}
        {...props}
      />
    );
  }
);

BaseCard.displayName = 'BaseCard';
