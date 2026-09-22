import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Lazy singleton, same pattern as src/lib/firebase/admin.ts — importing this
// module (e.g. transitively during `next build`) must not require
// ANTHROPIC_API_KEY to be set; only an actual AI request pays that cost.
let _client: Anthropic | undefined;

export function aiClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Set it in .env.local — see .env.local.example.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}
