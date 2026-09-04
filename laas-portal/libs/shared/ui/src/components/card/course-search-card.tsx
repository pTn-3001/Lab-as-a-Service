'use client';

import { Star, Users } from 'lucide-react';

import * as React from 'react';

import { cn } from '../../lib/utils/cn';
import { Button } from '../button/button';
import { Badge } from './badge';
import { BaseCard } from './card';

export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced';

const levelVariant = {
  Beginner: 'beginner',
  Intermediate: 'intermediate',
  Advanced: 'advanced',
} as const;

export interface CourseSearchCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  level?: CourseLevel;
  tags?: string[];
  rating?: number;
  learners?: number;
  thumbnailUrl: string;
  thumbnailAlt?: string;
  primaryActionLabel?: string;
  onPrimaryActionClick?: () => void;
}

export const CourseSearchCard = React.forwardRef<HTMLDivElement, CourseSearchCardProps>(
  (
    {
      title,
      subtitle,
      level,
      tags,
      rating,
      learners,
      thumbnailUrl,
      thumbnailAlt,
      primaryActionLabel = 'Thêm vào giỏ',
      onPrimaryActionClick,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <BaseCard
        ref={ref}
        className={cn(
          'flex gap-4 overflow-hidden border-border/70 p-3 transition-all hover:border-primary/60 hover:shadow-md',
          className
        )}
        {...props}
      >
        {/* Thumbnail */}
        <div className="relative h-[140px] w-[260px] shrink-0 overflow-hidden rounded-lg">
          <img
            src={thumbnailUrl}
            alt={thumbnailAlt ?? title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {level && (
            <Badge variant={levelVariant[level]} className="absolute right-2 top-2 text-[10px]">
              {level}
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col justify-between">
          {/* Title + subtitle */}
          <div className="space-y-1">
            <h3 className="text-base font-semibold leading-snug">{title}</h3>
            {subtitle && <p className="text-muted-foreground line-clamp-2 text-sm">{subtitle}</p>}
          </div>

          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Meta + CTA (CÙNG HÀNG) */}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-muted-foreground flex items-center gap-4 text-xs">
              {rating !== undefined && (
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {rating}
                </span>
              )}
              {learners !== undefined && (
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4 text-blue-500" />
                  {learners.toLocaleString()} học viên
                </span>
              )}
            </div>

            <Button size="sm" onClick={onPrimaryActionClick}>
              {primaryActionLabel}
            </Button>
          </div>
        </div>
      </BaseCard>
    );
  }
);

CourseSearchCard.displayName = 'CourseSearchCard';
