import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';

import * as React from 'react';

import { cn } from '../../lib/utils/cn';

const buttonVariants = cva(
  // Base styles cho toàn bộ các loại button
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-sm font-medium transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[#FF6900] text-white border border-[#FF6900] shadow-[0_0_1px_1px_rgba(0,0,0,0.05)] hover:bg-[#D45700] hover:border-[#D45700]',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-slate-200 bg-white text-slate-800 shadow-[0_0_1px_1px_rgba(0,0,0,0.05)] hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline shadow-none bg-transparent px-0 py-0',
      },
      size: {
        default: 'h-10 px-6 py-2.5',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

// Tập hợp các props cho Button component gồm các props của <button> và các biến thể từ buttonVariants
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

// Button component với hỗ trợ ref forwarding
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, leftIcon, rightIcon, children, ...props }, ref) => {
    // Nếu asChild là true, sử dụng Slot để cho phép tùy chỉnh phần tử gốc
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    // Ngược lại, sử dụng thẻ <button> mặc định
    return (
      <button className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}>
        {leftIcon && <span className="mr-2 inline-flex items-center">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2 inline-flex items-center">{rightIcon}</span>}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
