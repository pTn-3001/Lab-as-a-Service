'use client';

import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';

import * as React from 'react';

import { cn } from '../../lib/utils/cn';

const cardContentVariants = cva('p-6 pt-0', {
  variants: {
    variant: {
      default: '',
      /*
       *  metric variant dùng cho hiển thị các chỉ số thống kê trong card
       *  sử dụng grid để dễ dàng bố trí các chỉ số
       *  gap-4 để tạo khoảng cách giữa các chỉ số
       *  @md/card:grid-cols-2 để chuyển sang 2 cột trên màn hình có kích thước từ md trở lên
       *  items-center để căn giữa các chỉ số theo chiều dọc
       */
      metric: 'grid gap-4 @md/card:grid-cols-2 items-center',
      chart: 'p-0',
      muted: 'bg-muted/40 rounded-lg p-4',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

// Tập hợp các props cho CardContent component gồm các props của <div> và các biến thể từ cardContentVariants
export interface CardContentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardContentVariants> {
  asChild?: boolean;
}

/**
 * CardContent – phần thân card, hỗ trợ nhiều variant.
 *
 * Dùng Slot để có thể render ra phần tử khác (ví dụ <section>, <form>...).
 */
export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ asChild, className, variant, ...props }, ref) => {
    const Component = asChild ? Slot : 'div';

    return (
      <Component
        ref={ref}
        data-slot="card-content"
        data-variant={variant ?? 'default'}
        className={cn(cardContentVariants({ variant }), className)}
        {...props}
      />
    );
  }
);

CardContent.displayName = 'CardContent';
