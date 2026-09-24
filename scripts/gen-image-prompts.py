#!/usr/bin/env python3
"""Build image-generation prompts for every item in test-shop/inventory.json.

Writes, next to the inventory:
  image-prompts.csv            filename,name,category,prompt
  image-prompts.md             the same, readable, grouped by category
  inventory-with-images.json   inventory copy with imageUrl = <filename>, so the
                               JSON import dialog links each photo you pick.

Packaging is kept plain (no logos, no readable text): generated brand artwork
comes out misspelled, and it would pass off invented packs as the real brand.
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "test-shop" / "inventory.json"
OUT = SRC.parent

STYLE = (
    "Studio product photo for an Indian online grocery store, 1:1 square, "
    "single product centred on a plain soft off-white background, soft even "
    "lighting, gentle shadow underneath, sharp focus, realistic, high detail, "
    "no people, no hands, no extra props, no watermark"
)
PLAIN = "plain unbranded packaging with no logos and no readable text"

# How each item should look. Anything packaged stays unbranded (see docstring).
LOOK = {
    "Toor Dal (Arhar)": f"a clear stand-up pouch of yellow split toor dal, {PLAIN}, a small heap of the dal in front",
    "Moong Dal": f"a clear stand-up pouch of split yellow moong dal, {PLAIN}, a small heap of the dal in front",
    "Masoor Dal": f"a clear stand-up pouch of orange-red masoor lentils, {PLAIN}, a small heap of lentils in front",
    "Chana Dal": f"a clear stand-up pouch of golden split chana dal, {PLAIN}, a small heap in front",
    "Urad Dal": f"a small clear pouch of white split urad dal, {PLAIN}, a small heap in front",
    "Rajma": f"a small clear pouch of glossy dark red kidney beans, {PLAIN}, a few beans in front",
    "Kabuli Chana": f"a clear stand-up pouch of large cream-coloured chickpeas, {PLAIN}, a few chickpeas in front",
    "Basmati Rice": f"a clear pouch of long-grain white basmati rice, {PLAIN}, a small heap of grains in front",
    "Sona Masoori Rice": f"a 5 kg woven sack bag of white rice, {PLAIN}",
    "Poha": f"a clear pouch of thick flattened rice flakes (poha), {PLAIN}, a small heap in front",
    "Chakki Fresh Atta": f"a 5 kg paper bag of whole wheat flour, {PLAIN}, a small mound of light brown flour in front",
    "Maida": f"a 1 kg pouch of fine white refined flour, {PLAIN}, a small mound of flour in front",
    "Besan": f"a pouch of pale yellow gram flour, {PLAIN}, a small mound of besan in front",
    "Sooji": f"a pouch of fine semolina, {PLAIN}, a small heap of sooji in front",
    "Sugar": f"a clear 1 kg pouch of white crystal sugar, {PLAIN}",
    "Iodised Salt": f"a 1 kg pouch of fine white salt, {PLAIN}, a little salt spilled in front",
    "Jaggery": "a round block of golden-brown cane jaggery with a few broken pieces beside it",
    "Mustard Oil": f"a 1 litre clear plastic bottle of deep golden mustard oil, {PLAIN}",
    "Sunflower Oil": f"a 1 litre clear plastic bottle of light golden sunflower oil, {PLAIN}",
    "Desi Ghee": f"a 500 ml glass jar of golden granular cow ghee, {PLAIN}",
    "Turmeric Powder": f"a small 100 g pouch of spice, {PLAIN}, beside a small bowl of bright yellow turmeric powder",
    "Red Chilli Powder": f"a small 100 g pouch of spice, {PLAIN}, beside a small bowl of deep red chilli powder",
    "Coriander Powder": f"a small 100 g pouch of spice, {PLAIN}, beside a small bowl of light brown coriander powder",
    "Cumin Seeds": f"a small 100 g pouch, {PLAIN}, beside a small bowl of whole cumin seeds",
    "Garam Masala": f"a small 100 g box of spice mix, {PLAIN}, beside a small bowl of dark brown garam masala powder",
    "Kitchen King Masala": f"a small 100 g box of spice mix, {PLAIN}, beside a small bowl of reddish-brown masala powder",
    "Full Cream Milk": f"a 500 ml soft plastic milk pouch, {PLAIN}",
    "Toned Milk": f"a 1 litre carton of milk, {PLAIN}",
    "Dahi": f"a 400 g round plastic cup of thick white curd with the lid slightly open, {PLAIN}",
    "Paneer": "a 200 g block of fresh white paneer, a few cubes cut beside it",
    "Butter": f"a 100 g block of butter in a paper wrapper, partly opened, {PLAIN}",
    "Cheese Slices": f"a pack of processed cheese slices, one slice peeled back, {PLAIN}",
    "Eggs": "six white eggs in an open grey paper egg tray",
    "White Bread": f"a sliced loaf of soft white sandwich bread in a clear bag, {PLAIN}",
    "Brown Bread": f"a sliced loaf of whole wheat brown bread in a clear bag, {PLAIN}",
    "Pav": "six soft golden pav buns joined together in a row",
    "Rusk": f"a pack of golden crispy milk rusk, a few rusks in front, {PLAIN}",
    "Chocolate Cake": "a round chocolate truffle cake with glossy ganache on a cake board",
    "Cream Roll": "two flaky pastry cream rolls filled with white cream",
    "Onion": "a small pile of whole red onions, one cut in half",
    "Potato": "a small pile of fresh whole potatoes",
    "Tomato": "a small pile of ripe red tomatoes, one with its green stem",
    "Green Chilli": "a handful of fresh long green chillies",
    "Coriander Leaves": "a fresh bunch of green coriander leaves",
    "Ginger": "a few fresh ginger roots",
    "Garlic": "a few whole garlic bulbs with a couple of loose cloves",
    "Banana": "a bunch of six ripe yellow bananas",
    "Apple": "a small pile of fresh red apples",
    "Lemon": "four fresh yellow lemons, one cut in half",
    "Aloo Bhujia": f"a 400 g snack pouch, {PLAIN}, beside a small bowl of thin crispy aloo bhujia sev",
    "Moong Dal Namkeen": f"a 200 g snack pouch, {PLAIN}, beside a small bowl of salted fried moong dal",
    "Potato Chips Classic Salted": f"a small puffy bag of chips, {PLAIN}, a few golden potato chips in front",
    "Kurkure Masala Munch": f"a small puffy snack bag, {PLAIN}, a few orange spicy corn puff sticks in front",
    "Parle-G": f"a family pack of glucose biscuits, {PLAIN}, a few rectangular golden biscuits in front",
    "Good Day Cashew": f"a pack of cookies, {PLAIN}, a few round golden cookies with cashew pieces in front",
    "Maggi Masala Noodles": f"a pack of four instant noodle cakes, {PLAIN}, one block of dry noodles in front",
    "Dairy Milk": f"a 50 g milk chocolate bar, wrapper partly opened showing chocolate squares, {PLAIN}",
    "Tea": f"a 500 g pouch of tea, {PLAIN}, beside a small bowl of dark CTC tea granules",
    "Instant Coffee": f"a small 50 g glass jar of instant coffee granules, {PLAIN}",
    "Coca-Cola": f"a 750 ml plastic bottle of dark cola with condensation droplets, {PLAIN}",
    "Frooti": f"a 600 ml plastic bottle of mango drink, {PLAIN}, a fresh mango beside it",
    "Packaged Drinking Water": f"a 1 litre clear bottle of drinking water, {PLAIN}",
    "Bournvita": f"a 500 g jar of chocolate malt drink powder, {PLAIN}, a mug of chocolate milk beside it",
    "Detergent Powder": f"a 1 kg pouch of washing powder, {PLAIN}, a small scoop of blue-white powder in front",
    "Dishwash Bar": f"a rectangular green dishwash bar in an open wrapper, {PLAIN}",
    "Floor Cleaner": f"a 500 ml plastic bottle of floor cleaner liquid, {PLAIN}",
    "Toilet Cleaner": f"a 500 ml angled-neck toilet cleaner bottle, {PLAIN}",
    "Garbage Bags": f"a roll of black medium garbage bags, one bag partly pulled out, {PLAIN}",
    "Matchbox": "a stack of ten small plain matchboxes, one open showing matchsticks",
    "Mosquito Coil": f"a green spiral mosquito coil on its metal stand, a box behind it, {PLAIN}",
    "Agarbatti": f"a pack of incense sticks, {PLAIN}, a few sticks fanned out in front",
    "Bathing Soap": f"a pack of four wrapped bathing soap bars, one bar unwrapped, {PLAIN}",
    "Shampoo": f"a 180 ml shampoo bottle, {PLAIN}",
    "Toothpaste": f"a 200 g toothpaste tube with its box, {PLAIN}",
    "Toothbrush": f"two toothbrushes in a clear blister pack, {PLAIN}",
    "Hair Oil": f"a 250 ml clear bottle of coconut hair oil, {PLAIN}, half a coconut beside it",
    "Face Wash": f"a 100 ml squeeze tube of face wash, {PLAIN}, a few neem leaves beside it",
    "Sanitary Pads": f"a soft pack of sanitary pads, {PLAIN}",
    "Shaving Razor": f"a single disposable shaving razor, {PLAIN}",
    "Paracetamol 500 mg": f"a blister strip of 15 white tablets beside its small box, {PLAIN}",
    "Antacid": f"five small medicine sachets fanned out, {PLAIN}",
    "Cough Syrup": f"a 100 ml amber glass syrup bottle with a measuring cap, {PLAIN}",
    "Pain Relief Balm": f"a small 25 ml round glass jar of balm, {PLAIN}",
    "Antiseptic Liquid": f"a 250 ml bottle of antiseptic liquid, {PLAIN}",
    "Bandages": f"a small box of adhesive bandages with a few bandages in front, {PLAIN}",
    "ORS Powder": f"five oral rehydration salt sachets fanned out, {PLAIN}",
    "Hand Sanitizer": f"a 200 ml pump bottle of hand sanitizer gel, {PLAIN}",
    "Baby Diapers": f"a pack of baby diapers, one folded diaper in front, {PLAIN}",
    "Baby Soap": f"a mild baby soap bar beside its box, {PLAIN}",
    "Notebook": f"a thick single-line school notebook with a plain cover, {PLAIN}",
    "Ball Pen Blue": f"five blue ball pens lying side by side, {PLAIN}",
    "Pencil": f"ten sharpened pencils fanned out, {PLAIN}",
    "Eraser": f"five white erasers in a row, {PLAIN}",
    "Stapler": f"a small metal No. 10 stapler with a box of staple pins, {PLAIN}",
    "A4 Paper": f"a wrapped ream of A4 printer paper, {PLAIN}",
    "Glue Stick": f"a glue stick with its cap off, {PLAIN}",
    "Geometry Box": f"an open metal geometry box with compass, divider, protractor, set squares and ruler, {PLAIN}",
    "USB-C Fast Charger": f"a white 20 W USB-C wall charger plug, {PLAIN}",
    "USB-C Cable": f"a neatly coiled white USB-C cable, {PLAIN}",
    "Wired Earphones": f"a pair of black wired earphones with an inline mic, loosely coiled, {PLAIN}",
    "True Wireless Earbuds": f"a pair of black wireless earbuds beside their open charging case, {PLAIN}",
    "Power Bank": f"a slim black 10000 mAh power bank, {PLAIN}",
    "AA Batteries": f"four AA alkaline batteries standing in a row, {PLAIN}",
    "LED Bulb": f"a white 9 W LED bulb, softly lit, {PLAIN}",
    "Extension Board": f"a white 4-socket extension board with a switch and cord, {PLAIN}",
    "Dog Food": f"a 1.2 kg bag of dry dog food, {PLAIN}, a small bowl of kibble beside it",
}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main() -> None:
    items = json.loads(SRC.read_text())
    missing = [i["name"] for i in items if i["name"] not in LOOK]
    if missing:
        sys.exit(f"No LOOK entry for: {', '.join(missing)}")

    rows = []
    for item in items:
        filename = f"{slug(item['name'])}.png"
        prompt = f"{LOOK[item['name']]}. {STYLE}."
        rows.append((filename, item["name"], item["category"], prompt))
        item["imageUrl"] = filename

    with open(OUT / "image-prompts.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["filename", "name", "category", "prompt"])
        w.writerows(rows)

    md = [
        "# Product image prompts",
        "",
        f"{len(rows)} items from `inventory.json`. Every prompt ends with the same style text, "
        "so the images look alike. Save each image under the filename given, then import "
        "`inventory-with-images.json` and pick all the images together.",
        "",
    ]
    category = None
    for filename, name, cat, prompt in rows:
        if cat != category:
            md += [f"## {cat}", ""]
            category = cat
        md += [f"**{name}** → `{filename}`", "", f"> {prompt}", ""]
    (OUT / "image-prompts.md").write_text("\n".join(md))

    (OUT / "inventory-with-images.json").write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(rows)} prompts to {OUT}")


if __name__ == "__main__":
    main()
