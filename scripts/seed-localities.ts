/**
 * Seeds the `localities` table for Guna, MP. Safe to re-run (upserts).
 *
 * Usage: npm run seed:localities
 * Requires DATABASE_URL in .env.local.
 *
 * Coordinates are approximate (centered on well-known Guna landmarks/areas)
 * — good enough to seed a hyperlocal MVP's fallback locality picker and
 * "nearest locality" lookup. Replace with geocoded values before relying on
 * them for anything precision-sensitive.
 */
import { geohashForLocation } from "geofire-common";
import { connect } from "./lib/db";

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
  const sql = connect();
  for (const [name, lat, lng] of LOCALITIES) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const row = { id, name, city: CITY, center: sql.json({ lat, lng }), geohash: geohashForLocation([lat, lng]) };
    await sql`
      insert into localities ${sql(row)}
      on conflict (id) do update set name = excluded.name, city = excluded.city, center = excluded.center, geohash = excluded.geohash
    `;
  }
  console.log(`Seeded ${LOCALITIES.length} localities for ${CITY}.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
