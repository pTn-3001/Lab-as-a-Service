'use client';

import * as React from 'react';

import { cn } from '../../lib/utils/cn';
import { Badge } from './badge';
import { BaseCard } from './card';
import { CardContent } from './card-content';
import { CardHeader } from './card-header';

export type StatTrend = 'up' | 'down' | 'neutral';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  iconBgColor?: string;
  trendLabel?: string;
  trend?: StatTrend;
  sparklineData?: number[];
}

const Sparkline = ({ data, trend }: { data: number[]; trend: StatTrend }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min === 0 ? 1 : max - min;
  const width = 80;
  const height = 30;
  const points = data
    .map((val, index) => {
      const x = (index / (data.length - 1)) * width;
      // Tránh sát mép trên/dưới để stroke không bị cắt
      const padding = 2;
      const y = padding + (height - padding * 2) - ((val - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const strokeColor = trend === 'up' ? '#00C950' : trend === 'down' ? '#FF4D4D' : '#94A3B8';

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

/**
 * StatCard – dùng cho KPI nhỏ trên dashboard (số lab, số học viên, v.v.).
 */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    { label, value, description, icon, iconBgColor, trend, trendLabel, sparklineData, className, ...props },
    ref
  ) => {
    return (
      <BaseCard ref={ref} className={cn('flex flex-col', className)} {...props}>
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-4">
          <div className="flex flex-col gap-1">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              {label}
            </span>
            {description && <span className="text-muted-foreground text-xs">{description}</span>}
          </div>

          {icon && (
            <div
              className={cn(
                'inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.04] border border-primary/10 text-primary shadow-sm shadow-primary/5',
                iconBgColor
              )}
            >
              {icon}
            </div>
          )}
        </CardHeader>

        <CardContent variant="metric" className="pt-0">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-3xl font-extrabold tracking-tight text-slate-900 leading-none">{value}</div>

              {trend && trendLabel && (
                <Badge
                  variant={trend === 'up' ? 'beginner' : trend === 'down' ? 'advanced' : 'muted'}
                  size="md"
                  className="w-fit mt-1.5"
                >
                  <span aria-hidden className="text-sm font-semibold">
                    {trend === 'up' && '↑'}
                    {trend === 'down' && '↓'}
                    {trend === 'neutral' && '→'}
                  </span>
                  <span>{trendLabel}</span>
                </Badge>
              )}
            </div>

            {sparklineData && sparklineData.length >= 2 && (
              <div className="mb-1 h-[30px] w-[80px]">
                <Sparkline data={sparklineData} trend={trend || 'neutral'} />
              </div>
            )}
          </div>
        </CardContent>
      </BaseCard>
    );
  }
);

StatCard.displayName = 'StatCard';
