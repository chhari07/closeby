"use client";

import { useEffect } from "react";
import type { Role } from "@/types";

/** Tags <html> with the signed-in role so globals.css can swap the palette. */
export function RoleTheme({ role }: { role: Role | null }) {
  useEffect(() => {
    const root = document.documentElement;
    if (role) root.dataset.role = role;
    else delete root.dataset.role;
    return () => {
      delete root.dataset.role;
    };
  }, [role]);
  return null;
}
