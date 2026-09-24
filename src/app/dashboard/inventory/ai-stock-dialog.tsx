"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Mic, MicOff, Loader2, Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceInput, VOICE_LANGUAGES, type VoiceLanguage } from "@/lib/hooks/use-voice-input";
import { confirmApproval, rejectApproval } from "@/actions/ai";
import type { BulkImportResult } from "@/actions/products";
import type { ProductDoc } from "@/types";

interface DraftItem {
  name: string;
  brand?: string;
  unit: string;
  category: string;
  price: number; // rupees
  mrp?: number; // rupees
  stock: number;
  confidence: number;
  /** Set by the server when the shop already lists a product with this name. */
  existingProductId?: string | null;
}

interface DraftResponse {
  approvalId: string;
  items: DraftItem[];
  summary: string;
}

/** One editable row of the review table. */
interface Row extends DraftItem {
  include: boolean;
}

/** Below this, a row is highlighted for a second look before importing. */
const LOW_CONFIDENCE = 0.6;
const MAX_PHOTOS = 3;
/** Longest side after shrinking — enough to read pack labels, well under 1 MB as JPEG. */
const PHOTO_MAX_SIDE = 1600;

type Stage = "input" | "loading" | "result" | "error";
type Mode = "voice" | "photo";

/** Shrink a camera photo in the browser so the upload stays small. */
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * Step 3.1 (Flow A): voice/text or shelf photo -> draft stock list. The owner
 * speaks, types ("rice 5kg 60, dal 120") or photographs a shelf; stockDraft
 * turns it into a draft the owner reviews and corrects below before anything
 * is imported. Photos are shrunk in the browser, sent once to the model and
 * never stored. Confirm goes through the same bulkImportProducts path the
 * JSON/CSV import uses.
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
  const [mode, setMode] = useState<Mode>("voice");
  const [language, setLanguage] = useState<VoiceLanguage>("en-IN");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>("input");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [edited, setEdited] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput(language);

  const listening = voice.status === "listening";
  /** What's in the box right now, including words the mic hasn't finalised yet. */
  const spokenText = listening && voice.interimTranscript ? `${text} ${voice.interimTranscript}`.trim() : text;
  const canSubmit = mode === "photo" ? photos.length > 0 : Boolean(spokenText.trim());
  const includedCount = rows.filter((r) => r.include).length;

  function reset() {
    setStage("input");
    setDraft(null);
    setRows([]);
    setEdited(false);
    setErrorMsg("");
    setText("");
    setPhotos([]);
    voice.stop();
  }

  function toggleMic() {
    if (voice.status === "listening") {
      voice.stop();
      return;
    }
    voice.start((finalText) => setText((prev) => (prev ? `${prev} ${finalText}` : finalText)));
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (picked.length > room) toast.error(`Up to ${MAX_PHOTOS} photos at a time`);
    try {
      const shrunk = await Promise.all(picked.slice(0, room).map(shrinkPhoto));
      setPhotos((prev) => [...prev, ...shrunk]);
    } catch {
      toast.error("Couldn't read that photo — try a JPEG or PNG");
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function submit() {
    if (!canSubmit) return;
    // Submitting mid-recording: keep the words still being recognised, and
    // turn the mic off so nothing more lands in the box behind the loader.
    const input = (mode === "voice" ? spokenText : text).trim();
    voice.stop();
    setText(input);
    setStage("loading");
    try {
      const res = await fetch("/api/ai/stockDraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          shopId,
          ...(mode === "photo" ? { images: photos } : {}),
        }),
      });
      const body: { data?: DraftResponse; error?: string } = await res.json();
      if (!res.ok || !body.data) {
        setErrorMsg(body.error ?? "The AI couldn't read that — try the JSON/CSV import instead.");
        setStage("error");
        return;
      }
      setDraft(body.data);
      // Rows the shop already lists start unticked, so a restock photo
      // doesn't create duplicates unless the owner asks for it.
      const initial = body.data.items.map((item) => ({ ...item, include: !item.existingProductId }));
      setRows(initial);
      setEdited(initial.some((r) => !r.include));
      setStage("result");
    } catch {
      setErrorMsg("Couldn't reach the AI helper. Try the JSON/CSV import instead.");
      setStage("error");
    }
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setEdited(true);
  }

  async function confirm() {
    if (!draft?.approvalId) return;
    setBusy(true);
    const stockItems = rows
      .filter((r) => r.include)
      .map(({ name, brand, unit, category, price, mrp, stock }) => ({
        name,
        unit,
        category,
        price,
        stock,
        ...(brand ? { brand } : {}),
        ...(mrp ? { mrp } : {}),
      }));
    const result = await confirmApproval(draft.approvalId, edited ? { stockItems } : undefined);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add stock with AI</DialogTitle>
          <DialogDescription>
            Say or type what came in, or take a photo of a shelf. Nothing is added until you check the list and
            confirm.
          </DialogDescription>
        </DialogHeader>

        {stage === "input" && (
          <Tabs
            value={mode}
            onValueChange={(v) => {
              voice.stop();
              setMode(v as Mode);
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="voice" className="flex-1">
                <Mic className="size-4" /> Voice / text
              </TabsTrigger>
              <TabsTrigger value="photo" className="flex-1">
                <Camera className="size-4" /> Shelf photo
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {stage === "input" && mode === "voice" && (
          <div className="flex flex-col gap-3">
            <Textarea
              autoFocus
              placeholder="rice 5kg 60, dal 120…"
              value={spokenText}
              // Typing while the mic is on would fold the unfinished words into
              // the text and then get them again from the mic — so wait.
              readOnly={listening}
              onChange={(e) => setText(e.target.value)}
              className="min-h-24"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {VOICE_LANGUAGES.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    disabled={listening}
                    onClick={() => setLanguage(l.value)}
                    className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${
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
            {listening && (
              <p className="text-muted-foreground text-xs">
                Listening… say each item with its size and price. Tap the mic to stop — it also stops by itself
                after a short silence.
              </p>
            )}
            {voice.status === "error" && voice.errorMessage && (
              <p className="text-destructive text-xs">{voice.errorMessage}</p>
            )}
            {voice.status === "unsupported" && (
              <p className="text-muted-foreground text-xs">
                Voice input isn&apos;t available in this browser — typing works the same.
              </p>
            )}
          </div>
        )}

        {stage === "input" && mode === "photo" && (
          <div className="flex flex-col gap-3">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => addPhotos(e.target.files)}
            />
            <div className="grid grid-cols-3 gap-2">
              {photos.map((src, i) => (
                <div key={i} className="bg-muted relative aspect-square overflow-hidden rounded-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Shelf photo ${i + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    className="bg-background/80 absolute top-1 right-1 rounded-full p-1"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="text-muted-foreground hover:bg-accent flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs"
                >
                  <Camera className="size-5" />
                  {photos.length === 0 ? "Take or pick a photo" : "Add another"}
                </button>
              )}
            </div>
            <Textarea
              placeholder="Optional note, e.g. “all at MRP” or “12 of each”"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-14"
            />
            <p className="text-muted-foreground text-xs">
              Get close enough to read the packs. Shelves rarely show selling prices, so check the prices before
              importing. Photos are only used for this and aren&apos;t saved.
            </p>
          </div>
        )}

        {stage === "loading" && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-muted-foreground text-sm">
              {mode === "photo" ? "Reading your shelf…" : "Parsing your stock update…"}
            </p>
          </div>
        )}

        {stage === "result" && draft && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{draft.summary}</p>
            <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${
                    !row.include
                      ? "opacity-60"
                      : row.confidence < LOW_CONFIDENCE
                        ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                        : "border-border"
                  }`}
                  title={
                    row.confidence < LOW_CONFIDENCE
                      ? "The AI wasn't fully sure about this row — check it before importing"
                      : undefined
                  }
                >
                  <Checkbox
                    className="mt-2"
                    checked={row.include}
                    onCheckedChange={(checked) => updateRow(i, { include: Boolean(checked) })}
                    aria-label={`Import ${row.name}`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      className="h-8 text-xs"
                      aria-label="Name"
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        value={row.price}
                        onChange={(e) => updateRow(i, { price: Number(e.target.value) })}
                        className="h-8 w-20 text-xs"
                        aria-label="Price"
                      />
                      <span className="text-muted-foreground">qty</span>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        value={row.stock}
                        onChange={(e) => updateRow(i, { stock: Math.max(0, Math.round(Number(e.target.value))) })}
                        className="h-8 w-16 text-xs"
                        aria-label="Quantity"
                      />
                    </div>
                    <p className="text-muted-foreground truncate">
                      {[row.brand, row.unit, row.category, row.mrp ? `MRP ₹${row.mrp}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                      {row.existingProductId && (
                        <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">
                          · already in your inventory
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Yellow rows need a second look. Untick anything you don&apos;t want to add.
            </p>
          </div>
        )}

        {stage === "error" && <p className="text-destructive text-sm">{errorMsg}</p>}

        <DialogFooter>
          {stage === "input" && (
            <Button className="min-h-11" disabled={!canSubmit} onClick={submit}>
              <Send className="size-4" />
              {mode === "photo" ? "Read this shelf" : "Ask AI to parse this"}
            </Button>
          )}
          {stage === "result" && (
            <>
              <Button variant="outline" className="min-h-11" disabled={busy} onClick={reject}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Discard"}
              </Button>
              <Button className="min-h-11" disabled={busy || includedCount === 0} onClick={confirm}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  `Import ${includedCount} item${includedCount === 1 ? "" : "s"}`
                )}
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
