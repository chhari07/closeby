"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mic, MicOff, Loader2, Sparkles, Send } from "lucide-react";
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
import { useCartStore, type CartItem } from "@/lib/store/cart";
import { confirmApproval, rejectApproval } from "@/actions/ai";

interface DraftResponse {
  approvalId: string | null;
  summary: string;
}

interface CartDraft {
  shopId: string;
  shopName: string;
  items: CartItem[];
}

type Stage = "input" | "loading" | "result" | "error";

/**
 * Buyer-facing entry point for Step 4.2 (sentence -> cart), with a mic
 * option for a voice note alongside typing. Voice-to-text runs entirely in
 * the browser (Web Speech API) — only the resulting text is ever sent
 * anywhere, same as typed input; the mic audio itself never leaves the
 * device.
 */
export function AiCartDialog({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<VoiceLanguage>("en-IN");
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const cart = useCartStore();
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
    if (!lat || !lng) {
      toast.error("Set your location first so the AI can find a nearby shop.");
      return;
    }
    setStage("loading");
    try {
      const res = await fetch("/api/ai/buyerCartDraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text.trim(), lat, lng }),
      });
      const body: { data?: DraftResponse; error?: string } = await res.json();
      if (!res.ok || !body.data) {
        setErrorMsg(body.error ?? "The AI couldn't help with that just now — try browsing shops instead.");
        setStage("error");
        return;
      }
      setDraft(body.data);
      setStage("result");
    } catch {
      setErrorMsg("Couldn't reach the AI cart helper. Try browsing shops instead.");
      setStage("error");
    }
  }

  async function confirm() {
    if (!draft?.approvalId) return;
    setBusy(true);
    const result = await confirmApproval(draft.approvalId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not apply this cart");
      return;
    }
    const applied = result.data?.draft as CartDraft | undefined;
    if (applied) {
      cart.applyDraftItems(applied.shopId, applied.shopName, applied.items);
      toast.success(`Added ${applied.items.length} item(s) to your cart`);
    }
    setOpen(false);
    reset();
    router.push("/cart");
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
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button
        className="fixed bottom-20 right-4 z-40 h-12 gap-2 rounded-full px-4 shadow-lg sm:bottom-6"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" />
        Ask AI to shop
      </Button>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tell the AI what you need</DialogTitle>
          <DialogDescription>
            Type or use your voice — e.g. &quot;dal chawal for 4&quot;. It only ever drafts a cart; nothing is
            ordered until you confirm.
          </DialogDescription>
        </DialogHeader>

        {stage === "input" && (
          <div className="flex flex-col gap-3">
            <Textarea
              autoFocus
              placeholder="dal chawal chahiye 4 logo ke liye…"
              value={voice.status === "listening" && voice.interimTranscript ? `${text} ${voice.interimTranscript}`.trim() : text}
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
                mic again — or just type your request above.
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
            <p className="text-muted-foreground text-sm">Finding what you need nearby…</p>
          </div>
        )}

        {stage === "result" && draft && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{draft.summary}</p>
            {!draft.approvalId && (
              <p className="text-muted-foreground text-xs">Nothing to add yet — try rephrasing, or browse shops.</p>
            )}
          </div>
        )}

        {stage === "error" && <p className="text-destructive text-sm">{errorMsg}</p>}

        <DialogFooter>
          {stage === "input" && (
            <Button className="min-h-11" disabled={!text.trim()} onClick={submit}>
              <Send className="size-4" />
              Ask AI
            </Button>
          )}
          {stage === "result" && draft?.approvalId && (
            <>
              <Button variant="outline" className="min-h-11" disabled={busy} onClick={reject}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Not this"}
              </Button>
              <Button className="min-h-11" disabled={busy} onClick={confirm}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Add to cart"}
              </Button>
            </>
          )}
          {(stage === "error" || (stage === "result" && !draft?.approvalId)) && (
            <Button variant="outline" className="min-h-11" onClick={reset}>
              Try again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
