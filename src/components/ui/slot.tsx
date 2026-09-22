"use client"

import * as React from "react"

// Step 1.8: radix-ui is gone, but the "asChild" composition pattern (render
// Button/Badge as their single child element instead of their own tag —
// e.g. <Button asChild><Link .../></Button>) is still useful and used
// throughout the app. This is our own small stand-in for Radix's Slot,
// scoped to what Button/Badge actually need: merge props (composing event
// handlers, className, style) onto a single child element. Base UI
// primitives elsewhere use their own built-in `render` prop instead of
// this — this file is only for our own components.

type AnyProps = Record<string, unknown>

function composeEventHandlers(theirs: unknown, ours: unknown) {
  return (event: unknown) => {
    if (typeof theirs === "function") theirs(event)
    const prevented =
      typeof event === "object" && event !== null && "defaultPrevented" in event
        ? (event as { defaultPrevented?: boolean }).defaultPrevented
        : false
    if (!prevented && typeof ours === "function") ours(event)
  }
}

function mergeSlotProps(slotProps: AnyProps, childProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...slotProps, ...childProps }
  for (const key in childProps) {
    if (/^on[A-Z]/.test(key) && typeof slotProps[key] === "function" && typeof childProps[key] === "function") {
      merged[key] = composeEventHandlers(slotProps[key], childProps[key])
    }
  }
  if (slotProps.className || childProps.className) {
    merged.className = [slotProps.className, childProps.className].filter(Boolean).join(" ")
  }
  if (slotProps.style || childProps.style) {
    merged.style = { ...(slotProps.style as object), ...(childProps.style as object) }
  }
  return merged
}

export const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>(
  ({ children, ...slotProps }, forwardedRef) => {
    if (!React.isValidElement(children)) return null
    const child = children as React.ReactElement<AnyProps>
    const merged = mergeSlotProps(slotProps as AnyProps, (child.props ?? {}) as AnyProps)
    return React.cloneElement(child, { ...merged, ref: forwardedRef } as AnyProps)
  },
)
Slot.displayName = "Slot"
