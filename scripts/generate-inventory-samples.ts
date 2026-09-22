/**
 * Generates the bundled sample inventory: one SVG product image per item plus
 * inventory.json and inventory.csv covering every shop type, in the exact
 * format the dashboard's "Import" dialog accepts.
 *
 * Run: npx tsx scripts/generate-inventory-samples.ts
 * Output: public/inventory-samples/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

interface Sample {
  shopType: "kirana" | "pharmacy" | "stationery" | "bakery" | "electronics" | "other";
  name: string;
  brand: string;
  category: string;
  unit: string;
  price: number; // rupees
  mrp: number; // rupees
  stock: number;
  emoji: string;
  hue: number; // background tint
  description: string;
  /** Hindi/Hinglish alternate names (Step 1.10) — omitted where there isn't
   *  a distinct common one (e.g. "pens", "stapler"). */
  aliases: string[];
}

const s = (
  shopType: Sample["shopType"],
  category: string,
  emoji: string,
  hue: number,
  name: string,
  brand: string,
  unit: string,
  price: number,
  mrp: number,
  stock: number,
  description: string,
  aliases: string[] = []
): Sample => ({ shopType, category, emoji, hue, name, brand, unit, price, mrp, stock, description, aliases });

const CATALOG: Sample[] = [
  // Kirana
  s("kirana", "Dairy", "🥛", 200, "Toned Milk", "Amul", "500 ml", 28, 30, 40, "Fresh pasteurised toned milk, 3% fat.", ["doodh", "dudh"]),
  s("kirana", "Dairy", "🧈", 45, "Salted Butter", "Amul", "100 g", 58, 62, 25, "Creamy table butter, ideal for parathas and toast.", ["makhan"]),
  s("kirana", "Staples", "🍚", 40, "Basmati Rice", "India Gate", "1 kg", 110, 130, 30, "Long-grain aged basmati with a rich aroma.", ["chawal", "chaval"]),
  s("kirana", "Staples", "🌾", 35, "Whole Wheat Atta", "Aashirvaad", "5 kg", 245, 270, 20, "Stone-ground whole wheat flour for soft rotis.", ["atta", "gehu ka atta"]),
  s("kirana", "Staples", "🫘", 25, "Toor Dal", "Tata Sampann", "1 kg", 165, 185, 18, "Unpolished protein-rich toor dal.", ["dal", "arhar dal", "tuvar dal"]),
  s("kirana", "Snacks", "🍪", 30, "Parle-G Biscuits", "Parle", "1 pack", 10, 10, 120, "The classic glucose biscuit.", ["biscuit", "parle g"]),
  s("kirana", "Snacks", "🥔", 50, "Classic Salted Chips", "Lay's", "52 g", 20, 20, 80, "Crispy potato chips, lightly salted.", ["chips", "namkeen"]),
  s("kirana", "Beverages", "🍵", 20, "Tea Powder", "Tata Tea Gold", "250 g", 135, 150, 22, "Rich, aromatic blend of Assam tea leaves.", ["chai", "chai patti"]),
  s("kirana", "Beverages", "🥤", 10, "Masala Soda", "Thums Up", "750 ml", 40, 40, 36, "Chilled cola, bold and fizzy.", ["cold drink", "thanda"]),
  s("kirana", "Household", "🧼", 190, "Bathing Soap", "Dettol", "125 g", 42, 48, 60, "Antibacterial soap for everyday protection.", ["sabun", "nahane ka sabun"]),
  // Pharmacy
  s("pharmacy", "Pain Relief", "💊", 350, "Paracetamol 500 mg", "Crocin", "15 tablets", 32, 35, 90, "Relief from fever and mild to moderate pain.", ["bukhar ki dawai", "crocin"]),
  s("pharmacy", "Pain Relief", "🧴", 340, "Pain Relief Spray", "Volini", "40 g", 145, 165, 24, "Fast-acting spray for muscle and joint pain.", ["dard ki spray"]),
  s("pharmacy", "First Aid", "🩹", 15, "Adhesive Bandages", "Band-Aid", "20 strips", 48, 55, 70, "Flexible, breathable bandages for minor cuts.", ["band aid", "patti"]),
  s("pharmacy", "First Aid", "🧪", 5, "Antiseptic Liquid", "Dettol", "250 ml", 98, 110, 35, "Kills 99.9% germs; for cuts, wounds and laundry.", ["dettol"]),
  s("pharmacy", "Vitamins", "🍊", 30, "Vitamin C Tablets", "Limcee", "15 chewables", 25, 25, 55, "Orange-flavoured chewable vitamin C.", ["limcee", "vitamin c"]),
  s("pharmacy", "Devices", "🌡️", 200, "Digital Thermometer", "Omron", "1 piece", 199, 260, 15, "Quick, accurate digital thermometer.", ["thermometer", "bukhar naapne ka"]),
  s("pharmacy", "Personal Care", "😷", 180, "Face Masks", "Nivea", "10 pieces", 60, 80, 45, "3-ply disposable masks with nose clip.", ["mask"]),
  s("pharmacy", "Personal Care", "🧴", 160, "Hand Sanitizer", "Himalaya", "100 ml", 55, 65, 50, "Alcohol-based sanitizer with aloe vera.", ["sanitizer"]),
  // Stationery
  s("stationery", "Writing", "🖊️", 220, "Ball Pens (Blue)", "Reynolds", "10 pens", 80, 100, 60, "Smooth-writing ball pens for exams and office.", ["pen", "kalam"]),
  s("stationery", "Writing", "✏️", 50, "HB Pencils", "Apsara", "10 pencils", 50, 60, 80, "Dark, smooth pencils with easy-erase lead.", ["pencil"]),
  s("stationery", "Paper", "📓", 260, "Ruled Notebook", "Classmate", "172 pages", 60, 70, 100, "Long notebook with 70 GSM ruled pages.", ["copy", "kaapi", "notebook"]),
  s("stationery", "Paper", "📄", 0, "A4 Copier Paper", "JK Paper", "500 sheets", 320, 360, 25, "75 GSM bright white paper for printers.", ["a4 sheet", "kagaz"]),
  s("stationery", "Office", "📎", 210, "Stapler with Pins", "Kangaro", "1 set", 95, 120, 30, "Compact stapler with 1000 staple pins."),
  s("stationery", "Art", "🖍️", 320, "Wax Crayons", "Camlin", "24 shades", 110, 130, 40, "Non-toxic wax crayons for kids.", ["crayons"]),
  s("stationery", "Office", "📐", 170, "Geometry Box", "Camlin", "1 box", 140, 165, 28, "Complete geometry set with compass and divider.", ["geometry box"]),
  s("stationery", "Art", "🖌️", 285, "Poster Colours", "Camel", "12 tubes", 120, 145, 22, "Bright, opaque poster colours.", ["paint", "rang"]),
  // Bakery
  s("bakery", "Bread", "🍞", 35, "Sandwich Bread", "Britannia", "400 g", 45, 50, 30, "Soft, fresh sliced white bread.", ["bread", "double roti"]),
  s("bakery", "Bread", "🥖", 30, "Multigrain Loaf", "Harvest Gold", "350 g", 55, 60, 20, "Fibre-rich multigrain bread.", ["multigrain bread"]),
  s("bakery", "Cakes", "🎂", 340, "Chocolate Cake", "Local Bakery", "500 g", 450, 500, 6, "Moist chocolate sponge with ganache frosting.", ["cake"]),
  s("bakery", "Cakes", "🧁", 320, "Vanilla Cupcakes", "Local Bakery", "4 pieces", 160, 180, 14, "Fluffy cupcakes with buttercream topping.", ["cupcake"]),
  s("bakery", "Pastries", "🥐", 28, "Butter Croissant", "Local Bakery", "1 piece", 55, 60, 18, "Flaky, buttery, baked every morning.", ["croissant"]),
  s("bakery", "Pastries", "🍩", 330, "Glazed Donut", "Local Bakery", "1 piece", 45, 50, 24, "Soft ring donut with sugar glaze.", ["donut", "doughnut"]),
  s("bakery", "Cookies", "🍪", 25, "Choco Chip Cookies", "Local Bakery", "200 g", 110, 125, 26, "Crunchy cookies loaded with chocolate chips.", ["cookies", "biscuit"]),
  s("bakery", "Cookies", "🥨", 40, "Salted Pretzels", "Local Bakery", "150 g", 75, 85, 17, "Baked pretzel twists with coarse salt.", ["pretzel"]),
  // Electronics
  s("electronics", "Accessories", "🔌", 215, "USB-C Fast Charger", "Mi", "20 W", 599, 899, 25, "20 W fast charger with USB-C output.", ["charger"]),
  s("electronics", "Accessories", "🎧", 260, "Wired Earphones", "boAt", "1 piece", 349, 599, 40, "In-ear earphones with mic and deep bass.", ["earphones", "headphones"]),
  s("electronics", "Accessories", "🔋", 130, "Power Bank", "Ambrane", "10000 mAh", 999, 1499, 18, "Compact 10000 mAh power bank, dual output.", ["power bank"]),
  s("electronics", "Lighting", "💡", 50, "LED Bulb 9 W", "Philips", "1 piece", 89, 110, 60, "Energy-saving cool daylight LED bulb.", ["bulb", "led bulb"]),
  s("electronics", "Lighting", "🔦", 45, "Rechargeable Torch", "Eveready", "1 piece", 299, 399, 20, "Bright LED torch with USB charging.", ["torch"]),
  s("electronics", "Batteries", "🔋", 100, "AA Batteries", "Duracell", "4 pack", 140, 160, 55, "Long-lasting alkaline AA cells.", ["battery", "cell"]),
  s("electronics", "Cables", "🔗", 235, "Micro-USB Cable", "Portronics", "1 m", 149, 249, 35, "Durable braided sync and charge cable.", ["cable", "charging cable"]),
  s("electronics", "Accessories", "🖱️", 240, "Wireless Mouse", "Logitech", "1 piece", 549, 795, 12, "Silent-click wireless mouse with USB receiver.", ["mouse"]),
  // Other (general store / gifts / home)
  s("other", "Home", "🕯️", 30, "Scented Candle", "Home Decor", "1 piece", 199, 249, 15, "Hand-poured scented candle, 30 hour burn.", ["candle", "mombatti"]),
  s("other", "Home", "🪴", 130, "Small Indoor Plant", "Green Nursery", "1 pot", 249, 299, 12, "Low-maintenance plant in a ceramic pot.", ["plant", "paudha"]),
  s("other", "Gifts", "🎁", 340, "Gift Wrap Set", "Party Time", "5 sheets", 99, 120, 30, "Assorted wrapping sheets with ribbon.", ["gift wrap"]),
  s("other", "Gifts", "🎈", 355, "Party Balloons", "Party Time", "25 pieces", 70, 90, 45, "Multicolour latex balloons.", ["balloons", "gubbare"]),
  s("other", "Kitchen", "🥣", 195, "Steel Mixing Bowl", "Prestige", "1 piece", 175, 210, 22, "Stainless-steel mixing bowl with lid.", ["katora", "bowl"]),
  s("other", "Kitchen", "🍽️", 210, "Dinner Plates", "Cello", "6 pieces", 399, 499, 14, "Break-resistant dinner plates, set of 6.", ["thali", "plates"]),
  s("other", "Toys", "🧸", 20, "Soft Teddy Bear", "Funzoo", "1 piece", 349, 449, 10, "Plush teddy bear, 30 cm.", ["teddy bear", "soft toy"]),
  s("other", "Toys", "🧩", 275, "Jigsaw Puzzle", "Funskool", "100 pieces", 199, 249, 16, "100-piece jigsaw puzzle for ages 5+.", ["puzzle"]),
];

const outDir = path.join(process.cwd(), "public", "inventory-samples");
const imgDir = path.join(outDir, "images");
mkdirSync(imgDir, { recursive: true });

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function svg(item: Sample) {
  const { hue, emoji, name } = item;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${name}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 85% 92%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 30) % 360} 75% 80%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="200" cy="205" r="130" fill="#fff" fill-opacity="0.55"/>
  <text x="200" y="250" font-size="150" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text>
</svg>
`;
}

const rows = CATALOG.map((item) => {
  const file = `${item.shopType}-${slug(item.name)}-${slug(item.brand)}.svg`;
  writeFileSync(path.join(imgDir, file), svg(item));
  return {
    shopType: item.shopType,
    name: item.name,
    brand: item.brand,
    category: item.category,
    unit: item.unit,
    price: item.price,
    mrp: item.mrp,
    stock: item.stock,
    imageUrl: `/inventory-samples/images/${file}`,
    description: item.description,
    aliases: item.aliases,
  };
});

writeFileSync(path.join(outDir, "inventory.json"), JSON.stringify(rows, null, 2) + "\n");

const columns = [
  "shopType",
  "name",
  "brand",
  "category",
  "unit",
  "price",
  "mrp",
  "stock",
  "imageUrl",
  "description",
  "aliases",
] as const;
const esc = (v: string | number | string[]) => {
  const str = Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};
const csv = [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
writeFileSync(path.join(outDir, "inventory.csv"), csv + "\n");

console.log(`Wrote ${rows.length} products + images to ${outDir}`);
