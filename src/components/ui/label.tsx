import * as React from "react"

import { cn } from "@/lib/utils"

// Base UI has no dedicated Label primitive (it expects a native <label>,
// which already does click-to-focus for a real form control via htmlFor —
// exactly how every call site here uses this component).
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
