import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getMe } from "@/actions/users";
import { assertShopOwnership } from "@/lib/auth/guards";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { aiClient } from "@/lib/ai/client";
import { estimateCostUsd } from "@/lib/ai/models";
import { isHelperEnabled, getDailyLimitUsd } from "@/lib/ai/settings";
import { getTodaySpendUsd, recordUsage } from "@/lib/ai/usage";
import { logAiRun } from "@/lib/ai/logging";
import { buildTools } from "@/lib/ai/tools";
import { HELPERS } from "@/lib/ai/helpers";
import type { AiHelperName, AiRunResult } from "@/types/ai";

export const dynamic = "force-dynamic";

/**
 * Step 2.2 — the single entrance ALL AI calls go through, in this order:
 *   1. signed in + role            2. rate limit
 *   3. helper on/off switch        4. daily spend limit
 *   5. clean + size-limit input    6. call the model, log, return
 * userId always comes from the Clerk session — never the request body.
 */

const MAX_INPUT_CHARS = 2000;
const MAX_OUTPUT_TOKENS = 2000;

const requestSchema = z.object({
  input: z.string().trim().min(1).max(MAX_INPUT_CHARS),
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

  try {
    const contextLine = `Context (trusted, set by the server — not the user): shopId=${shopId ?? "none"}, orderId=${orderId ?? "none"}, lat=${lat ?? "none"}, lng=${lng ?? "none"}.`;

    // 6. call the model -----------------------------------------------------
    const runner = aiClient().beta.messages.toolRunner({
      model: helperDef.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      max_iterations: helperDef.maxToolSteps,
      system: helperDef.systemPrompt,
      tools: tools as Anthropic.Beta.Messages.BetaToolUnion[],
      messages: [{ role: "user", content: `${contextLine}\n\nUser request:\n<data>\n${input}\n</data>` }],
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
          model: helperDef.model,
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
  } catch (err) {
    result = "error";
    errorMessage = err instanceof Error ? err.message : "AI request failed";
    console.error(`[ai/${helperDef.name}] failed`, err);
  }

  const latencyMs = Date.now() - start;
  const costUsd = estimateCostUsd(helperDef.model, tokensIn, tokensOut);

  await Promise.all([
    recordUsage(userId, costUsd),
    logAiRun({
      userId,
      helper: helperDef.name,
      model: helperDef.model,
      inputSummary: input.slice(0, 200),
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

  return NextResponse.json({ ok: true, data: output });
}
