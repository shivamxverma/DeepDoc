import * as React from "react"

import { cn } from "../../lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-slate-900/10 bg-white/70 px-3 py-1 text-base text-slate-900 shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] backdrop-blur transition-[border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-slate-400 focus-visible:border-indigo-500/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
