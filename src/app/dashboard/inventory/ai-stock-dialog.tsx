"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mic, MicOff, Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceInput, VOICE_LANGUAGES, type VoiceLanguage } from "@/lib/hooks/use-voice-input";
import { confirmApproval, rejectApproval } from "@/actions/ai";
import type { BulkImportResult } from "@/actions/products";
import type { ProductDoc } from "@/types";

interface DraftItem {
  name: string;
  unit: string;
  category: string;
  price: number; // rupees
  stock: number;
  confidence: number;
}

interface DraftResponse {
  approvalId: string;
  items: DraftItem[];
  summary: string;
}

/** Below this, a row is highlighted for a second look before importing. */
const LOW_CONFIDENCE = 0.6;

type Stage = "input" | "loading" | "result" | "error";

/**
 * Step 3.1 (Flow A), voice/text half — the shelf-photo half is explicitly
 * deferred (see the roadmap status discussion). Owner speaks or types a
 * stock update ("rice 5kg 60, dal 120"); stockDraft parses it and writes a
 * draft the owner sees below before anything is actually imported. Confirm
 * goes through the same bulkImportProducts path the JSON/CSV import uses.
 */
export function AiStockDialog({
  shopId,
  open,
  onOpenChange,
  onImported,
}: {
  shopId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (products: ProductDoc[]) => void;
}) {
  const [language, setLanguage] = useState<VoiceLanguage>("en-IN");
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const voice = useVoiceInput(language);

  function reset() {
    setStage("input");
    setDraft(null);
    setErrorMsg("");
    setText("");
    voice.stop();
  }

  function toggleMic() {
    if (voice.status === "listening") {
      voice.stop();
      return;
    }
    voice.start((finalText) => setText((prev) => (prev ? `${prev} ${finalText}` : finalText)));
  }

  async function submit() {
    if (!text.trim()) return;
    setStage("loading");
    try {
      const res = await fetch("/api/ai/stockDraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text.trim(), shopId }),
      });
      const body: { data?: DraftResponse; error?: string } = await res.json();
      if (!res.ok || !body.data) {
        setErrorMsg(body.error ?? "The AI couldn't parse that — try the JSON/CSV import instead.");
        setStage("error");
        return;
      }
      setDraft(body.data);
      setStage("result");
    } catch {
      setErrorMsg("Couldn't reach the AI helper. Try the JSON/CSV import instead.");
      setStage("error");
    }
  }

  async function confirm() {
    if (!draft?.approvalId) return;
    setBusy(true);
    const result = await confirmApproval(draft.approvalId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not import these items");
      return;
    }
    const imported = result.data as BulkImportResult | undefined;
    if (imported?.products.length) {
      onImported(imported.products);
      toast.success(
        imported.failed.length > 0
          ? `Added ${imported.products.length} products, ${imported.failed.length} skipped`
          : `Added ${imported.products.length} products`,
      );
    }
    onOpenChange(false);
    reset();
  }

  async function reject() {
    if (draft?.approvalId) {
      setBusy(true);
      await rejectApproval(draft.approvalId);
      setBusy(false);
    }
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Voice or text stock update</DialogTitle>
          <DialogDescription>
            Say or type what came in — e.g. &quot;rice 5kg 60, dal 120, atta 10kg 350&quot;. Nothing is added
            until you confirm.
          </DialogDescription>
        </DialogHeader>

        {stage === "input" && (
          <div className="flex flex-col gap-3">
            <Textarea
              autoFocus
              placeholder="rice 5kg 60, dal 120…"
              value={
                voice.status === "listening" && voice.interimTranscript
                  ? `${text} ${voice.interimTranscript}`.trim()
                  : text
              }
              onChange={(e) => setText(e.target.value)}
              className="min-h-24"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {VOICE_LANGUAGES.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLanguage(l.value)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      language === l.value ? "border-primary bg-accent" : "border-border"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant={voice.status === "listening" ? "default" : "outline"}
                size="icon"
                disabled={voice.status === "unsupported"}
                onClick={toggleMic}
                title={
                  voice.status === "unsupported"
                    ? "Voice input isn't supported in this browser — try typing instead"
                    : voice.status === "denied"
                      ? "Mic access was denied — allow it in your browser's site settings, then try again"
                      : voice.status === "listening"
                        ? "Stop recording"
                        : "Record a voice note"
                }
              >
                {voice.status === "listening" ? (
                  <Mic className="size-4 animate-pulse" />
                ) : voice.status === "unsupported" || voice.status === "denied" ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
            </div>

            {voice.status === "denied" && (
              <p className="text-destructive text-xs">
                Mic access was denied. Allow microphone access for this site in your browser settings, then tap the
                mic again — or just type the update above.
              </p>
            )}
            {voice.status === "unsupported" && (
              <p className="text-muted-foreground text-xs">
                Voice input isn&apos;t available in this browser — typing works the same.
              </p>
            )}
          </div>
        )}

        {stage === "loading" && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-muted-foreground text-sm">Parsing your stock update…</p>
          </div>
        )}

        {stage === "result" && draft && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{draft.summary}</p>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {draft.items.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs ${
                    item.confidence < LOW_CONFIDENCE
                      ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                      : "border-border"
                  }`}
                  title={
                    item.confidence < LOW_CONFIDENCE
                      ? "The AI wasn't fully sure about this row — check it before importing"
                      : undefined
                  }
                >
                  <span className="min-w-0 flex-1 truncate">
                    {item.name} · {item.unit} · {item.category}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    ₹{item.price.toFixed(2)} · qty {item.stock}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === "error" && <p className="text-destructive text-sm">{errorMsg}</p>}

        <DialogFooter>
          {stage === "input" && (
            <Button className="min-h-11" disabled={!text.trim()} onClick={submit}>
              <Send className="size-4" />
              Ask AI to parse this
            </Button>
          )}
          {stage === "result" && (
            <>
              <Button variant="outline" className="min-h-11" disabled={busy} onClick={reject}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Discard"}
              </Button>
              <Button className="min-h-11" disabled={busy} onClick={confirm}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Import these items"}
              </Button>
            </>
          )}
          {stage === "error" && (
            <Button variant="outline" className="min-h-11" onClick={reset}>
              Try again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
