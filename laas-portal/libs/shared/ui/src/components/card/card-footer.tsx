'use client';

import { Slot } from '@radix-ui/react-slot';

import * as React from 'react';

import { cn } from '../../lib/utils/cn';

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ asChild, className, ...props }, ref) => {
    const Component = asChild ? Slot : 'div';

    return (
      <Component
        ref={ref}
        data-slot="card-footer"
        className={cn('flex items-center gap-2 border-t px-6 py-4', className)}
        {...props}
      />
    );
  }
);

CardFooter.displayName = 'CardFooter';
