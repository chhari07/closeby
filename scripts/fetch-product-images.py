#!/usr/bin/env python3
"""Download an openly licensed photo for every item in test-shop/inventory.json.

Sources, in order:
  1. Open Food Facts (real Indian product packs, CC BY-SA) for branded food.
  2. Wikimedia Commons (CC0 / CC BY / CC BY-SA / public domain) otherwise.

Images land in test-shop/images/<slug>.jpg (max 800 px), and
test-shop/inventory-with-images.json gets imageUrl = "<slug>.jpg" so the JSON
import dialog uploads each picked photo to Firebase Storage. Attribution for
every image goes to test-shop/images/CREDITS.md (required by CC BY / BY-SA).

  python3 scripts/fetch-product-images.py            # fetch missing images
  python3 scripts/fetch-product-images.py onion rusk # re-fetch these slugs
"""
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "test-shop" / "inventory.json"
OUT_JSON = SRC.parent / "inventory-with-images.json"
IMG_DIR = SRC.parent / "images"
CREDITS = IMG_DIR / "credits.json"
UA = "CloseBy-test-catalog/0.1 (amankumarchhari@gmail.com)"

# Branded food with a decent chance of an Open Food Facts India entry.
OFF_QUERY = {
    "Toor Dal (Arhar)": "tata sampann toor dal",
    "Moong Dal": "tata sampann moong dal",
    "Masoor Dal": "fortune masoor dal",
    "Chana Dal": "fortune chana dal",
    "Urad Dal": "tata sampann urad dal",
    "Rajma": "tata sampann rajma",
    "Basmati Rice": "india gate basmati rice",
    "Poha": "tata sampann poha",
    "Chakki Fresh Atta": "aashirvaad atta",
    "Maida": "pillsbury maida",
    "Iodised Salt": "tata salt",
    "Mustard Oil": "fortune mustard oil",
    "Sunflower Oil": "fortune sunflower oil",
    "Desi Ghee": "amul ghee",
    "Turmeric Powder": "everest turmeric powder",
    "Red Chilli Powder": "everest chilli powder",
    "Garam Masala": "mdh garam masala",
    "Kitchen King Masala": "mdh kitchen king",
    "Full Cream Milk": "amul gold milk",
    "Toned Milk": "amul taaza",
    "Dahi": "amul masti dahi",
    "Paneer": "amul paneer",
    "Butter": "amul butter",
    "Cheese Slices": "amul cheese slices",
    "White Bread": "britannia bread",
    "Rusk": "britannia rusk",
    "Aloo Bhujia": "haldiram aloo bhujia",
    "Moong Dal Namkeen": "haldiram moong dal",
    "Potato Chips Classic Salted": "lays classic salted",
    "Kurkure Masala Munch": "kurkure masala munch",
    "Parle-G": "parle-g",
    "Good Day Cashew": "good day cashew",
    "Maggi Masala Noodles": "maggi masala",
    "Dairy Milk": "cadbury dairy milk",
    "Tea": "tata tea premium",
    "Instant Coffee": "nescafe classic",
    "Coca-Cola": "coca-cola 750ml",
    "Frooti": "frooti",
    "Packaged Drinking Water": "bisleri",
    "Bournvita": "bournvita",
}

# Wikimedia Commons search terms (generic, unbranded where possible).
COMMONS_QUERY = {
    "Toor Dal (Arhar)": "toor dal", "Moong Dal": "moong dal split", "Masoor Dal": "masoor dal red lentils",
    "Chana Dal": "chana dal", "Urad Dal": "urad dal white", "Rajma": "red kidney beans",
    "Kabuli Chana": "chickpeas kabuli", "Basmati Rice": "basmati rice grains",
    "Sona Masoori Rice": "sona masuri rice", "Poha": "poha flattened rice",
    "Chakki Fresh Atta": "whole wheat flour atta", "Maida": "all purpose flour",
    "Besan": "gram flour besan", "Sooji": "semolina", "Sugar": "white sugar granulated",
    "Iodised Salt": "table salt", "Jaggery": "jaggery", "Mustard Oil": "mustard oil bottle",
    "Sunflower Oil": "sunflower oil bottle", "Desi Ghee": "ghee jar",
    "Turmeric Powder": "turmeric powder", "Red Chilli Powder": "red chili powder",
    "Coriander Powder": "coriander powder", "Cumin Seeds": "cumin seeds",
    "Garam Masala": "garam masala", "Kitchen King Masala": "masala powder",
    "Full Cream Milk": "milk packet india", "Toned Milk": "milk carton", "Dahi": "dahi curd",
    "Paneer": "paneer", "Butter": "butter block", "Cheese Slices": "cheese slices",
    "Eggs": "white eggs tray", "White Bread": "sliced white bread", "Brown Bread": "brown bread sliced",
    "Pav": "pav bread", "Rusk": "rusk toast", "Chocolate Cake": "chocolate truffle cake",
    "Cream Roll": "cream roll pastry", "Onion": "red onions", "Potato": "potatoes",
    "Tomato": "tomatoes", "Green Chilli": "green chillies", "Coriander Leaves": "coriander leaves bunch",
    "Ginger": "ginger root", "Garlic": "garlic bulbs", "Banana": "bananas bunch",
    "Apple": "red apples", "Lemon": "lemons", "Aloo Bhujia": "aloo bhujia",
    "Moong Dal Namkeen": "moong dal namkeen", "Potato Chips Classic Salted": "potato chips",
    "Kurkure Masala Munch": "kurkure", "Parle-G": "parle-g biscuit",
    "Good Day Cashew": "cashew cookies", "Maggi Masala Noodles": "maggi noodles",
    "Dairy Milk": "cadbury dairy milk", "Tea": "ctc tea", "Instant Coffee": "instant coffee jar",
    "Coca-Cola": "coca-cola bottle", "Frooti": "frooti", "Packaged Drinking Water": "bottled water",
    "Bournvita": "bournvita", "Detergent Powder": "detergent powder", "Dishwash Bar": "dishwashing bar",
    "Floor Cleaner": "floor cleaner bottle", "Toilet Cleaner": "toilet cleaner bottle",
    "Garbage Bags": "garbage bags roll", "Matchbox": "matchbox", "Mosquito Coil": "mosquito coil",
    "Agarbatti": "incense sticks", "Bathing Soap": "soap bar", "Shampoo": "shampoo bottle",
    "Toothpaste": "toothpaste tube", "Toothbrush": "toothbrush", "Hair Oil": "coconut oil bottle",
    "Face Wash": "face wash tube", "Sanitary Pads": "sanitary pad", "Shaving Razor": "disposable razor",
    "Paracetamol 500 mg": "paracetamol tablets strip", "Antacid": "eno fruit salt",
    "Cough Syrup": "cough syrup bottle", "Pain Relief Balm": "balm jar", "Antiseptic Liquid": "dettol",
    "Bandages": "adhesive bandages", "ORS Powder": "oral rehydration salts sachet",
    "Hand Sanitizer": "hand sanitizer bottle", "Baby Diapers": "disposable diapers",
    "Baby Soap": "baby soap", "Notebook": "notebook ruled", "Ball Pen Blue": "blue ballpoint pens",
    "Pencil": "pencils", "Eraser": "eraser rubber", "Stapler": "stapler",
    "A4 Paper": "ream of paper", "Glue Stick": "glue stick", "Geometry Box": "geometry box compass",
    "USB-C Fast Charger": "usb-c charger", "USB-C Cable": "usb-c cable",
    "Wired Earphones": "earphones", "True Wireless Earbuds": "wireless earbuds",
    "Power Bank": "power bank", "AA Batteries": "AA batteries", "LED Bulb": "LED bulb",
    "Extension Board": "power strip", "Dog Food": "dry dog food kibble",
}

OK_LICENSE = re.compile(r"^(cc0|cc[ -]by(-sa)?[ -]?[\d.]*|public domain|pd.*)$", re.I)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def get(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def from_off(query: str):
    q = urllib.parse.urlencode({
        "search_terms": query, "json": 1, "page_size": 10,
        "tagtype_0": "countries", "tag_contains_0": "contains", "tag_0": "india",
        "fields": "code,product_name,brands,image_front_url",
    })
    data = json.loads(get(f"https://world.openfoodfacts.org/cgi/search.pl?{q}"))
    words = [w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 2]
    for p in data.get("products", []):
        img = p.get("image_front_url")
        text = f"{p.get('product_name', '')} {p.get('brands', '')}".lower()
        # Need most query words present so "amul butter" doesn't return a cheese.
        if img and sum(w in text for w in words) >= max(1, len(words) - 1):
            return {
                "url": img,
                "source": f"https://world.openfoodfacts.org/product/{p['code']}",
                "author": "Open Food Facts contributors",
                "license": "CC BY-SA 3.0",
                "title": p.get("product_name", ""),
            }
    return None


def from_commons(query: str):
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"{query} filetype:bitmap", "gsrnamespace": 6, "gsrlimit": 10,
        "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": 800,
    })
    data = json.loads(get(f"https://commons.wikimedia.org/w/api.php?{q}"))
    pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        if not OK_LICENSE.match(lic.strip()) or info.get("width", 0) < 300:
            continue
        author = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip() or "Unknown"
        return {
            "url": info.get("thumburl") or info["url"],
            "source": info.get("descriptionurl"),
            "author": author[:120],
            "license": lic,
            "title": p.get("title", ""),
        }
    return None


def save(url: str, path: Path) -> None:
    img = Image.open(io.BytesIO(get(url))).convert("RGB")
    img.thumbnail((800, 800))
    img.save(path, "JPEG", quality=85)


def main() -> None:
    IMG_DIR.mkdir(exist_ok=True)
    only = set(sys.argv[1:])
    items = json.loads(SRC.read_text())
    credits = json.loads(CREDITS.read_text()) if CREDITS.exists() else {}

    for item in items:
        name, s = item["name"], slug(item["name"])
        path = IMG_DIR / f"{s}.jpg"
        if path.exists() and s not in only:
            continue
        if only and s not in only:
            continue
        found = None
        tried = []
        if name in OFF_QUERY and s not in credits.get("_skip_off", []):
            tried.append("off")
            try:
                found = from_off(OFF_QUERY[name])
            except Exception as e:
                print(f"  off error {name}: {e}")
        if not found:
            tried.append("commons")
            try:
                found = from_commons(COMMONS_QUERY.get(name, name))
            except Exception as e:
                print(f"  commons error {name}: {e}")
        if not found:
            print(f"MISS  {name} ({'/'.join(tried)})")
            continue
        try:
            save(found["url"], path)
        except Exception as e:
            print(f"FAIL  {name}: {e}")
            continue
        credits[s] = {"name": name, **found}
        print(f"OK    {name:30} {found['license']:14} {found['source']}")
        time.sleep(0.5)

    CREDITS.write_text(json.dumps(credits, indent=2, ensure_ascii=False) + "\n")

    for item in items:
        s = slug(item["name"])
        if (IMG_DIR / f"{s}.jpg").exists():
            item["imageUrl"] = f"{s}.jpg"
    OUT_JSON.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n")

    lines = ["# Image credits", "", "| Product | File | Source | Author | License |", "|---|---|---|---|---|"]
    for s, c in credits.items():
        if s.startswith("_"):
            continue
        lines.append(f"| {c['name']} | {s}.jpg | {c['source']} | {c['author'].replace('|', '/')} | {c['license']} |")
    (IMG_DIR / "CREDITS.md").write_text("\n".join(lines) + "\n")
    have = sum(1 for i in items if (IMG_DIR / f"{slug(i['name'])}.jpg").exists())
    print(f"\n{have}/{len(items)} items have an image")


if __name__ == "__main__":
    main()
