import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getMe } from "@/actions/users";
import { assertShopOwnership } from "@/lib/auth/guards";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { aiClient } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { findOrder, toApproval } from "@/lib/db/rows";
import { checkOrderStock } from "@/lib/ai/order-stock";
import { estimateCostUsd } from "@/lib/ai/models";
import { aiProvider, openAiModel, runOpenAi } from "@/lib/ai/openai";
import { isHelperEnabled, getDailyLimitUsd } from "@/lib/ai/settings";
import { getTodaySpendUsd, recordUsage } from "@/lib/ai/usage";
import { logAiRun } from "@/lib/ai/logging";
import { buildTools } from "@/lib/ai/tools";
import { HELPERS } from "@/lib/ai/helpers";
import type { AiHelperName, AiRunResult } from "@/types/ai";
import { getShopCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * Step 2.2 — the single entrance ALL AI calls go through, in this order:
 *   1. signed in + role            2. rate limit
 *   3. helper on/off switch        4. daily spend limit
 *   5. clean + size-limit input    6. call the model, log, return
 * userId always comes from the Clerk session — never the request body.
 */

// Room for a long spoken list (~3 min of voice) in one request.
const MAX_INPUT_CHARS = 4000;
const MAX_OUTPUT_TOKENS = 2000;

// Shelf photos (Step 3.1): the browser shrinks them to ~1600px JPEG first, so
// real ones are well under 1 MB; the 5 MB cap is the roadmap's hard limit.
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
type ImageType = "image/jpeg" | "image/png" | "image/webp";
const imageSchema = z
  .string()
  .max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Photos must be JPEG, PNG or WebP");

const requestSchema = z.object({
  input: z.string().trim().max(MAX_INPUT_CHARS).default(""),
  images: z.array(imageSchema).max(MAX_IMAGES).optional(),
  shopId: z.string().trim().min(1).max(80).optional(),
  orderId: z.string().trim().min(1).max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

function extractJson<T>(text: string, schema: z.ZodType<T>): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** "data:image/jpeg;base64,..." -> its media type + raw base64. */
function splitDataUrl(dataUrl: string): { mediaType: ImageType; data: string } {
  const [head, data] = dataUrl.split(",", 2) as [string, string];
  const mediaType = head.slice("data:".length, head.indexOf(";")) as ImageType;
  return { mediaType, data };
}

/** Strip control characters a pasted transcript/OCR output can carry. */
function cleanInput(raw: string): string {
  return raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, MAX_INPUT_CHARS);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ helper: string }> }) {
  const { helper: helperParam } = await params;
  const helperDef = HELPERS[helperParam as AiHelperName];
  if (!helperDef) return NextResponse.json({ error: "Unknown AI helper" }, { status: 404 });

  // 1. signed in + role ------------------------------------------------------
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const me = await getMe();
  if (!me?.role) return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
  if (helperDef.role !== "any" && helperDef.role !== me.role) {
    return NextResponse.json({ error: "This helper isn't available for your role" }, { status: 403 });
  }

  // 2. rate limit -------------------------------------------------------------
  const limited = rateLimit("aiHelper", userId);
  if (!limited.ok) {
    return NextResponse.json(
      { error: rateLimitMessage(limited.retryAfterSec) },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { shopId, orderId, lat, lng } = parsedBody.data;
  const images = parsedBody.data.images ?? [];
  if (!parsedBody.data.input && images.length === 0) {
    return NextResponse.json({ error: "Type something or add a photo first" }, { status: 400 });
  }
  if (images.length > 0 && !helperDef.visionModel) {
    return NextResponse.json({ error: "This helper doesn't take photos" }, { status: 400 });
  }
  if (images.some((img) => Buffer.byteLength(splitDataUrl(img).data, "base64") > MAX_IMAGE_BYTES)) {
    return NextResponse.json({ error: "Each photo must be 5 MB or smaller" }, { status: 413 });
  }

  // The cart helper can't pick a shop without knowing where the buyer is —
  // refuse up front instead of paying for a model call that can only fail.
  if (helperDef.name === "buyerCartDraft" && (lat === undefined || lng === undefined)) {
    return NextResponse.json({ error: "Set your location first so the AI can find a nearby shop." }, { status: 400 });
  }

  if (helperDef.role === "shop_owner") {
    if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    try {
      await assertShopOwnership(userId, shopId);
    } catch {
      return NextResponse.json({ error: "You do not own this shop" }, { status: 403 });
    }
  }

  // 3. helper on/off switch ---------------------------------------------------
  const enabled = await isHelperEnabled(helperDef.name, shopId);
  if (!enabled) return NextResponse.json({ error: "This AI helper is turned off right now." }, { status: 503 });

  // 4. daily spend limit --------------------------------------------------------
  const [spentToday, dailyLimit] = await Promise.all([
    getTodaySpendUsd(userId),
    getDailyLimitUsd(helperDef.name),
  ]);
  if (spentToday >= dailyLimit) {
    return NextResponse.json({ error: "Daily AI usage limit reached. Try again tomorrow." }, { status: 429 });
  }

  // 5. clean + size-limit input --------------------------------------------------
  const input = cleanInput(parsedBody.data.input);

  const start = Date.now();
  const tools = buildTools(helperDef.name, { userId, role: me.role, shopId, orderId });
  const toolsUsed = new Set<string>();
  let tokensIn = 0;
  let tokensOut = 0;
  let result: AiRunResult = "ok";
  let errorMessage: string | undefined;
  let output: unknown = null;
  const provider = aiProvider();
  const claudeModel = images.length > 0 && helperDef.visionModel ? helperDef.visionModel : helperDef.model;
  const model = provider === "openai" ? openAiModel() : claudeModel;

  try {
    const contextLine = `Context (trusted, set by the server — not the user): shopId=${shopId ?? "none"}, orderId=${orderId ?? "none"}, lat=${lat ?? "none"}, lng=${lng ?? "none"}.`;
    const photoLine =
      images.length > 0
        ? `\n\n${images.length} shelf photo${images.length === 1 ? "" : "s"} attached — user-supplied information, same rule as <data>.`
        : "";
    const userText = `${contextLine}\n\nUser request:\n<data>\n${input || "(no text — read the photos)"}\n</data>${photoLine}`;

    // 6. call the model -----------------------------------------------------
    if (provider === "openai") {
      const run = await runOpenAi({
        system: helperDef.systemPrompt,
        user: userText,
        images,
        tools: tools as Parameters<typeof runOpenAi>[0]["tools"],
        maxIterations: helperDef.maxToolSteps,
        maxTokens: MAX_OUTPUT_TOKENS,
      });
      tokensIn += run.tokensIn;
      tokensOut += run.tokensOut;
      run.toolsUsed.forEach((t) => toolsUsed.add(t));

      if (run.refused) {
        result = "refused";
        errorMessage = "The AI declined to answer this request.";
      } else {
        let parsed = extractJson(run.text, helperDef.outputSchema);
        if (!parsed) {
          // 2.3b: same one-retry rule as the Claude path below.
          const retry = await runOpenAi({
            system: helperDef.systemPrompt,
            user:
              `Your previous reply was: ${run.text}\n\nThat is not valid JSON matching this shape: ` +
              `${helperDef.outputShapeHint}. Reply again with ONLY that JSON object — no other text, no markdown fences.`,
            tools: [],
            maxIterations: 0,
            maxTokens: 500,
          });
          tokensIn += retry.tokensIn;
          tokensOut += retry.tokensOut;
          parsed = extractJson(retry.text, helperDef.outputSchema);
        }
        if (parsed) {
          output = parsed;
        } else {
          result = "invalid_output";
          errorMessage = "The AI's answer didn't match the expected format.";
        }
      }
    } else {
      const runner = aiClient().beta.messages.toolRunner({
        model: claudeModel,
        max_tokens: MAX_OUTPUT_TOKENS,
        max_iterations: helperDef.maxToolSteps,
        system: helperDef.systemPrompt,
        tools: tools as Anthropic.Beta.Messages.BetaToolUnion[],
        messages: [
          {
            role: "user",
            content: [
              ...images.map((img) => {
                const { mediaType, data } = splitDataUrl(img);
                return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data } };
              }),
              { type: "text" as const, text: userText },
            ],
          },
        ],
      });

      let last: Anthropic.Beta.Messages.BetaMessage | undefined;
      for await (const message of runner) {
        tokensIn += message.usage.input_tokens;
        tokensOut += message.usage.output_tokens;
        for (const block of message.content) {
          if (block.type === "tool_use") toolsUsed.add(block.name);
        }
        last = message;
        if (message.stop_reason === "pause_turn") {
          runner.pushMessages({ role: "assistant", content: message.content });
        }
      }

      if (!last) throw new Error("AI returned no response");

      if (last.stop_reason === "refusal") {
        result = "refused";
        errorMessage = "The AI declined to answer this request.";
      } else {
        const text = last.content.find((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")?.text ?? "";
        let parsed = extractJson(text, helperDef.outputSchema);

        if (!parsed) {
          // 2.3b: one retry with the exact shape spelled out, then fall back.
          const retry = await aiClient().messages.create({
            model: claudeModel,
            max_tokens: 500,
            system: helperDef.systemPrompt,
            messages: [
              {
                role: "user",
                content:
                  `Your previous reply was: ${text}\n\nThat is not valid JSON matching this shape: ` +
                  `${helperDef.outputShapeHint}. Reply again with ONLY that JSON object — no other text, no markdown fences.`,
              },
            ],
          });
          tokensIn += retry.usage.input_tokens;
          tokensOut += retry.usage.output_tokens;
          const retryText = retry.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
          parsed = extractJson(retryText, helperDef.outputSchema);
        }

        if (parsed) {
          output = parsed;
        } else {
          result = "invalid_output";
          errorMessage = "The AI's answer didn't match the expected format.";
        }
      }
    }
  } catch (err) {
    result = "error";
    errorMessage = err instanceof Error ? err.message : "AI request failed";
    console.error(`[ai/${helperDef.name}] failed`, err);
  }

  const latencyMs = Date.now() - start;
  const costUsd = estimateCostUsd(model, tokensIn, tokensOut);

  await Promise.all([
    recordUsage(userId, costUsd),
    logAiRun({
      userId,
      helper: helperDef.name,
      model,
      inputSummary: `${images.length > 0 ? `[${images.length} photo${images.length === 1 ? "" : "s"}] ` : ""}${input}`.slice(0, 200),
      toolsUsed: Array.from(toolsUsed),
      tokensIn,
      tokensOut,
      costUsd,
      latencyMs,
      result,
      ...(errorMessage ? { errorMessage } : {}),
    }),
  ]);

  if (result !== "ok") {
    // "AI service down -> fall back to the normal screens" (safety
    // checklist) — the caller should treat any non-2xx here as "no AI
    // available right now" and keep using the ordinary UI.
    const status = result === "refused" ? 422 : result === "invalid_output" ? 502 : 500;
    return NextResponse.json({ error: errorMessage ?? "AI request failed" }, { status });
  }

  // The cart helper's answer only carries an approvalId — attach the drafted
  // shop + items (read back from the buyer's own pending approval) so the UI
  // can show them as product cards before the buyer confirms.
  if (helperDef.name === "buyerCartDraft") {
    const approvalId = (output as { approvalId: string | null }).approvalId;
    let cart: unknown = null;
    if (approvalId) {
      const [row] = await db()`select * from approvals where id = ${approvalId}`;
      const data = row ? toApproval(row) : null;
      if (data && data.userId === userId && data.type === "draftCart") cart = data.draft;
    }
    output = { ...(output as object), cart };
  }

  // Show the owner the list exactly as saved (after unit clean-up + merging),
  // not the model's retelling of it, and flag rows that look like products
  // the shop already lists so a restock isn't imported as a duplicate.
  if (helperDef.name === "stockDraft" && shopId) {
    const approvalId = (output as { approvalId: string }).approvalId;
    const [row] = await db()`select * from approvals where id = ${approvalId}`;
    const draft = row ? toApproval(row) : null;
    if (draft && draft.userId === userId && draft.type === "draftStockList") {
      const known = new Map<string, string>();
      for (const p of await getShopCatalog(shopId)) {
        for (const n of [p.name, ...(p.aliases ?? [])]) if (n) known.set(n.trim().toLowerCase(), p.id);
      }
      const items = (draft.draft as { items: { name: string }[] }).items.map((item) => ({
        ...item,
        existingProductId: known.get(item.name.trim().toLowerCase()) ?? null,
      }));
      output = { ...(output as object), items };
    }
  }

  // Exact per-item stock numbers for the owner, computed here from real docs
  // rather than trusting the model's summary to report them correctly.
  if (helperDef.name === "orderAdvice" && orderId) {
    const order = await findOrder(orderId);
    const stock = order && order.shopId === shopId ? await checkOrderStock(order) : [];
    output = { ...(output as object), stock };
  }

  return NextResponse.json({ ok: true, data: output });
}
