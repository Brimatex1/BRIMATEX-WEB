import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors',
          'placeholder:text-muted-foreground/70',
          'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/20',
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
