/**
 * Generates an electronics-only sample catalog (JSON + CSV + one SVG image per
 * item) in the format the Import dialog accepts.
 *
 * Run: npx tsx scripts/generate-electronics-sample.ts
 * Output: public/inventory-samples/electronics.{json,csv} and images/electronics-*.svg
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Trailing aliases element is optional — Hindi/Hinglish alternate names
// (Step 1.10), only where there's a distinct common one.
type Item = [emoji: string, hue: number, name: string, brand: string, category: string, unit: string, price: number, mrp: number, stock: number, description: string, aliases?: string[]];

const ITEMS: Item[] = [
  ["🔌", 210, "USB-C Fast Charger", "Mi", "Chargers", "20 W", 599, 899, 25, "20 W fast charger with USB-C output.", ["charger"]],
  ["🔌", 205, "Dual Port Car Charger", "Ambrane", "Chargers", "30 W", 449, 699, 18, "Dual USB car charger with fast charging.", ["car charger"]],
  ["🔋", 150, "Power Bank", "Ambrane", "Power Banks", "10000 mAh", 999, 1499, 18, "Compact 10000 mAh power bank, dual output.", ["power bank"]],
  ["🔋", 155, "Power Bank Slim", "Mi", "Power Banks", "20000 mAh", 1799, 2499, 10, "20000 mAh slim power bank, 18 W fast charge.", ["power bank"]],
  ["🎧", 265, "Wired Earphones", "boAt", "Audio", "1 piece", 349, 599, 40, "In-ear earphones with mic and deep bass.", ["earphones", "headphones"]],
  ["🎧", 270, "Bluetooth Neckband", "boAt", "Audio", "1 piece", 999, 1799, 22, "Wireless neckband, 30-hour playback.", ["neckband"]],
  ["🎧", 275, "True Wireless Earbuds", "Realme", "Audio", "1 pair", 1499, 2499, 15, "Earbuds with ENC mic and charging case.", ["earbuds", "tws"]],
  ["🔊", 20, "Bluetooth Speaker", "JBL", "Audio", "1 piece", 1999, 2999, 9, "Portable waterproof Bluetooth speaker.", ["speaker"]],
  ["🎙️", 340, "Collar Microphone", "Boya", "Audio", "1 piece", 599, 999, 14, "Clip-on microphone for phones and cameras.", ["mic", "microphone"]],
  ["💡", 50, "LED Bulb 9 W", "Philips", "Lighting", "1 piece", 89, 110, 60, "Energy-saving cool daylight LED bulb.", ["bulb", "led bulb"]],
  ["💡", 55, "Smart Wi-Fi Bulb", "Wipro", "Lighting", "1 piece", 549, 799, 20, "Colour Wi-Fi smart bulb, works with Alexa.", ["smart bulb"]],
  ["🔦", 40, "Rechargeable Torch", "Eveready", "Lighting", "1 piece", 299, 399, 20, "Bright LED torch with USB charging.", ["torch"]],
  ["🪔", 35, "LED Strip Lights", "Syska", "Lighting", "5 m", 449, 699, 16, "RGB LED strip with remote control.", ["strip lights"]],
  ["🔋", 60, "AA Batteries", "Duracell", "Batteries", "4 pack", 140, 160, 55, "Long-lasting alkaline AA cells.", ["battery", "cell"]],
  ["🔋", 65, "AAA Batteries", "Duracell", "Batteries", "4 pack", 130, 150, 50, "Long-lasting alkaline AAA cells.", ["battery", "cell"]],
  ["🔘", 45, "Coin Cell CR2032", "Panasonic", "Batteries", "2 pack", 90, 120, 45, "3 V lithium coin cells.", ["button cell"]],
  ["🔗", 190, "Micro-USB Cable", "Portronics", "Cables", "1 m", 149, 249, 35, "Durable braided sync and charge cable.", ["cable", "charging cable"]],
  ["🔗", 195, "USB-C Cable", "Ambrane", "Cables", "1.5 m", 199, 349, 40, "Braided USB-C fast charging cable.", ["cable", "type c cable"]],
  ["🔗", 200, "Lightning Cable", "Belkin", "Cables", "1 m", 899, 1299, 12, "MFi certified Lightning cable.", ["iphone cable"]],
  ["📺", 230, "HDMI Cable", "Amazon Basics", "Cables", "1.5 m", 249, 399, 22, "High-speed HDMI 2.0 cable.", ["hdmi"]],
  ["🔌", 215, "4-Socket Extension Board", "Havells", "Electricals", "2 m", 499, 699, 17, "Surge-protected extension board with switch.", ["extension board", "tapri"]],
  ["🔌", 220, "Universal Travel Adapter", "Belkin", "Electricals", "1 piece", 699, 999, 11, "Worldwide plug adapter with USB port.", ["travel adapter"]],
  ["🖱️", 170, "Wireless Mouse", "Logitech", "Computer Accessories", "1 piece", 549, 795, 12, "Silent-click wireless mouse with USB receiver.", ["mouse"]],
  ["⌨️", 175, "Wireless Keyboard", "Logitech", "Computer Accessories", "1 piece", 1199, 1699, 8, "Compact wireless keyboard, 1-year battery.", ["keyboard"]],
  ["💾", 180, "Pen Drive 64 GB", "SanDisk", "Storage", "64 GB", 549, 799, 30, "USB 3.0 flash drive, 64 GB.", ["pendrive", "usb drive"]],
  ["💾", 185, "Memory Card 128 GB", "SanDisk", "Storage", "128 GB", 899, 1399, 20, "microSD card, Class 10, 128 GB.", ["memory card", "sd card"]],
  ["🖥️", 240, "Laptop Stand", "Portronics", "Computer Accessories", "1 piece", 799, 1299, 10, "Adjustable foldable aluminium laptop stand.", ["laptop stand"]],
  ["📱", 100, "Phone Tempered Glass", "Spigen", "Mobile Accessories", "1 piece", 199, 399, 50, "9H tempered glass screen protector.", ["tempered glass", "screen guard"]],
  ["📱", 105, "Phone Back Cover", "Ringke", "Mobile Accessories", "1 piece", 299, 499, 35, "Shockproof transparent phone case.", ["cover", "phone case"]],
  ["🤳", 110, "Selfie Stick Tripod", "Fotopro", "Mobile Accessories", "1 piece", 649, 999, 13, "Extendable tripod with Bluetooth remote.", ["selfie stick", "tripod"]],
  ["⌚", 300, "Smart Band", "Mi", "Wearables", "1 piece", 1499, 2299, 14, "Fitness band with heart-rate and SpO2.", ["smartwatch", "fitness band"]],
  ["📡", 250, "Wi-Fi Router", "TP-Link", "Networking", "1 piece", 1299, 1799, 9, "300 Mbps wireless N router.", ["router", "wifi router"]],
  ["🌀", 195, "Table Fan", "Usha", "Appliances", "1 piece", 1299, 1799, 7, "400 mm high-speed table fan.", ["pankha", "fan"]],
];

const outDir = path.join(process.cwd(), "public", "inventory-samples");
const imgDir = path.join(outDir, "images");
mkdirSync(imgDir, { recursive: true });

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const esc = (v: string | number | string[] | undefined) => {
  const str = Array.isArray(v) ? v.join("; ") : String(v ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};
const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const rows = ITEMS.map(([emoji, hue, name, brand, category, unit, price, mrp, stock, description, aliases]) => {
  const file = `electronics-${slug(name)}-${slug(brand)}.svg`;
  writeFileSync(
    path.join(imgDir, file),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${xml(name)}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 85% 92%)"/><stop offset="1" stop-color="hsl(${(hue + 30) % 360} 75% 80%)"/></linearGradient></defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="200" cy="205" r="130" fill="#fff" fill-opacity="0.55"/>
  <text x="200" y="250" font-size="150" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text>
</svg>
`
  );
  return { name, brand, category, unit, price, mrp, stock, imageUrl: `/inventory-samples/images/${file}`, description, aliases: aliases ?? [] };
});

writeFileSync(path.join(outDir, "electronics.json"), JSON.stringify(rows, null, 2) + "\n");
const cols = ["name", "brand", "category", "unit", "price", "mrp", "stock", "imageUrl", "description", "aliases"] as const;
writeFileSync(
  path.join(outDir, "electronics.csv"),
  [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n"
);
console.log(`Wrote ${rows.length} electronics products + images to ${outDir}`);
