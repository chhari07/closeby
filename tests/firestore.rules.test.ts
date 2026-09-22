import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const BUYER_UID = "buyer-1";
const OWNER_A_UID = "owner-a";
const OWNER_B_UID = "owner-b";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "closeby-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed data as admin, bypassing rules.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "shops", "draft-shop"), {
      ownerId: OWNER_A_UID,
      status: "draft",
      onboardingStep: 3,
      isOpen: false,
      type: "kirana",
      name: "Draft Shop",
      phone: "9999999999",
      itemCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await setDoc(doc(db, "shops", "live-shop-a"), {
      ownerId: OWNER_A_UID,
      status: "live",
      onboardingStep: 4,
      isOpen: true,
      type: "kirana",
      name: "Owner A's Shop",
      phone: "9999999999",
      itemCount: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await setDoc(doc(db, "users", BUYER_UID), {
      role: "buyer",
      name: "Test Buyer",
      phone: "9876543210",
    });
    await setDoc(doc(db, "users", OWNER_A_UID), { role: "owner", name: "Owner A" });
    await setDoc(doc(db, "shops", "live-shop-a", "products", "p1"), {
      name: "Milk",
      unit: "1 L",
      price: 5000,
      stock: 10,
      inStock: true,
    });
    await setDoc(doc(db, "aiRuns", "run-1"), {
      userId: BUYER_UID,
      helper: "hello",
      model: "claude-haiku-4-5",
      result: "ok",
      createdAt: Date.now(),
    });
    await setDoc(doc(db, "approvals", "approval-1"), {
      userId: BUYER_UID,
      type: "draftCart",
      draft: { shopId: "live-shop-a", items: [] },
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    });
    await setDoc(doc(db, "aiUsage", `${BUYER_UID}_2026-01-01`), {
      userId: BUYER_UID,
      date: "2026-01-01",
      costUsd: 0.01,
      requests: 1,
    });
    await setDoc(doc(db, "aiSettings", "hello"), { helper: "hello", shopId: null, enabled: true });
    await setDoc(doc(db, "orders", "order-1"), {
      buyerId: BUYER_UID,
      shopId: "live-shop-a",
      shopName: "Owner A's Shop",
      buyerName: "Test Buyer",
      buyerPhone: "9876543210",
      items: [{ productId: "p1", name: "Milk", unit: "1 L", price: 5000, qty: 2 }],
      itemTotal: 10000,
      status: "PLACED",
      timeline: [{ status: "PLACED", at: Date.now(), by: "buyer" }],
      deliveryAddress: { line1: "123 Main St", landmark: "", lat: 24.6, lng: 77.3 },
      paymentMethod: "cod",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
});

describe("shops", () => {
  it("a buyer cannot read a draft shop", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(getDoc(doc(buyerDb, "shops", "draft-shop")));
  });

  it("the owner can read their own draft shop", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "shops", "draft-shop")));
  });

  it("anyone signed in can read a live shop", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertSucceeds(getDoc(doc(buyerDb, "shops", "live-shop-a")));
  });

  it("a shop owner cannot edit another shop", async () => {
    const ownerBDb = testEnv.authenticatedContext(OWNER_B_UID).firestore();
    await assertFails(updateDoc(doc(ownerBDb, "shops", "live-shop-a"), { name: "Hijacked" }));
  });

  it("an owner cannot edit their own shop directly (server actions only)", async () => {
    const ownerADb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(updateDoc(doc(ownerADb, "shops", "live-shop-a"), { name: "Renamed" }));
  });

  it("an owner cannot set their draft shop live directly", async () => {
    const ownerADb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(updateDoc(doc(ownerADb, "shops", "draft-shop"), { status: "live" }));
  });

  it("a user cannot create a shop that is already live", async () => {
    const ownerBDb = testEnv.authenticatedContext(OWNER_B_UID).firestore();
    await assertFails(
      setDoc(doc(ownerBDb, "shops", "new-shop"), { ownerId: OWNER_B_UID, status: "live", isOpen: true })
    );
  });

  it("an owner cannot delete their shop", async () => {
    const ownerADb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(deleteDoc(doc(ownerADb, "shops", "live-shop-a")));
  });
});

describe("users", () => {
  it("a user can read their own profile", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertSucceeds(getDoc(doc(buyerDb, "users", BUYER_UID)));
  });

  it("a user cannot read another user's profile", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(getDoc(doc(buyerDb, "users", OWNER_A_UID)));
  });

  it("a user cannot change their own role", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(updateDoc(doc(buyerDb, "users", BUYER_UID), { role: "owner" }));
  });
});

describe("products", () => {
  it("anyone signed in can read a product of a live shop", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertSucceeds(getDoc(doc(buyerDb, "shops", "live-shop-a", "products", "p1")));
  });

  it("a non-owner cannot write a product", async () => {
    const ownerBDb = testEnv.authenticatedContext(OWNER_B_UID).firestore();
    await assertFails(updateDoc(doc(ownerBDb, "shops", "live-shop-a", "products", "p1"), { price: 1 }));
    await assertFails(
      setDoc(doc(ownerBDb, "shops", "live-shop-a", "products", "p2"), { name: "Fake", price: 1 })
    );
  });

  it("even the shop owner cannot write a product directly (server actions only)", async () => {
    const ownerADb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(updateDoc(doc(ownerADb, "shops", "live-shop-a", "products", "p1"), { stock: 9999 }));
  });
});

describe("orders", () => {
  it("no one can mutate items on an existing order (buyer)", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(
      updateDoc(doc(buyerDb, "orders", "order-1"), {
        items: [{ productId: "p1", name: "Milk", unit: "1 L", price: 1, qty: 99 }],
      })
    );
  });

  it("no one can mutate itemTotal on an existing order (shop owner)", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(updateDoc(doc(ownerDb, "orders", "order-1"), { itemTotal: 1 }));
  });

  it("a buyer cannot create an order directly", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(
      setDoc(doc(buyerDb, "orders", "order-fake"), {
        buyerId: BUYER_UID,
        shopId: "live-shop-a",
        items: [{ productId: "p1", name: "Milk", unit: "1 L", price: 1, qty: 1 }],
        itemTotal: 1,
        status: "PLACED",
      })
    );
  });

  it("a buyer cannot change the order status directly", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(updateDoc(doc(buyerDb, "orders", "order-1"), { status: "DELIVERED" }));
  });

  it("the shop owner cannot change the order status directly (server actions only)", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(updateDoc(doc(ownerDb, "orders", "order-1"), { status: "ACCEPTED" }));
  });

  it("no one can delete an order", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(deleteDoc(doc(buyerDb, "orders", "order-1")));
  });

  it("the buyer and the shop owner can read the order", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    const ownerDb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertSucceeds(getDoc(doc(buyerDb, "orders", "order-1")));
    await assertSucceeds(getDoc(doc(ownerDb, "orders", "order-1")));
  });

  it("a different buyer cannot read the order", async () => {
    const otherBuyerDb = testEnv.authenticatedContext("buyer-2").firestore();
    await assertFails(getDoc(doc(otherBuyerDb, "orders", "order-1")));
  });

  it("an unrelated user cannot read the order", async () => {
    const strangerDb = testEnv.authenticatedContext(OWNER_B_UID).firestore();
    await assertFails(getDoc(doc(strangerDb, "orders", "order-1")));
  });
});

describe("AI collections (Step 2)", () => {
  it("a user can read their own aiRuns entry", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertSucceeds(getDoc(doc(buyerDb, "aiRuns", "run-1")));
  });

  it("a user cannot read another user's aiRuns entry", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(getDoc(doc(ownerDb, "aiRuns", "run-1")));
  });

  it("no one can write an aiRuns entry directly", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(updateDoc(doc(buyerDb, "aiRuns", "run-1"), { result: "ok" }));
  });

  it("a user can read their own pending approval", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertSucceeds(getDoc(doc(buyerDb, "approvals", "approval-1")));
  });

  it("a user cannot read another user's approval", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(getDoc(doc(ownerDb, "approvals", "approval-1")));
  });

  it("no one can confirm/reject an approval by writing to it directly", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(updateDoc(doc(buyerDb, "approvals", "approval-1"), { status: "approved" }));
  });

  it("a user can read their own aiUsage counter", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertSucceeds(getDoc(doc(buyerDb, "aiUsage", `${BUYER_UID}_2026-01-01`)));
  });

  it("a user cannot read another user's aiUsage counter", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(getDoc(doc(ownerDb, "aiUsage", `${BUYER_UID}_2026-01-01`)));
  });

  it("a user cannot inflate their own aiUsage counter directly", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertFails(updateDoc(doc(buyerDb, "aiUsage", `${BUYER_UID}_2026-01-01`), { costUsd: 0 }));
  });

  it("any signed-in user can read aiSettings (to show on/off state)", async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_UID).firestore();
    await assertSucceeds(getDoc(doc(buyerDb, "aiSettings", "hello")));
  });

  it("a shop owner cannot flip their own aiSettings switch directly", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertFails(updateDoc(doc(ownerDb, "aiSettings", "hello"), { enabled: false }));
  });
});
