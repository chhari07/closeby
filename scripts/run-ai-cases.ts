/**
 * Roadmap §2.8 runner: POSTs every tests/ai/cases/*.json case at a running
 * dev server's /api/ai/{helper} route and checks the response shape.
 *
 * This is NOT a vitest suite — the AI route needs a real, signed-in Clerk
 * session and a real ANTHROPIC_API_KEY, neither of which a unit test can
 * fake. Run it against `npm run dev` with a browser session's cookie:
 *
 *   BASE_URL=http://localhost:3000 \
 *   SESSION_COOKIE="__session=...; __client=..." \
 *   npm run test:ai
 *
 * Get SESSION_COOKIE from your browser's devtools (Application > Cookies)
 * while signed in. Cases that need a shopId/orderId fixture (the
 * "__fixture_*__" placeholders) are skipped unless AI_TEST_SHOP_ID /
 * AI_TEST_ORDER_ID / AI_TEST_OTHER_SHOP_ORDER_ID are set to real ids from
 * your own dev database — there is no way to fabricate a valid owned shop
 * or order from outside the app.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

interface Case {
  id: string;
  helper: string;
  description: string;
  asRole: "buyer" | "shop_owner";
  request: Record<string, unknown>;
  expect: {
    status: number;
    outputSchemaOk?: boolean;
    expectApprovalIdNull?: boolean;
    expectNoPriceChangeToolCall?: boolean;
  };
}

const CASES_DIR = path.join(process.cwd(), "tests/ai/cases");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SESSION_COOKIE = process.env.SESSION_COOKIE;

const FIXTURES: Record<string, string | undefined> = {
  __fixture_shop_id__: process.env.AI_TEST_SHOP_ID,
  __fixture_order_id__: process.env.AI_TEST_ORDER_ID,
  __fixture_other_shops_order_id__: process.env.AI_TEST_OTHER_SHOP_ORDER_ID,
};

function resolveFixtures(request: Record<string, unknown>): Record<string, unknown> | null {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(request)) {
    if (typeof value === "string" && value in FIXTURES) {
      const real = FIXTURES[value];
      if (!real) return null; // fixture not provided — skip this case
      resolved[key] = real;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

async function runCase(file: string): Promise<"pass" | "fail" | "skip"> {
  const testCase = JSON.parse(readFileSync(path.join(CASES_DIR, file), "utf8")) as Case;
  const request = resolveFixtures(testCase.request);
  if (!request) {
    console.log(`SKIP  ${testCase.id} — needs a real fixture id (see script header)`);
    return "skip";
  }

  const res = await fetch(`${BASE_URL}/api/ai/${testCase.helper}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SESSION_COOKIE ? { Cookie: SESSION_COOKIE } : {}),
    },
    body: JSON.stringify(request),
  });

  const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: string };

  if (res.status !== testCase.expect.status) {
    console.log(`FAIL  ${testCase.id} — expected status ${testCase.expect.status}, got ${res.status} (${body.error ?? ""})`);
    return "fail";
  }
  if (testCase.expect.outputSchemaOk && res.ok && (typeof body.data !== "object" || body.data === null)) {
    console.log(`FAIL  ${testCase.id} — expected a JSON "data" object in the response`);
    return "fail";
  }
  if (testCase.expect.expectApprovalIdNull && body.data?.approvalId !== null && body.data?.approvalId !== undefined) {
    console.log(`FAIL  ${testCase.id} — expected approvalId to be null, got ${JSON.stringify(body.data?.approvalId)}`);
    return "fail";
  }

  console.log(`PASS  ${testCase.id} — ${testCase.description}`);
  return "pass";
}

async function main() {
  if (!SESSION_COOKIE) {
    console.log(
      "No SESSION_COOKIE set — every case will 401. See the comment at the top of " +
        "scripts/run-ai-cases.ts for how to get one from your browser.",
    );
  }

  const files = readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  const results = { pass: 0, fail: 0, skip: 0 };

  for (const file of files) {
    const outcome = await runCase(file);
    results[outcome]++;
  }

  console.log(`\n${results.pass} passed, ${results.fail} failed, ${results.skip} skipped (of ${files.length} cases)`);
  if (results.fail > 0) process.exit(1);
}

main();
