import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500/45 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_1px_2px_rgb(15_23_42/0.12)] hover:bg-primary/90",
        dark:
          "bg-slate-900 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(15_23_42/0.2)] hover:bg-slate-800",
        glass:
          "glass text-slate-800 hover:border-slate-900/15 hover:bg-white/80",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-slate-900/10 bg-white/60 text-slate-800 hover:bg-slate-900/[.04]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-slate-700 hover:bg-slate-900/[.04] hover:text-slate-900",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
