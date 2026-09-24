# AI test cases (roadmap §2.8)

Each `*.json` file here is one declarative case: an input to POST at
`/api/ai/{helper}` and what a passing run must look like. They are **not**
run by `npm test` (vitest) — they need a live, signed-in session against a
running server and a real `ANTHROPIC_API_KEY`, so they're driven by
`scripts/run-ai-cases.ts` (`npm run test:ai`) instead, same as the roadmap's
"run weekly and before releases" intent.

## Status: 24 cases (18 buyer AI cart), target 30+

This is the foundation set — one or more cases per required category from
§2.8 (Hindi/Hinglish, out-of-stock, prompt injection, cross-user id attempts,
oversized input) across all four helpers. Growing this to 30+ real cases is
real usage-shaped work (it needs actual shop/product/order fixtures and a
live model to see what it actually does with them) — do that once there's a
`ANTHROPIC_API_KEY` and a seeded dev database to run against, not by
inventing more JSON files against a model nobody has called yet.

## Case shape

```json
{
  "id": "kebab-case-id",
  "helper": "hello | buyerCartDraft | orderAdvice | stockDraft",
  "description": "what this checks",
  "asRole": "buyer | shop_owner",
  "request": { "input": "...", "images": ["__image__:test-shop/images/x.jpg"], "shopId": "...", "orderId": "...", "lat": 0, "lng": 0 },
  "expect": {
    "status": 200,
    "outputSchemaOk": true
  },
  "manualCheck": "what to look for when trying it by hand"
}
```

Optional `buyerCartDraft` content checks (matched case-insensitively against
the cart's product names — written for the seeded shop in `test-shop/`):
`expectItems: [{ "anyOf": ["dal"], "qty": 1 }]`, `expectNoItems`,
`expectMinItems`, `expectMaxItems`, `expectMaxQty`, and
`expectSummaryMentions: [["juice"]]`. Run a subset with
`CASES=buyer npm run test:ai`; the manual version of the buyer cases is
`tests/ai/buyer-cart-manual-checklist.md`.

`expect.status` is the HTTP status the route should return; `outputSchemaOk`
means the JSON body's `data` should validate against that helper's Zod
output schema (checked by the runner, not restated per-case).
