'use client';

import { ArrowRight, Clock, Star, Users } from 'lucide-react';

import * as React from 'react';

import { cn } from '../../lib/utils/cn';
import { Button } from '../button/button';
import { Badge } from './badge';
import { BaseCard } from './card';

export type LabLevel = 'Beginner' | 'Intermediate' | 'Advanced';

const levelVariant = {
  Beginner: 'beginner',
  Intermediate: 'intermediate',
  Advanced: 'advanced',
} as const;

export interface LabCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  level?: LabLevel;
  rating?: number;
  learners?: number;
  duration?: string;

  tags?: string[];

  thumbnailUrl: string;
  thumbnailAlt?: string;

  onClick?: () => void;
}

export const LabCard = React.forwardRef<HTMLDivElement, LabCardProps>(
  (
    {
      title,
      description,
      level,
      rating,
      learners,
      duration,
      tags,
      thumbnailUrl,
      thumbnailAlt,
      onClick,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <BaseCard
        ref={ref}
        onClick={onClick}
        className={cn(
          'group min-w-[280px] cursor-pointer overflow-hidden border-border/70 transition-all hover:border-primary/60 hover:shadow-lg',
          className
        )}
        {...props}
      >
        {/* Thumbnail */}
        <div className="relative h-40 w-full overflow-hidden">
          <img
            src={thumbnailUrl}
            alt={thumbnailAlt ?? title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {/* Overlay tối phía dưới */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />

          {/* Level badge */}
          {level && (
            <Badge variant={levelVariant[level]} className="absolute right-3 top-3">
              {level}
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-3 p-4">
          {/* Title + description */}
          <div className="space-y-1">
            <h3 className="line-clamp-2 text-base font-semibold leading-snug">{title}</h3>
            {description && (
              <p className="text-muted-foreground line-clamp-2 text-sm">{description}</p>
            )}
          </div>

          {/* Metadata row */}
          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            {rating !== undefined && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                {rating.toFixed(1)}
              </span>
            )}
            {learners !== undefined && (
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4 fill-blue-500 text-blue-500" />
                {learners.toLocaleString()}
              </span>
            )}
            {duration && (
              <span className="flex items-center gap-1">
                <Clock className="text-muted-foreground h-3.5 w-3.5 opacity-80" />
                {duration}
              </span>
            )}
          </div>

          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="pt-2">
            <Button variant="ghost" size="sm" className="w-full group-hover:bg-accent">
              Vào lab
              <ArrowRight className="text-muted-foreground h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </BaseCard>
    );
  }
);

LabCard.displayName = 'LabCard';
