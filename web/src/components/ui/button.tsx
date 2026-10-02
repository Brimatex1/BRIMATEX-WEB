import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        // Sun Glare: the brand's call to action ("اشترِ الآن"), always with Dark Ocean ink - never white (1.39:1).
        accent: 'bg-accent text-accent-foreground shadow-sm hover:bg-accent/85',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        // The 2026 handoff's secondary button: a 1 px outline in the text colour.
        outline: 'border border-foreground bg-transparent hover:bg-muted hover:text-foreground',
        // On the navy hero: white, and a white outline.
        inverse: 'bg-white text-dark-ocean hover:bg-white/90',
        'inverse-outline': 'border border-white bg-transparent text-white hover:bg-white/10',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-muted hover:text-foreground',
        // Not text-accent: Sun Glare as ink fails contrast (index.css). highlight is its text-safe twin.
        link: 'text-highlight underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-8 text-base',
        icon: 'h-10 w-10',
        // The storefront's sizes (design/docs/DESIGN.md): 52 px, and 56 px for the page's main action.
        store: 'h-[52px] px-7 text-[15px] [&_svg]:size-5',
        xl: 'h-14 px-8 text-base [&_svg]:size-5',
        'icon-lg': 'size-11 [&_svg]:size-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
