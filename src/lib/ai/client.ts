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

  // An org-wide (unscoped) API key needs this header on every request or
  // the API rejects it with "not scoped to a workspace" — a workspace-scoped
  // key doesn't need it. Get the id from console.anthropic.com under the
  // workspace's settings.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  _client = new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
  return _client;
}
