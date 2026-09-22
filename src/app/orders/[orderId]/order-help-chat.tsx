"use client";

import { useState } from "react";
import { Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AnswerResponse {
  answer: string;
}

/**
 * Step 4.4 (order help chat) — scoped to exactly one order via the
 * server-injected orderId (src/lib/ai/tools/lookup.ts's orderStatus
 * re-checks ownership itself); this widget can't be pointed at any other
 * order. One question at a time rather than a full back-and-forth
 * conversation — keeps this a same-day build instead of a chat-history
 * feature.
 */
export function OrderHelpChat({ orderId }: { orderId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ai/orderHelp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: question.trim(), orderId }),
      });
      const body: { data?: AnswerResponse; error?: string } = await res.json();
      if (!res.ok || !body.data) {
        setError(body.error ?? "Couldn't get an answer right now.");
        return;
      }
      setAnswer(body.data.answer);
    } catch {
      setError("Couldn't reach the AI helper.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <MessageCircleQuestion className="size-4" /> Ask about this order
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="e.g. Is this still on time?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          disabled={loading}
          className="h-9"
        />
        <Button size="icon" disabled={loading || !question.trim()} onClick={ask}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
      {answer && <p className="bg-accent/40 rounded-lg p-2 text-sm">{answer}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
