"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REJECTION_REASONS } from "@/types";

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  onConfirm,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onConfirm: (reason: string) => void;
  submitting: boolean;
}) {
  const [selected, setSelected] = useState<string>(REJECTION_REASONS[0]);
  const [custom, setCustom] = useState("");

  const reason = selected === "Other" ? custom.trim() : selected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {REJECTION_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelected(r)}
              className={`min-h-11 rounded-lg border px-3 text-left text-sm ${
                selected === r ? "border-primary bg-accent" : "border-border"
              }`}
            >
              {r}
            </button>
          ))}
          {selected === "Other" && (
            <Textarea
              placeholder="Tell the buyer what happened"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
        </div>
        <DialogFooter>
          <Button
            className="min-h-11 w-full"
            disabled={!reason || submitting}
            onClick={() => onConfirm(reason)}
          >
            {submitting ? "Submitting..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
