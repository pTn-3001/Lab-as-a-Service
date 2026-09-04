'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

export interface SearchBarProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  ({ className, containerClassName, placeholder = 'Search...', ...props }, ref) => {
    return (
      <div className={cn('relative w-full', containerClassName)}>
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="search"
          className={cn(
            'block w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2.5 pl-10 pr-3 text-sm placeholder-gray-400 transition-all duration-200',
            'focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10',
            className
          )}
          placeholder={placeholder}
          ref={ref}
          {...props}
        />
      </div>
    );
  }
);

SearchBar.displayName = 'SearchBar';
