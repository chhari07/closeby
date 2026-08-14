/**
 * Seeds the `localities` collection for Guna, MP.
 *
 * Usage: npm run seed:localities
 * Requires FIREBASE_ADMIN_* env vars in .env.local (loaded manually below
 * since this runs outside the Next.js runtime).
 *
 * Coordinates are approximate (centered on well-known Guna landmarks/areas)
 * — good enough to seed a hyperlocal MVP's fallback locality picker and
 * "nearest locality" lookup. Replace with geocoded values before relying on
 * them for anything precision-sensitive.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { geohashForLocation } from "geofire-common";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || process.env[key]) continue;
    process.env[key] = rawValue.replace(/^"|"$/g, "");
  }
}
loadEnvLocal();

const CITY = "Guna";

// [name, lat, lng]
const LOCALITIES: [string, number, number][] = [
  ["Sadar Bazaar", 24.6466, 77.3122],
  ["Cantt Area", 24.652, 77.318],
  ["Vijay Mandir Road", 24.6411, 77.3087],
  ["Bus Stand Area", 24.6489, 77.3151],
  ["Chachoda Road", 24.6558, 77.3204],
  ["Aron Road", 24.6392, 77.3245],
  ["Ashok Nagar Road", 24.638, 77.302],
  ["Collectorate Area", 24.6445, 77.311],
  ["Idgah Road", 24.6502, 77.3079],
  ["Bajrangarh Colony", 24.6614, 77.3266],
];

async function main() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "Missing FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY in .env.local"
    );
    process.exit(1);
  }

  const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const db = getFirestore(app);

  const batch = db.batch();
  for (const [name, lat, lng] of LOCALITIES) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const ref = db.collection("localities").doc(id);
    batch.set(ref, {
      name,
      city: CITY,
      center: { lat, lng },
      geohash: geohashForLocation([lat, lng]),
    });
  }
  await batch.commit();
  console.log(`Seeded ${LOCALITIES.length} localities for ${CITY}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
