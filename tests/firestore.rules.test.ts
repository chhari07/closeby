import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

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

  it("an owner can edit their own shop", async () => {
    const ownerADb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertSucceeds(updateDoc(doc(ownerADb, "shops", "live-shop-a"), { name: "Renamed" }));
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

  it("the shop owner can advance status on their own order", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_A_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(ownerDb, "orders", "order-1"), {
        status: "ACCEPTED",
        updatedAt: Date.now(),
        timeline: [
          { status: "PLACED", at: Date.now(), by: "buyer" },
          { status: "ACCEPTED", at: Date.now(), by: "shop" },
        ],
      })
    );
  });

  it("an unrelated user cannot read the order", async () => {
    const strangerDb = testEnv.authenticatedContext(OWNER_B_UID).firestore();
    await assertFails(getDoc(doc(strangerDb, "orders", "order-1")));
  });
});
