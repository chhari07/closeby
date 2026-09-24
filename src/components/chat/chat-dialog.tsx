"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getConversation, type ConversationView } from "@/actions/messages";
import { ChatThread } from "./chat-thread";

/** The shop owner's view of one order's conversation, opened from the order card. */
export function ChatDialog({
  orderId,
  title,
  open,
  onOpenChange,
}: {
  orderId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [view, setView] = useState<ConversationView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFailed(false);
    let cancelled = false;
    getConversation(orderId)
      .then((v) => {
        if (cancelled) return;
        if (v) setView(v);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80svh] max-h-[640px] flex-col gap-0">
        <DialogHeader className="border-b pb-3">
          <DialogTitle>{title}</DialogTitle>
          <p className="text-muted-foreground text-xs">Order #{orderId.slice(0, 8).toUpperCase()}</p>
        </DialogHeader>
        {view ? (
          <ChatThread key={view.orderId} initial={view} className="flex-1" />
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            {failed ? "Could not open this conversation." : <Loader2 className="size-5 animate-spin" />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
