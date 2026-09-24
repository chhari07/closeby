import "server-only";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";

// OpenAI (ChatGPT) path, picked with AI_PROVIDER=openai. Plain fetch against
// Chat Completions so no extra SDK is needed. Tools are the same betaZodTool
// objects the Claude path uses: their JSON schema, zod `parse` and `run` are
// reused as-is, so the per-helper tool surface and ToolContext scoping stay
// identical whichever provider answers.

export function aiProvider(): "anthropic" | "openai" {
  return process.env.AI_PROVIDER === "openai" ? "openai" : "anthropic";
}

/**
 * One model for every helper; override with OPENAI_MODEL. gpt-4.1, not a
 * mini model: on a 20-item spoken list gpt-4o-mini mixed products from two
 * shops and dropped items, gpt-4.1 got every item right in one pass.
 */
export function openAiModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4.1";
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  refusal?: string | null;
}

interface ChatResponse {
  choices: { message: ChatMessage; finish_reason: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAiRunResult {
  text: string;
  refused: boolean;
  tokensIn: number;
  tokensOut: number;
  toolsUsed: string[];
}

async function chat(body: Record<string, unknown>): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Set it in .env.local — see .env.local.example.");
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as ChatResponse;
}

/** Tool loop: call the model, run any tools it asks for, repeat until it answers in text. */
export async function runOpenAi(opts: {
  system: string;
  user: string;
  /** data: URLs (shelf photos); sent alongside the user text. */
  images?: string[];
  tools: BetaRunnableTool[];
  maxIterations: number;
  maxTokens: number;
}): Promise<OpenAiRunResult> {
  const model = openAiModel();
  const byName = new Map(opts.tools.map((t) => [(t as { name: string }).name, t]));
  const toolSpecs = opts.tools.map((t) => {
    const def = t as unknown as { name: string; description: string; input_schema: unknown };
    return { type: "function", function: { name: def.name, description: def.description, parameters: def.input_schema } };
  });

  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    {
      role: "user",
      content: opts.images?.length
        ? [
            ...opts.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
            { type: "text" as const, text: opts.user },
          ]
        : opts.user,
    },
  ];
  const toolsUsed = new Set<string>();
  let tokensIn = 0;
  let tokensOut = 0;

  for (let step = 0; step <= opts.maxIterations; step++) {
    // Last pass gets no tools, forcing a final text answer.
    const allowTools = toolSpecs.length > 0 && step < opts.maxIterations;
    const res = await chat({
      model,
      max_completion_tokens: opts.maxTokens,
      messages,
      ...(allowTools ? { tools: toolSpecs } : {}),
    });
    tokensIn += res.usage?.prompt_tokens ?? 0;
    tokensOut += res.usage?.completion_tokens ?? 0;

    const msg = res.choices[0]?.message;
    if (!msg) throw new Error("AI returned no response");
    if (msg.refusal) return { text: "", refused: true, tokensIn, tokensOut, toolsUsed: [...toolsUsed] };
    if (!msg.tool_calls?.length) {
      return { text: typeof msg.content === "string" ? msg.content : "", refused: false, tokensIn, tokensOut, toolsUsed: [...toolsUsed] };
    }

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      toolsUsed.add(call.function.name);
      const tool = byName.get(call.function.name);
      let content: string;
      try {
        if (!tool) throw new Error(`Unknown tool ${call.function.name}`);
        const args = tool.parse(JSON.parse(call.function.arguments || "{}"));
        const out = await tool.run(args);
        content = typeof out === "string" ? out : JSON.stringify(out);
      } catch (err) {
        content = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  throw new Error("AI used too many tool steps");
}
