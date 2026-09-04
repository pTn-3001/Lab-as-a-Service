import * as React from 'react';

import { cn } from '../../lib/utils/cn';

export interface InputProps extends React.ComponentProps<'input'> {
  variant?: 'default' | 'notion';
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = 'default', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          variant === 'notion'
            ? 'placeholder:text-muted-foreground/40 flex w-full border-b-2 border-slate-200 px-1 py-2 text-base outline-none transition-all duration-300 focus:border-primary focus:bg-slate-50/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'
            : 'placeholder:text-muted-foreground/60 flex h-10 w-full rounded-xl border border-border bg-transparent px-4 py-2 text-base shadow-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
