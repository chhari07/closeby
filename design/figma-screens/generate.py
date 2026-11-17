"""Generate CloseBy screen designs as Figma-importable SVG frames.

Usage: python3 gen_figma.py <out_dir>
Writes one SVG per screen plus closeby-all-screens.svg (every frame on one canvas).
"""
import os, sys
from xml.sax.saxutils import escape

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# ---------- tokens (from the painted-shopfront + Banglta references) ----------
MAROON = "#7a1f24"; MAROON_D = "#5c161a"
CREAM = "#f6ead0"; PAPER = "#fffaf0"; SAND = "#efd3a0"
TERRA = "#c8553d"; MUSTARD = "#e3a73b"; TEAL = "#2e7d74"; TEAL_D = "#1d4a4f"
PINK = "#e58c8a"; INK = "#3b1d14"; MUTED = "#8a6a55"; BORDER = "#e6d3ad"
GREEN = "#3f8f5a"; RED = "#c0392b"
DISPLAY = "Galada"; BODY = "Plus Jakarta Sans"
W = 1440; M = 390


def t(x, y, s, size=16, w=400, fill=INK, anchor="start", op=1, fam=BODY):
    return (f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{w}" '
            f'fill="{fill}" text-anchor="{anchor}" opacity="{op}">{escape(s)}</text>')


def d(x, y, s, size=48, fill=INK, anchor="start"):
    return t(x, y, s, size, 400, fill, anchor, fam=DISPLAY)


def r(x, y, w, h, fill, rad=0, stroke=None, sw=1, op=1):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rad}" fill="{fill}"{st} opacity="{op}"/>'


def c(x, y, rad, fill, stroke=None, sw=1):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<circle cx="{x}" cy="{y}" r="{rad}" fill="{fill}"{st}/>'


def tw(s, size=14, w=600):
    return len(s) * size * (0.6 if w >= 600 else 0.55)


def btn(x, y, label, kind="primary", w=None, h=44, size=13):
    w = w or tw(label, size) + 44
    fills = {"primary": (MUSTARD, INK, None), "dark": (MAROON, CREAM, None),
             "teal": (TEAL, CREAM, None), "outline": ("none", INK, INK),
             "outline-light": ("none", CREAM, CREAM), "ghost": (PAPER, INK, BORDER),
             "danger": ("none", RED, RED)}
    f, tc, s = fills[kind]
    return (f'<g>{r(x, y, w, h, f, 10, s, 1.5)}'
            f'{t(x + w / 2, y + h / 2 + size * 0.36, label.upper() if kind in ("primary","dark","outline","outline-light","teal") else label, size, 800, tc, anchor="middle")}</g>'), w


def B(*a, **k):
    return btn(*a, **k)[0]


def field(x, y, w, label, ph, h=46, value=None):
    out = t(x, y, label, 13, 700) + r(x, y + 10, w, h, PAPER, 10, BORDER, 1.5)
    out += t(x + 14, y + 10 + h / 2 + 5, value or ph, 14, 500 if value else 400, INK if value else MUTED)
    return out


def chip(x, y, label, active=False, size=13):
    w = tw(label, size) + 32
    return (r(x, y, w, 34, MAROON if active else PAPER, 17, None if active else BORDER, 1.5) +
            t(x + w / 2, y + 22, label, size, 700, CREAM if active else INK, anchor="middle")), w


def chips(x, y, labels, active=0, gap=10):
    out = ""
    for i, l in enumerate(labels):
        s, w = chip(x, y, l, i == active)
        out += s; x += w + gap
    return out


def badge(x, y, label, color=TEAL, txt=CREAM):
    w = tw(label, 11, 700) + 20
    return r(x, y, w, 22, color, 11) + t(x + w / 2, y + 15, label, 11, 700, txt, anchor="middle")


def icon(x, y, rad=18, fill=SAND, glyph="", gc=INK):
    return c(x, y, rad, fill) + (t(x, y + rad * 0.35, glyph, rad, 700, gc, anchor="middle") if glyph else "")


def card(x, y, w, h, fill=PAPER):
    return r(x, y, w, h, fill, 16, BORDER, 1.5)


def logo(x, y, light=False):
    return (d(x, y, "close", 34, CREAM if light else INK) +
            d(x + 66, y, "By", 34, MUSTARD))


# ---------- illustration: painted kirana shopfront (reference style) ----------
def shopfront(x, y, s=1.0, sign="CloseBy Kirana"):
    g = [f'<g transform="translate({x} {y}) scale({s})">']
    g.append(r(0, 0, 640, 420, SAND))                      # wall
    g.append(r(0, 0, 640, 40, "#d9b47a"))                  # parapet
    g.append(r(30, 300, 580, 6, "#b98d55"))
    # corrugated tin awning
    g.append(f'<path d="M-10 60 L650 60 L630 120 Q615 132 600 120 Q585 132 570 120 Q555 132 540 120 Q525 132 510 120 Q495 132 480 120 Q465 132 450 120 Q435 132 420 120 Q405 132 390 120 Q375 132 360 120 Q345 132 330 120 Q315 132 300 120 Q285 132 270 120 Q255 132 240 120 Q225 132 210 120 Q195 132 180 120 Q165 132 150 120 Q135 132 120 120 Q105 132 90 120 Q75 132 60 120 Q45 132 30 120 Q15 132 10 120 Z" fill="{PINK}"/>')
    for i in range(0, 660, 30):
        g.append(f'<line x1="{i - 10}" y1="62" x2="{i - 4}" y2="120" stroke="{TERRA}" stroke-width="3" opacity="0.6"/>')
    # dark shop opening
    g.append(r(110, 130, 420, 290, "#3a2418"))
    # shelves with goods
    cols = [TERRA, MUSTARD, TEAL, PINK, "#f0e0b8", RED, GREEN, MUSTARD]
    for row, yy in enumerate((160, 215, 270)):
        g.append(r(130, yy + 38, 380, 6, "#6b4a33"))
        xx = 136
        for k in range(11):
            bw = 24 + (k * 7 + row * 5) % 14
            bh = 22 + (k * 5 + row * 3) % 14
            g.append(r(xx, yy + 38 - bh, bw, bh, cols[(k + row) % len(cols)], 2))
            xx += bw + 8
            if xx > 490: break
    # counter with sacks and crate
    g.append(r(150, 330, 340, 90, "#e9c98f"))
    g.append(r(150, 330, 340, 10, "#c79a5c"))
    g.append(f'<path d="M180 330 Q175 290 205 284 Q240 280 245 300 L250 330 Z" fill="#f2dfb4" stroke="#b98d55" stroke-width="2"/>')
    g.append(f'<path d="M260 330 Q258 300 285 296 Q312 296 315 330 Z" fill="#f7e8c8" stroke="#b98d55" stroke-width="2"/>')
    g.append(r(380, 360, 100, 60, RED, 4) + r(386, 368, 88, 8, "#9b2a20") + r(386, 384, 88, 8, "#9b2a20"))
    # hanging snack strips on the shutters
    for sx, colr in ((40, RED), (70, MUSTARD), (560, TEAL), (590, RED)):
        g.append(f'<line x1="{sx + 10}" y1="122" x2="{sx + 10}" y2="140" stroke="{INK}" stroke-width="2"/>')
        for k in range(5):
            g.append(r(sx, 140 + k * 34, 22, 30, colr if k % 2 == 0 else "#f3e1b0", 3, INK, 1))
    # side shutters
    g.append(r(0, 120, 30, 300, "#8a2c22") + r(610, 120, 30, 300, "#d8c7a6"))
    for i in range(0, 300, 14):
        g.append(f'<line x1="610" y1="{120 + i}" x2="640" y2="{120 + i}" stroke="#bfa985" stroke-width="2"/>')
    # sign board
    g.append(r(170, 6, 300, 46, MAROON, 6, MUSTARD, 3))
    g.append(d(320, 40, sign, 28, CREAM, "middle"))
    # potted plant
    g.append(r(-4, 360, 44, 60, TERRA, 6))
    for lx, ly in ((5, 330), (18, 310), (32, 334), (12, 345), (30, 318)):
        g.append(f'<ellipse cx="{lx}" cy="{ly}" rx="12" ry="22" fill="{GREEN}" transform="rotate({(lx * 7) % 50 - 25} {lx} {ly})"/>')
    # string lights
    g.append(f'<path d="M0 58 Q320 90 640 58" fill="none" stroke="{INK}" stroke-width="1.5"/>')
    for i in range(12):
        px = 26 + i * 53; py = 58 + 32 * (1 - ((px - 320) / 320) ** 2)
        g.append(c(px, py + 4, 5, MUSTARD))
    g.append("</g>")
    return "".join(g)


def scooter(x, y, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})">'
            f'<circle cx="20" cy="60" r="18" fill="{INK}"/><circle cx="20" cy="60" r="8" fill="{SAND}"/>'
            f'<circle cx="110" cy="60" r="18" fill="{INK}"/><circle cx="110" cy="60" r="8" fill="{SAND}"/>'
            f'<path d="M10 52 Q20 20 60 22 L95 22 Q120 22 124 52 Z" fill="{TERRA}"/>'
            f'<rect x="60" y="-4" width="40" height="30" rx="4" fill="{MUSTARD}"/>'
            f'<circle cx="52" cy="-2" r="12" fill="{TEAL}"/><rect x="40" y="8" width="24" height="26" rx="6" fill="{TEAL_D}"/>'
            f'</g>')


# ---------- shared chrome ----------
def navbar(kind="public", w=W):
    if w == M:
        out = r(0, 0, w, 64, MAROON) + logo(20, 44, True)
        out += (B(w - 104, 14, "Sign up", "primary", 84, 36, 11) if kind == "public"
                else icon(w - 72, 32, 16, MAROON_D, "♡", CREAM) + icon(w - 32, 32, 16, MUSTARD, "A"))
        return out
    out = r(0, 0, w, 72, MAROON) + logo(120, 48, True)
    if kind == "public":
        out += t(1010, 42, "How it works", 14, 500, CREAM, op=0.85) + t(1130, 42, "Log in", 14, 700, CREAM)
        out += B(1210, 18, "Sign up", "primary", 110, 36, 12)
    elif kind == "buyer":
        out += r(430, 16, 480, 40, MAROON_D, 20) + t(454, 41, "Search shops or products — Hindi, Hinglish or English", 13, 400, CREAM, op=0.6)
        out += t(950, 42, "Shops", 14, 600, CREAM) + t(1015, 42, "Orders", 14, 600, CREAM) + t(1088, 42, "Messages", 14, 600, CREAM)
        out += r(1180, 20, 70, 32, MUSTARD, 16) + t(1215, 41, "Cart · 3", 12, 800, INK, anchor="middle")
        out += icon(1290, 36, 18, CREAM, "A", MAROON)
    else:
        out += badge(250, 26, "SELLER", MUSTARD, INK) + t(1060, 42, "Sharma Kirana Store", 14, 700, CREAM)
        out += icon(1290, 36, 18, CREAM, "S", MAROON)
    return out


def footer(y, w=W):
    out = r(0, y, w, 200 if w == W else 220, MAROON)
    if w == M:
        return out + logo(20, y + 60, True) + d(20, y + 110, "Local Stores Stronger Together", 22, SAND) + t(20, y + 170, "© 2026 CloseBy · Guna, Madhya Pradesh", 12, 400, CREAM, op=0.6)
    out += logo(120, y + 70, True) + d(120, y + 130, "Local Stores Stronger Together", 30, SAND)
    for i, (h, items) in enumerate((("Shop", ["Explore shops", "Search", "Your orders"]), ("Sell", ["List your shop", "Dashboard", "How it works"]), ("CloseBy", ["About", "Help", "Privacy"]))):
        x = 820 + i * 170
        out += t(x, y + 60, h, 13, 800, MUSTARD)
        for k, it in enumerate(items):
            out += t(x, y + 90 + k * 26, it, 13, 500, CREAM, op=0.8)
    return out + t(120, y + 176, "© 2026 CloseBy · Guna, Madhya Pradesh", 12, 400, CREAM, op=0.6)


def sidebar(active, h):
    items = ["Overview", "Orders", "Inventory", "Reports", "Messages", "Shop settings"]
    out = r(0, 72, 248, h - 72, PAPER) + f'<line x1="248" y1="72" x2="248" y2="{h}" stroke="{BORDER}" stroke-width="1.5"/>'
    out += t(28, 116, "SELLER WORKSPACE", 11, 800, MUTED)
    for i, it in enumerate(items):
        yy = 136 + i * 48
        if it == active:
            out += r(16, yy, 216, 40, MAROON, 10)
        out += icon(40, yy + 20, 9, MUSTARD if it == active else SAND)
        out += t(60, yy + 25, it, 14, 700 if it == active else 500, CREAM if it == active else INK)
    out += r(16, h - 150, 216, 118, SAND, 14) + d(32, h - 110, "Shop is open", 22, INK)
    out += t(32, h - 84, "Closes at 9:00 PM", 12, 500, MUTED)
    out += r(32, h - 70, 52, 26, TEAL, 13) + c(71, h - 57, 10, PAPER)
    return out


def stat(x, y, w, label, value, sub="", accent=MUSTARD):
    return (card(x, y, w, 120) + r(x, y, 6, 120, accent, 3) + t(x + 24, y + 36, label, 13, 600, MUTED) +
            d(x + 24, y + 84, value, 40, INK) + (t(x + 24, y + 106, sub, 12, 500, MUTED) if sub else ""))


def shopcard(x, y, w, name, kind, dist, open_=True, rating="4.6", tint=SAND):
    h = 250
    out = card(x, y, w, h) + f'<clipPath id="sc{x}{y}"><rect x="{x}" y="{y}" width="{w}" height="130" rx="16"/></clipPath>'
    out += f'<g clip-path="url(#sc{x}{y})">{r(x, y, w, 130, tint)}{shopfront(x + w / 2 - 110, y + 10, 0.34, name.split()[0])}</g>'
    out += badge(x + 14, y + 14, "OPEN" if open_ else "CLOSED", TEAL if open_ else MUTED)
    out += d(x + 18, y + 170, name, 24, INK)
    out += t(x + 18, y + 196, f"{kind} · {dist}", 13, 500, MUTED)
    out += t(x + 18, y + 226, f"★ {rating}", 13, 700, TERRA) + t(x + w - 18, y + 226, "Delivery & pickup", 12, 600, TEAL, anchor="end")
    return out


def productcard(x, y, w, name, price, mrp=None, unit="1 kg", stock=True, qty=0, tint=SAND):
    h = 280
    out = card(x, y, w, h) + r(x + 12, y + 12, w - 24, 130, tint, 12)
    out += c(x + w / 2, y + 77, 38, PAPER) + t(x + w / 2, y + 86, name[0], 28, 800, TERRA, anchor="middle")
    if mrp:
        off = round((mrp - price) / mrp * 100)
        out += badge(x + 20, y + 20, f"{off}% OFF", TERRA)
    out += t(x + 16, y + 168, name, 15, 700) + t(x + 16, y + 190, unit, 12, 500, MUTED)
    out += d(x + 16, y + 232, f"₹{price}", 26, INK)
    if mrp and w < 200:
        out += t(x + 16 + tw(unit, 12, 500) + 8, y + 190, f"MRP ₹{mrp}", 12, 500, MUTED)
    elif mrp:
        out += t(x + 16 + tw(f"₹{price}", 22) + 4, y + 229, f"₹{mrp}", 13, 500, MUTED) + \
               f'<line x1="{x + 20 + tw(f"₹{price}", 22)}" y1="{y + 224}" x2="{x + 20 + tw(f"₹{price}", 22) + 34}" y2="{y + 224}" stroke="{MUTED}" stroke-width="1.5"/>'
    if not stock:
        out += t(x + w - 16, y + 230, "Out of stock", 12, 700, MUTED, anchor="end")
    elif qty:
        out += r(x + w - 112, y + 206, 96, 36, MAROON, 10) + t(x + w - 96, y + 230, "−", 18, 700, CREAM) + \
               t(x + w - 64, y + 230, str(qty), 14, 800, CREAM, anchor="middle") + t(x + w - 40, y + 230, "+", 18, 700, CREAM)
    else:
        out += B(x + w - 84, y + 206, "Add", "primary", 68, 36, 12)
    return out


def section_title(x, y, title, sub=None, size=44, fill=INK, subfill=MUTED):
    return d(x, y, title, size, fill) + (t(x, y + 34, sub, 15, 500, subfill) if sub else "")


def back(x, y):
    return t(x, y, "←  Back", 14, 700, MUTED)


# ---------- frames ----------
FRAMES = []


def frame(name, w, h, body, bg=CREAM):
    FRAMES.append((name, w, h, f'{r(0, 0, w, h, bg)}{body}'))


# 00 cover
frame("00 Cover", W, 900,
      r(0, 0, W, 900, MAROON) + shopfront(760, 360, 0.95) + r(0, 760, W, 140, MAROON_D) +
      logo(120, 150, True) + d(120, 330, "Everything you need,", 88, CREAM) + d(120, 440, "CloseBy.", 110, MUSTARD) +
      t(120, 500, "UI design file · all screens · v1 · Nov 2026", 18, 600, SAND) +
      t(120, 540, "Display font: Galada (stand-in for “Banglta”) · Body: Plus Jakarta Sans", 15, 500, CREAM, op=0.7) +
      t(120, 820, "Buyer app · Seller workspace · Operator · Mobile", 16, 700, SAND) + scooter(560, 790, 0.9))

# 01 design system
ds = section_title(120, 130, "Design system", "Colours, type and components for CloseBy")
sw = [("Maroon", MAROON), ("Maroon dark", MAROON_D), ("Cream paper", CREAM), ("Card", PAPER), ("Sand", SAND),
      ("Terracotta", TERRA), ("Mustard", MUSTARD), ("Teal", TEAL), ("Deep teal", TEAL_D), ("Saree pink", PINK), ("Ink", INK), ("Muted", MUTED)]
for i, (n, col) in enumerate(sw):
    x = 120 + (i % 6) * 200; y = 200 + (i // 6) * 170
    ds += r(x, y, 180, 100, col, 14, BORDER, 1.5) + t(x, y + 126, n, 14, 700) + t(x, y + 146, col.upper(), 12, 500, MUTED)
ds += t(120, 580, "TYPE", 12, 800, MUTED)
for i, (lab, sz) in enumerate((("Display XL · Galada 88", 88), ("Display L · Galada 56", 56), ("Display M · Galada 36", 36), ("Display S · Galada 24", 24))):
    ds += d(120, 660 + sum((88, 56, 36, 24)[:i]) * 1.15 + i * 10, lab, sz)
ds += t(120, 960, "Body L · Plus Jakarta Sans 18 / 500", 18, 500) + t(120, 992, "Body · Plus Jakarta Sans 15 / 500", 15, 500) + \
      t(120, 1020, "LABEL · PLUS JAKARTA SANS 12 / 800", 12, 800, MUTED)
ds += t(780, 580, "BUTTONS", 12, 800, MUTED)
ds += B(780, 600, "Start shopping", "primary", 200) + B(1000, 600, "Checkout", "dark", 160) + B(1180, 600, "Accept", "teal", 140)
ds += B(780, 664, "I have an account", "outline", 200) + B(1000, 664, "Edit", "ghost", 100) + B(1120, 664, "Reject", "danger", 120)
ds += t(780, 750, "INPUTS & CHIPS", 12, 800, MUTED) + field(780, 772, 380, "Mobile number", "9876543210")
ds += chips(780, 860, ["All", "Kirana", "Pharmacy", "Bakery", "Café"], 1)
ds += t(780, 930, "BADGES", 12, 800, MUTED) + badge(780, 946, "OPEN", TEAL) + badge(844, 946, "CLOSED", MUTED) + \
      badge(920, 946, "20% OFF", TERRA) + badge(1004, 946, "NEW ORDER", MUSTARD, INK) + badge(1110, 946, "PAID", GREEN)
ds += t(120, 1090, "CARDS", 12, 800, MUTED) + shopcard(120, 1110, 300, "Sharma Kirana", "Kirana", "0.4 km") + \
      productcard(440, 1110, 220, "Basmati Rice", 92, 110, "1 kg") + stat(680, 1110, 300, "Sales today", "₹4,820", "+12% vs yesterday") + \
      t(1010, 1130, "RADIUS 16 · BORDER #E6D3AD · SHADOW NONE", 12, 700, MUTED) + \
      t(1010, 1160, "Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 80", 13, 500, MUTED) + \
      t(1010, 1190, "Grid: 1440 frame · 1200 content · 12 col · 24 gutter", 13, 500, MUTED) + \
      t(1010, 1220, "Mobile: 390 frame · 20 side gutter", 13, 500, MUTED)
ds += t(120, 1430, "ILLUSTRATION STYLE", 12, 800, MUTED) + shopfront(120, 1450, 0.7) + scooter(620, 1680) + \
      t(820, 1500, "Warm, golden-hour painted shopfronts:", 16, 700) + \
      t(820, 1530, "tin awnings, hanging snack packets, crates, plants.", 15, 500, MUTED) + \
      t(820, 1560, "Use real-life kirana details, never generic stock art.", 15, 500, MUTED)
frame("01 Design system", W, 1800, ds)

# 02 home
h = navbar("public")
h += r(0, 72, W, 760, MAROON) + d(720, 230, "Everything you need,", 104, CREAM, "middle") + d(720, 350, "CloseBy.", 120, MUSTARD, "middle")
h += t(720, 410, "Discover kirana, pharmacy, stationery, bakery and other local stores around you.", 17, 500, CREAM, "middle", 0.8)
h += t(720, 436, "Shop directly from your neighbourhood and support local businesses.", 17, 500, CREAM, "middle", 0.8)
h += B(530, 470, "Start shopping  →", "primary", 200, 50) + B(746, 470, "I have an account", "outline-light", 200, 50)
h += r(0, 560, W, 420, SAND) + shopfront(160, 560, 1.0, "Sharma Kirana") + shopfront(780, 560, 1.0, "Gupta Medical") + scooter(620, 900)
h += r(120, 930, 200, 36, PAPER, 18) + t(140, 954, "⌖  Guna, Madhya Pradesh", 13, 700)
h += d(720, 1110, "Good for your street.", 72, INK, "middle") + d(720, 1190, "And your business.", 72, TERRA, "middle")
h += t(720, 1240, "We are on a mission to help local shops grow. Shoppers find what they need a few steps away,", 16, 500, MUTED, "middle")
h += t(720, 1264, "and shop owners reach more neighbours — no big-platform fees getting in the way.", 16, 500, MUTED, "middle")
h += B(625, 1296, "Explore shops", "dark", 190, 48)
cats = [("Kirana", "Fresh daily essentials", TERRA), ("Pharmacy", "Health closer, always", TEAL), ("Stationery", "Books, pens, big ideas", MAROON),
        ("Bakery", "Fresh bakes, happier days", MUSTARD), ("Fresh Mart", "Fruits, veggies, always fresh", GREEN), ("Café", "Good food, better conversations", PINK)]
for i, (n, s, col) in enumerate(cats):
    x = 120 + i * 204
    h += card(x, 1400, 184, 200) + c(x + 92, 1462, 40, col) + t(x + 92, 1472, n[0], 26, 800, CREAM, "middle")
    h += d(x + 92, 1548, n, 26, INK, "middle") + t(x + 92, 1574, s, 11, 500, MUTED, "middle")
h += r(0, 1680, W, 120, TEAL_D) + d(120, 1752, "How CloseBy works", 44, CREAM) + t(560, 1748, "Three simple steps, whether you are shopping or selling.", 16, 500, CREAM, op=0.8)
for i, (n, s) in enumerate((("Find a shop near you", "Set your location, browse open shops."), ("Add to cart and pay", "UPI, card, cash or pay at shop."), ("Track and chat", "Live order steps and chat with the shop."))):
    x = 120 + i * 408
    art = shopfront(x + 150, 1864, 0.31, "Kirana") if i == 0 else (r(x + 170, 1880, 120, 100, TERRA, 12) + r(x + 200, 1866, 60, 30, "none", 14, INK, 6) + badge(x + 196, 1920, "UPI", TEAL)) if i == 1 else scooter(x + 170, 1900, 1.1)
    h += card(x, 1840, 384, 260) + f'<clipPath id="hw{i}"><rect x="{x + 20}" y="1860" width="344" height="140" rx="12"/></clipPath>' + r(x + 20, 1860, 344, 140, SAND, 12) + f'<g clip-path="url(#hw{i})">{art}</g>' + d(x + 30, 1906, f"0{i + 1}", 44, TERRA)
    h += d(x + 24, 2046, n, 28) + t(x + 24, 2074, s, 14, 500, MUTED)
h += r(120, 2160, 1200, 300, MAROON, 24) + shopfront(820, 2190, 0.62, "MY SHOP")
h += t(170, 2228, "FOR SHOP OWNERS", 12, 800, MUSTARD) + d(170, 2300, "Bring your shop", 64, CREAM) + d(170, 2370, "online.", 64, MUSTARD)
h += t(170, 2410, "List your store, reach nearby customers and grow your local business with CloseBy.", 15, 500, CREAM, op=0.8)
h += B(170, 2426, "List your shop", "primary", 180, 0.1)  # placeholder overwritten below
h = h.replace(B(170, 2426, "List your shop", "primary", 180, 0.1), "")
h += B(1110, 2390, "List your shop", "primary", 180, 46)
h += footer(2520)
frame("02 Home", W, 2720, h)

# 03 how it works / features
hw = navbar("public") + r(0, 72, W, 380, MAROON)
hw += d(720, 230, "Shop local,", 96, CREAM, "middle") + d(720, 340, "made simple.", 96, MUSTARD, "middle")
hw += t(720, 400, "How CloseBy works for shoppers and shop owners, and everything it can do.", 17, 500, CREAM, "middle", 0.8)
hw += chips(560, 490, ["For shoppers", "For shop owners"], 0)
steps = (("Find a shop near you", "Map pin bouncing over neighbourhood shops"), ("Add to cart and pay", "Groceries into a bag, with UPI card and coin"), ("Track and chat", "Scooter on the road, order steps lighting up"))
for i, (n, s) in enumerate(steps):
    y = 560 + i * 250
    hw += card(120, y, 1200, 220) + r(140, y + 20, 360, 180, SAND, 12) + (scooter(250, y + 80) if i == 2 else shopfront(170, y + 30, 0.47))
    hw += d(560, y + 80, f"0{i + 1}", 48, TERRA) + d(640, y + 82, n, 40) + t(560, y + 120, s, 15, 500, MUTED)
hw += d(120, 1380, "Features", 56) + t(120, 1416, "Everything you need to shop local, or to run a local shop.", 16, 500, MUTED)
feats = ["Shops near you", "Search your way", "Pay how you like", "Chat with the shop", "Add stock by voice or photo", "Simple sales reports", "Ideas to grow", "No big-platform fees"]
for i, f in enumerate(feats):
    x = 120 + (i % 4) * 306; y = 1460 + (i // 4) * 200
    hw += card(x, y, 282, 176) + icon(x + 44, y + 48, 24, [TERRA, TEAL, MUSTARD, PINK][i % 4]) + d(x + 24, y + 116, f, 24) + t(x + 24, y + 144, "Built for Guna’s neighbourhoods.", 12, 500, MUTED)
hw += r(120, 1900, 1200, 220, TEAL_D, 24) + d(170, 1990, "Ready to get", 56, CREAM) + d(170, 2056, "CloseBy?", 56, MUSTARD)
hw += B(900, 1984, "Start shopping", "primary", 180, 48) + B(1096, 1984, "List your shop", "outline-light", 180, 48)
hw += footer(2180)
frame("03 How it works", W, 2380, hw)

# 04 get started
gs = navbar("public") + d(720, 220, "How will you use CloseBy?", 64, INK, "middle")
gs += t(720, 262, "Pick one to continue. You can sign in or create an account next.", 16, 500, MUTED, "middle")
for i, (n, s, col) in enumerate((("I'm a Buyer", "Order from shops near you", TERRA), ("I own a Shop", "Sell to your neighbourhood", TEAL))):
    x = 260 + i * 480
    gs += card(x, 320, 440, 420) + r(x + 20, 340, 400, 230, col, 12, op=0.9) + shopfront(x + 60, 352, 0.5, "Buyer" if i == 0 else "My Shop")
    gs += d(x + 30, 630, n, 40) + t(x + 30, 660, s, 15, 500, MUTED) + B(x + 30, 680, "Continue  →", "dark", 160, 40)
gs += t(720, 800, "Already have an account?  Log in", 14, 700, TERRA, "middle")
frame("04 Get started", W, 900, gs)


# auth shell
def auth(title, sub, body, h=900, owner=False):
    a = r(0, 0, 640, h, TEAL_D if owner else MAROON) + logo(60, 70, True)
    a += d(60, 220, "Local shopping,", 64, CREAM) + d(60, 300, "made simple.", 64, MUSTARD)
    a += t(60, 344, "Whether you buy or sell, CloseBy connects you with your", 15, 500, CREAM, op=0.8)
    a += t(60, 366, "neighbourhood in Guna.", 15, 500, CREAM, op=0.8)
    a += shopfront(0, h - 420, 1.0, "OPEN")
    a += chips(760, 80, ["Buyer", "Shop owner"], 1 if owner else 0)
    a += d(760, 200, title, 56) + t(760, 236, sub, 15, 500, MUTED) + body
    return a


frame("05 Sign in", W, 900, auth("Welcome back", "Sign in with a one-time code sent to your email.",
      field(760, 290, 460, "Email", "you@example.com") + B(760, 380, "Send code", "dark", 460, 50) +
      t(990, 470, "New here?  Create an account", 14, 700, TERRA, "middle")))
frame("06 Sign up", W, 980, auth("Create an account", "Tell us a little about you — we’ll verify your email with a one-time code.",
      field(760, 290, 460, "Full name", "e.g. Aman Kumar") + field(760, 380, 460, "Email", "you@example.com") +
      field(760, 470, 460, "Mobile number", "9876543210") + field(760, 560, 460, "Shop name", "e.g. Sharma General Store") +
      t(760, 650, "Shop type, hours, location and inventory come next, right after you verify.", 12, 500, MUTED) +
      B(760, 670, "Create account", "teal", 460, 50) + t(990, 760, "Have an account?  Sign in", 14, 700, TERRA, "middle"), 980, owner=True))
otp = "".join(r(760 + i * 76, 330, 64, 72, PAPER, 12, MAROON if i < 3 else BORDER, 2) + (d(792 + i * 76, 380, "472"[i], 36, INK, "middle") if i < 3 else "") for i in range(6))
frame("07 Verify email (OTP)", W, 900, auth("Check your email", "We sent a 6-digit code to aman@example.com",
      otp + B(760, 440, "Verify", "dark", 452, 50) + t(760, 530, "Use a different email", 14, 700, TERRA) + t(760, 560, "Not you? Change", 13, 500, MUTED)))

# 08 onboarding role
ob = navbar("public") + card(420, 140, 600, 640) + d(720, 220, "Welcome to CloseBy", 48, INK, "middle")
ob += t(720, 256, "Tell us how you’ll use CloseBy. This can’t be changed later.", 14, 500, MUTED, "middle")
ob += r(460, 290, 250, 140, SAND, 14, MAROON, 2.5) + d(585, 380, "I’m a Buyer", 30, INK, "middle")
ob += r(730, 290, 250, 140, PAPER, 14, BORDER, 1.5) + d(855, 380, "I own a Shop", 30, INK, "middle")
ob += field(460, 470, 520, "Your name", "e.g. Aman Kumar", value="Aman Kumar") + field(460, 560, 520, "Mobile number", "9876543210")
ob += B(460, 660, "Continue", "dark", 520, 50)
frame("08 Onboarding · role", W, 900, ob)

# 09 shops explorer
sh = navbar("buyer") + r(0, 72, W, 220, SAND) + shopfront(1000, 72, 0.52, "Bakery")
sh += d(120, 160, "Shop from stores near you", 56) + t(120, 196, "Kirana, pharmacy, stationery, bakery and more — delivered or ready for pickup.", 15, 500, MUTED)
sh += r(120, 220, 230, 40, PAPER, 20, BORDER) + t(140, 245, "⌖  Civil Lines, Guna · change", 13, 700)
sh += r(120, 320, 820, 50, PAPER, 25, BORDER, 1.5) + t(148, 351, "Search shops", 14, 400, MUTED) + B(960, 323, "✦ Ask AI to shop", "dark", 200, 44) + B(1176, 323, "Search any distance", "ghost", 144, 44, 12)
sh += chips(120, 396, ["All", "Kirana", "Pharmacy", "Stationery", "Bakery", "Fresh Mart", "Café", "Open now"], 0)
names = [("Sharma Kirana Store", "Kirana", "0.4 km", True, SAND), ("Gupta Medical Hall", "Pharmacy", "0.7 km", True, "#cfe3dc"), ("Vidya Stationers", "Stationery", "1.1 km", True, "#f3d0c4"),
         ("Annapurna Bakery", "Bakery", "1.3 km", False, "#f5dfae"), ("Hari Fresh Mart", "Fresh Mart", "1.6 km", True, "#d9e6c3"), ("Chai Adda Café", "Café", "2.0 km", True, "#f0cfcf")]
for i, (n, k, dd, o, tint) in enumerate(names):
    sh += shopcard(120 + (i % 3) * 408, 460 + (i // 3) * 280, 384, n, k, dd, o, tint=tint)
sh += footer(1060)
frame("09 Shops near you", W, 1260, sh)

# 10 search
se = navbar("buyer") + back(120, 120) + d(120, 190, "Search", 56)
se += r(120, 220, 1200, 56, PAPER, 28, MAROON, 2) + t(150, 255, "doodh aur bread", 16, 600) + B(1196, 226, "Search", "dark", 116, 44)
se += r(120, 296, 1200, 52, "#eef6f3", 12) + t(144, 328, "✦ Understanding your search…  showing “milk” and “bread” in 3 shops nearby", 14, 600, TEAL)
se += chips(120, 370, ["Products", "Shops"], 0)
for i, (n, p, mrp, tint) in enumerate((("Amul Taaza Milk", 28, None, "#e8eef5"), ("Brown Bread", 45, 50, "#f5dfae"), ("Mother Dairy Milk", 30, None, "#e8eef5"), ("Milk Bread", 40, None, "#f5dfae"))):
    se += productcard(120 + i * 306, 430, 282, n, p, mrp, "500 ml" if "Milk" in n and "Bread" not in n else "400 g", tint=tint)
    se += t(136 + i * 306, 734, ["Sharma Kirana · 0.4 km", "Annapurna Bakery · 1.3 km", "Hari Fresh Mart · 1.6 km", "Annapurna Bakery · 1.3 km"][i], 12, 600, TEAL)
frame("10 Search", W, 820, se)

# 11 shop detail
sd = navbar("buyer") + r(0, 72, W, 300, MAROON) + shopfront(880, 72, 0.72, "Sharma Kirana")
sd += back(120, 116) + badge(120, 140, "OPEN · till 9 PM", TEAL) + d(120, 230, "Sharma Kirana Store", 64, CREAM)
sd += t(120, 268, "Kirana · Civil Lines, Guna · 0.4 km · ★ 4.6 (128)", 15, 500, CREAM, op=0.8)
sd += B(120, 296, "Call shop", "outline-light", 130, 40) + B(262, 296, "Chat", "outline-light", 100, 40)
sd += card(120, 410, 260, 620) + t(144, 450, "Filters", 16, 800) + t(300, 450, "Clear all", 12, 700, TERRA)
sd += t(144, 492, "CATEGORIES", 11, 800, MUTED)
for i, cg in enumerate(["Atta & Rice", "Dal & Pulses", "Dairy", "Snacks", "Oil & Ghee", "Personal care"]):
    sd += r(144, 508 + i * 34, 18, 18, MAROON if i == 0 else PAPER, 4, BORDER) + t(172, 522 + i * 34, cg, 13, 500)
sd += t(144, 740, "PRICE", 11, 800, MUTED)
for i, pr in enumerate(["Any price", "Under ₹50", "₹50 – ₹200", "₹200 – ₹500", "Over ₹500"]):
    sd += c(153, 768 + i * 32, 8, MAROON if i == 0 else PAPER, BORDER) + t(172, 773 + i * 32, pr, 13, 500)
sd += r(144, 940, 40, 22, TEAL, 11) + c(173, 951, 8, PAPER) + t(194, 956, "In stock only", 13, 600)
sd += r(410, 410, 640, 46, PAPER, 23, BORDER, 1.5) + t(436, 439, "Search products", 14, 400, MUTED) + r(1066, 410, 254, 46, PAPER, 12, BORDER, 1.5) + t(1086, 439, "Sort: Featured ▾", 14, 600)
prods = [("Basmati Rice", 92, 110, "1 kg", True, 2), ("Toor Dal", 140, None, "1 kg", True, 0), ("Aashirvaad Atta", 265, 290, "5 kg", True, 0), ("Amul Butter", 56, None, "100 g", True, 1),
         ("Fortune Oil", 155, 180, "1 L", True, 0), ("Parle-G", 10, None, "1 pack", True, 0), ("Tata Salt", 28, None, "1 kg", False, 0), ("Maggi", 14, None, "70 g", True, 0)]
for i, (n, p, mrp, u, st, q) in enumerate(prods):
    sd += productcard(410 + (i % 4) * 232, 480 + (i // 4) * 300, 214, n, p, mrp, u, st, q)
sd += r(410, 1100, 910, 64, MAROON, 16) + t(436, 1139, "3 items  ·  ₹240", 16, 800, CREAM) + B(1150, 1110, "View cart  →", "primary", 156, 44)
sd += footer(1220)
frame("11 Shop page", W, 1420, sd)

# 12 cart
ca = navbar("buyer") + back(120, 120) + d(120, 190, "Your cart", 56) + t(120, 224, "From Sharma Kirana Store · 0.4 km", 15, 600, TEAL)
ca += card(120, 250, 780, 400)
for i, (n, u, p, q) in enumerate((("Basmati Rice", "1 kg", 92, 2), ("Amul Butter", "100 g", 56, 1), ("Parle-G", "1 pack", 10, 0))):
    y = 270 + i * 120
    ca += r(144, y, 90, 90, SAND, 12) + t(189, y + 56, n[0], 30, 800, TERRA, "middle") + t(256, y + 36, n, 17, 700) + t(256, y + 60, u, 13, 500, MUTED)
    ca += r(560, y + 26, 120, 40, PAPER, 10, BORDER, 1.5) + t(580, y + 52, "−", 18, 700) + t(620, y + 52, str(max(q, 1)), 15, 800, anchor="middle") + t(652, y + 52, "+", 18, 700)
    ca += d(860, y + 56, f"₹{p * max(q, 1)}", 28, INK, "end") + t(860, y + 80, "Remove", 12, 700, TERRA, "end")
ca += card(930, 250, 390, 330) + d(954, 300, "Bill details", 30)
for i, (k, v) in enumerate((("Item total", "₹250"), ("Delivery fee", "₹0"), ("Discount", "−₹18"))):
    ca += t(954, 344 + i * 32, k, 14, 500, MUTED) + t(1296, 344 + i * 32, v, 14, 700, anchor="end")
ca += f'<line x1="954" y1="448" x2="1296" y2="448" stroke="{BORDER}" stroke-width="1.5"/>' + t(954, 484, "Total", 16, 800) + d(1296, 490, "₹232", 34, INK, "end")
ca += B(954, 510, "Proceed to checkout", "dark", 342, 50)
ca += card(930, 600, 390, 130, SAND) + d(954, 646, "Cart is empty?", 24) + t(954, 672, "Your cart is empty — browse nearby shops to add items.", 12, 500, MUTED) + B(954, 684, "Browse shops", "outline", 150, 34, 11)
frame("12 Cart", W, 820, ca)

# 13 checkout
ck = navbar("buyer") + back(120, 120) + d(120, 190, "Checkout", 56)
ck += card(120, 230, 780, 330) + d(144, 280, "Delivery address", 30) + t(876, 278, "+ Add new address", 13, 700, TERRA, "end")
for i, (lab, ad) in enumerate((("Home", "12 Gandhi Nagar, near Hanuman Mandir, Guna"), ("Work", "Shop 4, Sadar Bazaar, Guna"))):
    y = 304 + i * 112
    ck += r(144, y, 732, 96, SAND if i == 0 else PAPER, 12, MAROON if i == 0 else BORDER, 2 if i == 0 else 1.5)
    ck += c(172, y + 30, 9, MAROON if i == 0 else PAPER, BORDER) + t(194, y + 36, lab, 15, 800) + t(194, y + 62, ad, 14, 500, MUTED)
ck += card(120, 580, 780, 300) + d(144, 630, "Payment method", 30)
for i, (lab, sub) in enumerate((("Pay online (UPI / card)", "GPay, PhonePe, Paytm, cards"), ("Cash on delivery", "Pay when your order arrives"), ("Pay at shop", "For pickup orders"))):
    y = 656 + i * 70
    ck += r(144, y, 732, 58, SAND if i == 0 else PAPER, 12, MAROON if i == 0 else BORDER, 2 if i == 0 else 1.5)
    ck += c(172, y + 29, 9, MAROON if i == 0 else PAPER, BORDER) + t(194, y + 26, lab, 15, 700) + t(194, y + 46, sub, 12, 500, MUTED)
ck += card(930, 230, 390, 360) + d(954, 280, "Order summary", 30)
for i, (k, v) in enumerate((("Basmati Rice × 2", "₹184"), ("Amul Butter × 1", "₹56"), ("Parle-G × 1", "₹10"), ("Delivery fee", "₹0"))):
    ck += t(954, 324 + i * 32, k, 14, 500, MUTED) + t(1296, 324 + i * 32, v, 14, 700, anchor="end")
ck += t(954, 484, "Total", 16, 800) + d(1296, 490, "₹250", 34, INK, "end") + B(954, 516, "Pay ₹250", "primary", 342, 50)
frame("13 Checkout", W, 940, ck)

# 14 payment modal
pm = ck + r(0, 0, W, 940, INK, op=0.55) + card(470, 120, 500, 680) + r(470, 120, 500, 70, MAROON, 16) + r(470, 170, 500, 20, MAROON)
pm += d(500, 168, "CloseBy Pay", 32, CREAM) + badge(840, 140, "TEST MODE", MUSTARD, INK)
pm += chips(500, 214, ["UPI QR", "UPI ID", "Card"], 0) + t(720, 290, "Scan with any UPI app to pay", 15, 700, INK, "middle")
pm += r(600, 310, 240, 240, PAPER, 12, INK, 2)
for i in range(8):
    for k in range(8):
        if (i * 3 + k * 5 + i * k) % 3 == 0:
            pm += r(620 + i * 25, 330 + k * 25, 22, 22, INK, 2)
pm += t(720, 584, "Waiting for payment…", 14, 600, MUTED, "middle") + d(720, 630, "₹250", 44, INK, "middle")
pm += B(510, 660, "Simulate successful scan & pay", "teal", 420, 46) + t(720, 760, "Secured by CloseBy Pay · Demo gateway, no real money is charged", 11, 500, MUTED, "middle")
frame("14 Payment (CloseBy Pay)", W, 940, pm)

# 15 orders
orx = navbar("buyer") + d(120, 170, "Your orders", 56) + chips(120, 200, ["All", "Active", "Completed", "Cancelled"], 0)
olist = [("Sharma Kirana Store", "#CB-1042 · 3 items · Today, 6:40 PM", "₹250", "PREPARING", MUSTARD, INK), ("Gupta Medical Hall", "#CB-1038 · 2 items · Yesterday", "₹186", "COMPLETED", GREEN, CREAM),
         ("Annapurna Bakery", "#CB-1021 · 4 items · 28 Oct", "₹320", "COMPLETED", GREEN, CREAM), ("Vidya Stationers", "#CB-1009 · 1 item · 24 Oct", "₹60", "CANCELLED", MUTED, CREAM)]
for i, (n, s, p, stt, col, tc) in enumerate(olist):
    y = 260 + i * 132
    orx += card(120, y, 1200, 112) + r(144, y + 16, 80, 80, SAND, 12) + t(184, y + 66, n[0], 30, 800, TERRA, "middle")
    orx += d(248, y + 52, n, 28) + t(248, y + 80, s, 13, 500, MUTED) + badge(860, y + 44, stt, col, tc)
    orx += d(1080, y + 66, p, 30, INK, "end") + B(1110, y + 34, "Reorder", "ghost", 90, 40, 12) + t(1290, y + 60, "›", 22, 700, MUTED)
frame("15 Your orders", W, 840, orx)

# 16 order detail
od = navbar("buyer") + back(120, 120) + d(120, 190, "Order #CB-1042", 56) + badge(560, 160, "PREPARING", MUSTARD, INK)
od += t(120, 222, "Sharma Kirana Store · placed today at 6:40 PM · Delivery", 15, 500, MUTED)
od += card(120, 250, 780, 260) + d(144, 300, "Order status", 30)
stps = ["Placed", "Accepted", "Preparing", "Ready", "Completed"]
for i, s in enumerate(stps):
    x = 170 + i * 170; done = i <= 2
    if i < 4:
        od += f'<line x1="{x}" y1="360" x2="{x + 170}" y2="360" stroke="{TEAL if i < 2 else BORDER}" stroke-width="5"/>'
    od += c(x, 360, 16, TEAL if done else PAPER, BORDER, 2) + t(x, 404, s, 13, 700 if done else 500, INK if done else MUTED, "middle")
od += t(144, 450, "The shop is packing your order. Usually ready in 15–20 min.", 14, 500, MUTED)
od += B(144, 462, "Call shop", "outline", 130, 36, 11) + B(286, 462, "Chat with shop", "outline", 160, 36, 11) + B(744, 462, "Cancel order", "danger", 132, 36, 11)
od += card(120, 530, 780, 420) + d(144, 580, "Bill / Invoice", 30) + t(876, 578, "Print / Save as PDF", 13, 700, TERRA, "end")
od += t(144, 616, "Billed to  Aman Kumar · 12 Gandhi Nagar, Guna", 13, 500, MUTED)
od += r(144, 634, 732, 36, SAND, 8)
for k, x in (("Item", 160), ("Qty", 560), ("Rate", 660), ("Amount", 860)):
    od += t(x, 658, k, 12, 800, INK, "end" if k == "Amount" else "start")
for i, (n, q, rt) in enumerate((("Basmati Rice 1 kg", 2, 92), ("Amul Butter 100 g", 1, 56), ("Parle-G", 1, 10))):
    y = 700 + i * 36
    od += t(160, y, n, 14, 500) + t(560, y, str(q), 14, 500) + t(660, y, f"₹{rt}", 14, 500) + t(860, y, f"₹{q * rt}.00", 14, 700, anchor="end")
od += t(160, 820, "Delivery fee", 14, 500, MUTED) + t(860, 820, "₹0.00", 14, 700, anchor="end")
od += t(160, 870, "Total", 16, 800) + d(860, 876, "₹250.00", 32, INK, "end") + badge(160, 896, "PAID", GREEN)
od += t(510, 912, "Thank you for shopping local · CloseBy", 12, 600, MUTED, "middle")
od += card(930, 250, 390, 700) + d(954, 300, "Ask about this order", 26)
od += r(954, 330, 260, 60, SAND, 14) + t(970, 356, "Is this still on time?", 13, 600) + t(970, 376, "6:52 PM", 10, 500, MUTED)
od += r(1006, 410, 290, 80, TEAL, 14) + t(1022, 436, "Yes! Your order will be ready", 13, 600, CREAM) + t(1022, 456, "in about 10 minutes.", 13, 600, CREAM) + t(1022, 476, "AI · 6:52 PM", 10, 500, CREAM, op=0.7)
od += r(954, 880, 342, 46, PAPER, 23, BORDER, 1.5) + t(974, 908, "e.g. Is this still on time?", 13, 400, MUTED) + c(1272, 903, 16, MAROON)
frame("16 Order detail", W, 1020, od)

# 17 messages
ms = navbar("buyer") + back(120, 120) + d(120, 190, "Messages", 56)
convs = [("Sharma Kirana Store", "Order #CB-1042 · Your order is being packed.", "6:52 PM", 2), ("Gupta Medical Hall", "Order #CB-1038 · Thank you! Get well soon.", "Yesterday", 0), ("Annapurna Bakery", "Order #CB-1021 · Cake will be ready at 5.", "28 Oct", 0)]
for i, (n, s, tm, un) in enumerate(convs):
    y = 230 + i * 100
    ms += card(120, y, 1200, 84) + icon(168, y + 42, 26, [TERRA, TEAL, MUSTARD][i], n[0], CREAM) + t(214, y + 36, n, 17, 800) + t(214, y + 60, s, 14, 500, MUTED)
    ms += t(1290, y + 36, tm, 12, 600, MUTED, "end") + (c(1278, y + 58, 11, TERRA) + t(1278, y + 63, str(un), 11, 800, CREAM, "middle") if un else "")
ms += card(120, 560, 1200, 140, SAND) + d(720, 620, "No messages yet?", 30, INK, "middle") + t(720, 650, "Order updates and chats with shops will show up here.", 14, 500, MUTED, "middle") + B(640, 664, "Browse nearby shops", "dark", 160, 30, 10)
frame("17 Messages", W, 760, ms)

# 18 chat thread
ct = navbar("buyer") + card(120, 100, 1200, 760) + r(120, 100, 1200, 80, SAND, 16) + r(120, 160, 1200, 20, SAND)
ct += t(150, 134, "←", 20, 700) + icon(200, 140, 22, TERRA, "S", CREAM) + t(236, 136, "Sharma Kirana Store", 17, 800) + t(236, 158, "Order #CB-1042 · Preparing", 13, 500, TEAL)
ct += r(560, 196, 320, 26, PAPER, 13, BORDER) + t(720, 214, "Today", 11, 700, MUTED, "middle")
ct += r(150, 240, 420, 70, PAPER, 16, BORDER) + t(170, 270, "Namaste! Your order is accepted.", 14, 600) + t(170, 294, "6:41 PM", 11, 500, MUTED)
ct += r(830, 330, 460, 70, MAROON, 16) + t(850, 360, "Can you add 1 packet of Maggi too?", 14, 600, CREAM) + t(850, 384, "6:45 PM · Seen", 11, 500, CREAM, op=0.7)
ct += r(150, 420, 420, 70, PAPER, 16, BORDER) + t(170, 450, "Sure, added. New total ₹264.", 14, 600) + t(170, 474, "6:47 PM", 11, 500, MUTED)
ct += r(560, 510, 320, 26, TERRA, 13) + t(720, 528, "NEW", 11, 800, CREAM, "middle")
ct += r(150, 556, 420, 70, PAPER, 16, BORDER) + t(170, 586, "Your order is being packed.", 14, 600) + t(170, 610, "6:52 PM", 11, 500, MUTED)
ct += r(150, 680, 1140, 60, "#eef6f3", 12) + t(170, 704, "✦ AI suggestions — tap one to edit, then send", 12, 700, TEAL)
ct += chips(170, 714, ["Thank you!", "How long will it take?", "Please deliver after 7"], -1)
ct = ct.replace('height="34"', 'height="20"') if False else ct
ct += r(150, 780, 1040, 50, PAPER, 25, BORDER, 1.5) + t(176, 811, "Type a message", 14, 400, MUTED) + c(1216, 805, 20, SAND) + t(1216, 811, "✦", 14, 700, TEAL, "middle") + c(1266, 805, 22, MAROON) + t(1266, 811, "➤", 14, 700, CREAM, "middle")
frame("18 Chat", W, 920, ct)

# 19 profile
pr = navbar("buyer") + d(120, 170, "Profile", 56)
pr += card(120, 200, 580, 420) + d(144, 250, "Your details", 30) + field(144, 280, 532, "Name", "", value="Aman Kumar") + field(144, 370, 532, "Email", "", value="aman@example.com")
pr += t(144, 446, "Your email is used to sign in.", 12, 500, MUTED) + field(144, 470, 532, "Mobile number", "", value="98765 43210") + B(144, 560, "Save", "dark", 120, 40) + B(276, 560, "My orders", "ghost", 120, 40, 12) + B(556, 560, "Logout", "danger", 120, 40, 11)
pr += card(740, 200, 580, 300) + d(764, 250, "Saved addresses", 30) + B(1220, 222, "+ Add", "ghost", 76, 36, 12)
for i, (lab, ad) in enumerate((("Home", "12 Gandhi Nagar, near Hanuman Mandir, Guna"), ("Work", "Shop 4, Sadar Bazaar, Guna"))):
    pr += r(764, 280 + i * 96, 532, 80, SAND if i == 0 else PAPER, 12, BORDER) + t(788, 314 + i * 96, lab, 15, 800) + t(788, 338 + i * 96, ad, 13, 500, MUTED)
pr += card(740, 520, 580, 100) + d(764, 566, "Email alerts", 26) + t(764, 592, "Get order updates by email when you’re not on CloseBy.", 13, 500, MUTED) + r(1240, 552, 52, 28, TEAL, 14) + c(1278, 566, 10, PAPER)
frame("19 Profile", W, 700, pr)

# 20 shop onboarding wizard
wz = navbar("owner") + d(720, 170, "Set up your shop", 56, INK, "middle") + t(720, 204, "Progress is saved automatically — you can leave and come back anytime.", 14, 500, MUTED, "middle")
for i, s in enumerate(["Details", "Location", "Inventory"]):
    x = 470 + i * 250
    if i < 2:
        wz += f'<line x1="{x}" y1="250" x2="{x + 250}" y2="250" stroke="{TEAL if i == 0 else BORDER}" stroke-width="4"/>'
    wz += c(x, 250, 18, TEAL if i <= 1 else PAPER, BORDER, 2) + t(x, 256, str(i + 1), 14, 800, CREAM if i <= 1 else MUTED, "middle") + t(x, 294, s, 13, 700, INK, "middle")
wz += card(320, 330, 800, 560) + d(350, 384, "Where is your shop?", 34) + t(350, 412, "Drag the pin to your shop’s front door.", 14, 500, MUTED)
wz += r(350, 432, 740, 330, "#e9dcc0", 12)
for i in range(8):
    wz += f'<line x1="{350 + i * 100}" y1="432" x2="{390 + i * 90}" y2="762" stroke="{PAPER}" stroke-width="10"/>'
wz += f'<line x1="350" y1="600" x2="1090" y2="560" stroke="{PAPER}" stroke-width="16"/>'
wz += f'<path d="M720 590 C690 550 690 520 720 520 C750 520 750 550 720 590 Z" fill="{TERRA}" stroke="{CREAM}" stroke-width="4"/>' + c(720, 545, 9, CREAM)
wz += t(350, 790, "📍 Near Hanuman Chowk, Civil Lines, Guna", 14, 600) + B(350, 820, "Back", "ghost", 110, 44, 12) + B(950, 820, "Continue", "teal", 140, 44)
frame("20 Shop onboarding", W, 960, wz)

# owner pages
OH = 1000
dash = navbar("owner") + sidebar("Overview", OH)
dash += d(288, 150, "Today’s overview", 48) + t(288, 182, "Tuesday, 3 November · Sharma Kirana Store", 14, 500, MUTED)
for i, (l, v, s, col) in enumerate((("New orders", "4", "2 waiting > 5 min", TERRA), ("In progress", "3", "", MUSTARD), ("Completed today", "18", "", TEAL), ("Sales today", "₹4,820", "+12% vs yesterday", GREEN))):
    dash += stat(288 + i * 268, 210, 248, l, v, s, col)
dash += card(288, 360, 650, 330) + d(312, 408, "New orders", 28) + t(914, 406, "View all orders →", 13, 700, TERRA, "end")
for i, (n, s, p) in enumerate((("Aman K.", "#CB-1042 · 3 items · 2 min ago", "₹250"), ("Priya S.", "#CB-1043 · 6 items · 4 min ago", "₹612"), ("Rahul M.", "#CB-1044 · 1 item · 7 min ago", "₹45"))):
    y = 430 + i * 82
    dash += r(312, y, 602, 70, SAND if i == 0 else PAPER, 12, BORDER) + t(332, y + 30, n, 15, 800) + t(332, y + 52, s, 12, 500, MUTED) + d(700, y + 46, p, 26, INK, "end")
    dash += B(716, y + 16, "Accept", "teal", 90, 38, 11) + B(814, y + 16, "Reject", "danger", 84, 38, 11)
dash += card(962, 360, 358, 330) + d(986, 408, "Low stock", 28)
for i, (n, q) in enumerate((("Tata Salt 1 kg", "0 left"), ("Amul Butter 100 g", "2 left"), ("Maggi 70 g", "4 left"))):
    dash += t(986, 450 + i * 40, n, 14, 600) + t(1296, 450 + i * 40, q, 13, 800, TERRA, "end")
dash += B(986, 590, "Restock in inventory", "outline", 310, 40, 11)
dash += card(288, 710, 650, 250) + d(312, 758, "AI ideas", 28) + t(312, 782, "restock & prices, from your last 30 days of sales", 12, 500, MUTED)
for i, (tag, s, col) in enumerate((("Restock", "Basmati Rice sells 9/day — order 40 kg by Friday.", TEAL), ("Price idea", "Parle-G at ₹9 matches nearby shops.", MUSTARD))):
    y = 800 + i * 70
    dash += r(312, y, 602, 58, PAPER, 12, BORDER) + badge(328, y + 18, tag.upper(), col, CREAM if col == TEAL else INK) + t(440, y + 34, s, 13, 600) + t(890, y + 34, "Apply", 12, 800, TERRA, "end")
dash += card(962, 710, 358, 250) + d(986, 758, "AI & speed", 28) + t(986, 782, "how the AI helpers are working for you", 12, 500, MUTED)
dash += d(986, 850, "82%", 44, TEAL) + t(986, 874, "AI suggestions accepted · 30 days", 12, 500, MUTED) + d(986, 930, "1m 40s", 36, INK) + t(1120, 928, "avg. time to answer an order", 11, 500, MUTED)
frame("21 Seller · Overview", W, OH, dash)

do = navbar("owner") + sidebar("Orders", 1100) + d(288, 150, "Orders", 48)
do += chips(288, 176, ["New · 4", "In progress · 3", "Completed", "Cancelled"], 0)
for i in range(2):
    x = 288 + i * 528
    do += card(x, 236, 504, 420) + t(x + 24, 274, ["Aman K. · #CB-1042", "Priya S. · #CB-1043"][i], 17, 800) + t(x + 24, 298, ["2 min ago · Delivery · UPI paid", "4 min ago · Pickup · Pay at shop"][i], 13, 500, MUTED)
    do += badge(x + 380, 258, "NEW ORDER", MUSTARD, INK)
    if i == 0:
        do += r(x + 24, 316, 456, 44, "#eef6f3", 10) + t(x + 40, 344, "Auto-accepted by your rules", 13, 700, TEAL)
    else:
        do += r(x + 24, 316, 456, 60, "#fbe9e4", 10) + t(x + 40, 340, "Check before accepting", 13, 800, TERRA) + t(x + 40, 362, "Call the buyer if unsure. Nothing is blocked automatically.", 11, 500, MUTED)
    for k, (n, q) in enumerate((("Basmati Rice 1 kg", "× 2"), ("Amul Butter 100 g", "× 1"), ("Parle-G", "× 1"))):
        do += t(x + 24, 410 + k * 30, n, 14, 500) + t(x + 480, 410 + k * 30, q, 14, 700, anchor="end")
    do += t(x + 24, 520, "Total", 15, 800) + d(x + 480, 526, ["₹250", "₹612"][i], 30, INK, "end")
    do += r(x + 24, 540, 456, 40, PAPER, 10, BORDER) + t(x + 40, 565, "✦ Ask AI: Is everything in stock?", 13, 600, TEAL)
    do += B(x + 24, 596, "Call", "ghost", 70, 40, 12) + B(x + 102, 596, "Bill", "ghost", 64, 40, 12) + B(x + 270, 596, "Reject", "danger", 90, 40, 11) + B(x + 368, 596, "Start preparing", "teal", 112, 40, 10)
do += card(288, 680, 1032, 380) + d(312, 728, "In progress", 28)
for i, (n, s, act) in enumerate((("Rahul M. · #CB-1039", "Preparing · 12 min", "Mark ready"), ("Neha G. · #CB-1040", "Ready for pickup", "Mark completed"), ("Vikas P. · #CB-1041", "Preparing · 3 min", "Mark ready"))):
    y = 752 + i * 92
    do += r(312, y, 984, 78, PAPER, 12, BORDER) + t(336, y + 34, n, 15, 800) + t(336, y + 58, s, 13, 500, MUTED) + B(1130, y + 20, act, "dark", 150, 40, 11)
frame("22 Seller · Orders", W, 1100, do)

inv = navbar("owner") + sidebar("Inventory", 1000) + d(288, 150, "Inventory", 48) + t(288, 182, "Add items one by one or import a JSON / CSV file.", 14, 500, MUTED)
inv += B(870, 128, "Import JSON / CSV", "ghost", 160, 42, 12) + B(1040, 128, "✦ Add with AI", "outline", 130, 42, 11) + B(1180, 128, "+ Add product", "dark", 140, 42, 11)
inv += r(288, 210, 520, 44, PAPER, 22, BORDER, 1.5) + t(312, 238, "Search products", 14, 400, MUTED) + chips(830, 215, ["All", "In stock", "Out of stock"], 0)
inv += card(288, 276, 1032, 680) + r(288, 276, 1032, 48, SAND, 16) + r(288, 304, 1032, 20, SAND)
for k, x in (("PRODUCT", 360), ("CATEGORY", 640), ("PRICE", 800), ("MRP", 900), ("STOCK", 1000), ("STATUS", 1100)):
    inv += t(x, 306, k, 11, 800, MUTED)
rows = [("Basmati Rice", "1 kg", "Atta & Rice", 92, 110, 34, True), ("Toor Dal", "1 kg", "Dal & Pulses", 140, None, 21, True), ("Aashirvaad Atta", "5 kg", "Atta & Rice", 265, 290, 12, True),
        ("Amul Butter", "100 g", "Dairy", 56, None, 2, True), ("Fortune Oil", "1 L", "Oil & Ghee", 155, 180, 9, True), ("Parle-G", "1 pack", "Snacks", 10, None, 80, True),
        ("Tata Salt", "1 kg", "Essentials", 28, None, 0, False), ("Maggi", "70 g", "Snacks", 14, None, 4, True), ("Surf Excel", "1 kg", "Home care", 130, 145, 15, True)]
for i, (n, u, cg, p, mrp, s, st) in enumerate(rows):
    y = 344 + i * 66
    inv += f'<line x1="300" y1="{y + 58}" x2="1308" y2="{y + 58}" stroke="{BORDER}"/>' + r(304, y + 6, 44, 44, SAND, 8) + t(326, y + 35, n[0], 18, 800, TERRA, "middle")
    inv += t(360, y + 26, n, 14, 700) + t(360, y + 46, u, 12, 500, MUTED) + t(640, y + 36, cg, 13, 500) + t(800, y + 36, f"₹{p}", 14, 700) + t(900, y + 36, f"₹{mrp}" if mrp else "—", 13, 500, MUTED)
    inv += t(1000, y + 36, str(s), 14, 800, TERRA if s < 5 else INK) + badge(1100, y + 20, "IN STOCK" if st else "OUT", TEAL if st else MUTED) + t(1296, y + 36, "Edit  ·  ⋯", 12, 700, MUTED, "end")
frame("23 Seller · Inventory", W, 1000, inv)

# AI stock dialog
ai = inv + r(0, 0, W, 1000, INK, op=0.55) + card(420, 130, 600, 720) + d(450, 190, "Add stock with AI", 36) + chips(450, 214, ["Voice / text", "Shelf photo"], 0)
ai += r(450, 266, 540, 110, PAPER, 12, BORDER, 1.5) + t(470, 296, "rice 5kg 60, dal 120, maggi 12 packet 14", 14, 600) + c(958, 346, 20, TERRA) + t(958, 352, "●", 12, 700, CREAM, "middle")
ai += t(450, 410, "Yellow rows need a second look. Untick anything you don’t want to add.", 12, 500, MUTED)
for i, (n, p, q, warn) in enumerate((("Rice (Loose)", "₹60", "5 kg", False), ("Toor Dal", "₹120", "1 kg", False), ("Maggi", "₹14", "12", True))):
    y = 430 + i * 64
    ai += r(450, y, 540, 54, "#fbefcf" if warn else PAPER, 10, BORDER) + r(466, y + 18, 18, 18, MAROON, 4) + t(500, y + 33, n, 14, 700) + t(800, y + 33, p, 14, 700) + t(900, y + 33, q, 14, 600, MUTED)
ai += B(450, 760, "Try again", "ghost", 120, 44, 12) + B(810, 760, "Add 3 items", "dark", 180, 44)
frame("24 Seller · Add stock with AI", W, 1000, ai)

rp = navbar("owner") + sidebar("Reports", 1100) + d(288, 150, "Reports", 48) + chips(1060, 120, ["7 days", "30 days", "90 days"], 1)
rp += chips(288, 180, ["Sales", "Orders", "Buyers", "Top products"], 0)
for i, (l, v, s, col) in enumerate((("Sales (completed orders)", "₹1,24,800", "+18% vs last period", GREEN), ("Completed orders", "512", "", TEAL), ("Average order", "₹244", "", MUSTARD))):
    rp += stat(288 + i * 352, 236, 328, l, v, s, col)
rp += card(288, 380, 1032, 380) + d(312, 428, "Sales per day", 28)
vals = [32, 45, 38, 50, 62, 48, 70, 66, 58, 74, 80, 69, 85, 90, 78, 72, 88, 95, 84, 92, 99, 86, 94, 102, 97, 110, 105, 98, 112, 120]
for i, v in enumerate(vals):
    bh = v * 2.4
    rp += r(320 + i * 32.5, 730 - bh, 22, bh, MAROON if i == len(vals) - 1 else TERRA, 4, op=1 if i == len(vals) - 1 else 0.75)
rp += f'<line x1="312" y1="731" x2="1296" y2="731" stroke="{BORDER}" stroke-width="2"/>'
rp += card(288, 780, 506, 280) + d(312, 828, "Top products", 28)
for i, (n, v) in enumerate((("Basmati Rice", 0.92), ("Amul Milk", 0.78), ("Parle-G", 0.6), ("Toor Dal", 0.44))):
    y = 856 + i * 48
    rp += t(312, y + 16, n, 13, 600) + r(470, y + 2, 300, 18, SAND, 9) + r(470, y + 2, 300 * v, 18, TEAL, 9)
rp += card(814, 780, 506, 280) + d(838, 828, "Restock now", 28)
for i, (n, s, col) in enumerate((("Tata Salt 1 kg", "Out · sells 6/day", TERRA), ("Amul Butter", "2 left · this week", MUSTARD), ("Maggi 70 g", "4 left · this week", MUSTARD))):
    y = 856 + i * 60
    rp += r(838, y, 458, 50, PAPER, 10, BORDER) + t(858, y + 31, n, 14, 700) + t(1280, y + 31, s, 12, 700, col, "end")
frame("25 Seller · Reports", W, 1100, rp)

st_ = navbar("owner") + sidebar("Shop settings", 1240) + d(288, 150, "Shop settings", 48)
st_ += card(288, 180, 506, 430) + d(312, 228, "Shop status", 28) + t(312, 254, "Closing hides your shop from buyer search immediately.", 12, 500, MUTED)
st_ += r(312, 272, 458, 60, "#eef6f3", 12) + t(332, 308, "Shop is open", 15, 800, TEAL) + r(700, 288, 52, 28, TEAL, 14) + c(738, 302, 10, PAPER)
st_ += d(312, 376, "Working hours", 24) + field(312, 396, 214, "Opens at", "", value="8:00 AM") + field(556, 396, 214, "Closes at", "", value="9:00 PM")
st_ += t(312, 496, "Working days", 13, 700)
for i, dd in enumerate(["M", "T", "W", "T", "F", "S", "S"]):
    st_ += c(334 + i * 60, 534, 22, MAROON if i < 6 else PAPER, BORDER) + t(334 + i * 60, 539, dd, 13, 800, CREAM if i < 6 else MUTED, "middle")
st_ += B(312, 566, "Save", "dark", 100, 36, 11)
st_ += card(814, 180, 506, 430) + d(838, 228, "Auto-accept orders", 28) + r(1244, 206, 52, 28, TEAL, 14) + c(1282, 220, 10, PAPER)
st_ += field(838, 270, 458, "Largest order to auto-accept (₹)", "", value="₹500") + t(838, 376, "Payment types", 13, 700)
for i, pt in enumerate(["UPI / card (paid online)", "Cash on delivery", "Pay at shop"]):
    st_ += r(838, 394 + i * 40, 18, 18, MAROON if i == 0 else PAPER, 4, BORDER) + t(866, 408 + i * 40, pt, 13, 600)
st_ += card(288, 630, 1032, 420) + d(312, 680, "AI helpers", 28) + t(312, 706, "Every helper only ever drafts a suggestion for you to confirm — nothing changes on its own.", 12, 500, MUTED)
for i, hl in enumerate(["Order accept/reject suggestions", "Voice/text stock import", "Buyer sentence-to-cart (affects your shop's listing)", "AI reply suggestions in order chats (you and your buyers)", "AI restock & price ideas"]):
    y = 730 + i * 60
    st_ += r(312, y, 984, 50, PAPER, 10, BORDER) + t(332, y + 31, hl, 14, 600) + r(1228, y + 12, 48, 26, TEAL if i != 2 else BORDER, 13) + c(1263 if i != 2 else 1241, y + 25, 9, PAPER)
frame("26 Seller · Shop settings", W, 1240, st_)

ad = navbar("owner").replace("SELLER", "OPERATOR").replace("Sharma Kirana Store", "Operator") + d(120, 160, "Operator dashboard", 56) + t(120, 194, "AI cost, errors and order health across all shops.", 15, 500, MUTED)
ad += r(120, 216, 1200, 54, "#fbe9e4", 12, TERRA) + t(144, 249, "AI spend jumped today: ₹412 vs ₹180 average. Set AI_DISABLED=true to stop all AI at once.", 14, 700, TERRA)
for i, (l, v, col) in enumerate((("AI cost per order", "₹0.82", TEAL), ("AI error rate", "1.4%", MUSTARD), ("Order reject rate", "3.1%", TERRA), ("Orders with warnings", "27", PINK))):
    ad += stat(120 + i * 306, 292, 282, l, v, "", col)
ad += card(120, 436, 780, 340) + d(144, 484, "AI spend per day", 28) + t(144, 508, "Last 14 days, India time. Today is so far.", 12, 500, MUTED)
for i, v in enumerate([40, 55, 48, 60, 52, 70, 66, 58, 75, 62, 68, 80, 72, 140]):
    ad += r(160 + i * 52, 750 - v * 1.5, 34, v * 1.5, TERRA if i == 13 else TEAL, 4)
ad += card(930, 436, 390, 340) + d(954, 484, "Slowest shops to answer", 24) + t(954, 506, "Average time to accept/reject by hand; shops with 3+ orders.", 10, 500, MUTED)
for i, (n, v) in enumerate((("Annapurna Bakery", "6m 10s"), ("Chai Adda Café", "4m 52s"), ("Vidya Stationers", "3m 30s"), ("Hari Fresh Mart", "2m 45s"))):
    ad += t(954, 548 + i * 48, n, 14, 600) + t(1296, 548 + i * 48, v, 14, 800, TERRA if i == 0 else INK, "end")
ad += card(120, 796, 1200, 300) + d(144, 844, "Order warnings", 28)
for i, (o, s, w) in enumerate((("#CB-1043", "Priya S. → Sharma Kirana", "Large first order from a new buyer"), ("#CB-1031", "Rahul M. → Gupta Medical", "Address far from shop (6.2 km)"), ("#CB-1027", "Neha G. → Hari Fresh Mart", "3 cancelled orders this week"))):
    y = 868 + i * 70
    ad += r(144, y, 1152, 58, PAPER, 10, BORDER) + t(164, y + 35, o, 14, 800) + t(280, y + 35, s, 14, 500) + t(1276, y + 35, w, 13, 700, TERRA, "end")
frame("27 Operator dashboard", W, 1160, ad)

er = navbar("public") + shopfront(400, 160, 1.0, "Closed") + r(400, 160, 640, 420, INK, op=0.25)
er += d(720, 680, "CloseBy is resting for a bit", 56, INK, "middle") + t(720, 716, "This page doesn’t exist, or isn’t available to you.", 16, 500, MUTED, "middle")
er += B(600, 744, "Go home", "dark", 110, 46) + B(724, 744, "Try again", "outline", 116, 46)
frame("28 Not found · Error", W, 860, er)

# ---------- mobile ----------
mh = navbar("public", M) + r(0, 64, M, 420, MAROON)
mh += d(195, 150, "Everything you", 46, CREAM, "middle") + d(195, 200, "need,", 46, CREAM, "middle") + d(195, 262, "CloseBy.", 58, MUSTARD, "middle")
mh += t(195, 300, "Shop directly from your neighbourhood", 13, 500, CREAM, "middle", 0.8) + t(195, 320, "and support local businesses.", 13, 500, CREAM, "middle", 0.8)
mh += B(20, 346, "Start shopping  →", "primary", 350, 48) + B(20, 404, "I have an account", "outline-light", 350, 48)
mh += r(0, 484, M, 270, SAND) + f'<clipPath id="mh"><rect x="0" y="484" width="{M}" height="270"/></clipPath><g clip-path="url(#mh)">{shopfront(-90, 500, 0.85, "Sharma Kirana")}</g>'
mh += r(20, 712, 190, 30, PAPER, 15) + t(34, 732, "⌖ Guna, Madhya Pradesh", 11, 700)
mh += d(195, 830, "Good for your street.", 34, INK, "middle") + d(195, 872, "And your business.", 34, TERRA, "middle")
for i, (n, s, col) in enumerate(cats):
    x = 20 + (i % 2) * 180; y = 910 + (i // 2) * 170
    mh += card(x, y, 170, 154) + c(x + 85, y + 50, 30, col) + t(x + 85, y + 59, n[0], 22, 800, CREAM, "middle") + d(x + 85, y + 116, n, 22, INK, "middle") + t(x + 85, y + 138, s, 9, 500, MUTED, "middle")
mh += r(20, 1440, 350, 230, MAROON, 20) + t(40, 1476, "FOR SHOP OWNERS", 10, 800, MUSTARD) + d(40, 1530, "Bring your shop", 38, CREAM) + d(40, 1574, "online.", 38, MUSTARD) + B(40, 1600, "List your shop", "primary", 310, 46)
mh += footer(1700, M)
frame("M1 Home · mobile", M, 1920, mh)

msh = navbar("buyer", M) + d(20, 120, "Shops near you", 38) + r(20, 136, 200, 30, PAPER, 15, BORDER) + t(34, 156, "⌖ Civil Lines · change", 11, 700)
msh += r(20, 180, 350, 46, PAPER, 23, BORDER, 1.5) + t(42, 208, "Search shops", 13, 400, MUTED)
msh += B(20, 236, "✦ Ask AI to shop", "dark", 350, 42, 12) + chips(20, 292, ["All", "Kirana", "Pharmacy", "Bakery"], 0)
for i, (n, k, dd, o, tint) in enumerate(names[:4]):
    msh += shopcard(20, 344 + i * 266, 350, n, k, dd, o, tint=tint)
msh += r(0, 1380, M, 64, PAPER) + f'<line x1="0" y1="1380" x2="{M}" y2="1380" stroke="{BORDER}"/>'
for i, n in enumerate(["Shops", "Search", "Cart", "Orders", "Profile"]):
    msh += icon(39 + i * 78, 1402, 10, MAROON if i == 0 else SAND) + t(39 + i * 78, 1430, n, 10, 700, MAROON if i == 0 else MUTED, "middle")
frame("M2 Shops · mobile", M, 1444, msh)

msd = navbar("buyer", M) + r(0, 64, M, 260, MAROON) + f'<clipPath id="msd"><rect x="0" y="64" width="{M}" height="260"/></clipPath><g clip-path="url(#msd)" opacity="0.35">{shopfront(-60, 80, 0.8)}</g>'
msd += t(20, 100, "← Back", 13, 700, CREAM) + badge(20, 120, "OPEN · till 9 PM", TEAL) + d(20, 200, "Sharma Kirana", 44, CREAM) + d(20, 244, "Store", 44, CREAM)
msd += t(20, 274, "Kirana · 0.4 km · ★ 4.6", 13, 500, CREAM, op=0.8) + B(20, 286, "Call", "outline-light", 80, 30, 10) + B(110, 286, "Chat", "outline-light", 80, 30, 10)
msd += r(20, 344, 280, 44, PAPER, 22, BORDER, 1.5) + t(40, 371, "Search products", 13, 400, MUTED) + r(310, 344, 60, 44, PAPER, 12, BORDER, 1.5) + t(340, 371, "⚲", 16, 700, INK, "middle")
msd += chips(20, 402, ["Atta & Rice", "Dal", "Dairy", "Snacks"], 0)
for i, (n, p, mrp, u, s, q) in enumerate(prods[:6]):
    msd += productcard(20 + (i % 2) * 180, 452 + (i // 2) * 296, 170, n, p, mrp, u, s, q)
msd += r(20, 1352, 350, 60, MAROON, 16) + t(40, 1388, "3 items · ₹240", 15, 800, CREAM) + B(232, 1362, "View cart", "primary", 124, 40, 11)
frame("M3 Shop page · mobile", M, 1440, msd)

mca = navbar("buyer", M) + t(20, 100, "← Back", 13, 700, MUTED) + d(20, 160, "Your cart", 44) + t(20, 188, "From Sharma Kirana Store", 13, 600, TEAL)
for i, (n, u, p, q) in enumerate((("Basmati Rice", "1 kg", 92, 2), ("Amul Butter", "100 g", 56, 1), ("Parle-G", "1 pack", 10, 1))):
    y = 210 + i * 104
    mca += card(20, y, 350, 92) + r(32, y + 12, 68, 68, SAND, 10) + t(66, y + 56, n[0], 24, 800, TERRA, "middle") + t(114, y + 38, n, 15, 700) + t(114, y + 60, u, 12, 500, MUTED)
    mca += d(356, y + 40, f"₹{p * q}", 22, INK, "end") + r(266, y + 52, 90, 30, PAPER, 8, BORDER) + t(280, y + 72, "−", 15, 700) + t(311, y + 72, str(q), 13, 800, anchor="middle") + t(338, y + 72, "+", 15, 700)
mca += card(20, 540, 350, 200) + t(40, 580, "Item total", 13, 500, MUTED) + t(350, 580, "₹250", 13, 700, anchor="end") + t(40, 608, "Delivery fee", 13, 500, MUTED) + t(350, 608, "₹0", 13, 700, anchor="end")
mca += t(40, 650, "Total", 15, 800) + d(350, 656, "₹250", 30, INK, "end") + B(40, 676, "Proceed to checkout", "dark", 310, 48)
frame("M4 Cart · mobile", M, 800, mca)

mob = navbar("owner", M) + d(20, 120, "Today’s overview", 36)
for i, (l, v, col) in enumerate((("New orders", "4", TERRA), ("In progress", "3", MUSTARD), ("Completed", "18", TEAL), ("Sales today", "₹4,820", GREEN))):
    x = 20 + (i % 2) * 180; y = 144 + (i // 2) * 136
    mob += card(x, y, 170, 120) + r(x, y, 6, 120, col, 3) + t(x + 20, y + 34, l, 12, 600, MUTED) + d(x + 20, y + 86, v, 34, INK)
mob += d(20, 456, "New orders", 28)
for i, (n, s, p) in enumerate((("Aman K.", "#CB-1042 · 3 items", "₹250"), ("Priya S.", "#CB-1043 · 6 items", "₹612"))):
    y = 476 + i * 140
    mob += card(20, y, 350, 126) + t(40, y + 32, n, 15, 800) + t(40, y + 54, s, 12, 500, MUTED) + d(350, y + 42, p, 24, INK, "end")
    mob += B(40, y + 70, "Accept", "teal", 150, 40, 11) + B(200, y + 70, "Reject", "danger", 150, 40, 11)
frame("M5 Seller overview · mobile", M, 800, mob)


# ---------- write ----------
FONT_IMPORT = ('<style>@import url("https://fonts.googleapis.com/css2?family=Galada&amp;'
               'family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;display=swap");</style>')


def svg_doc(w, h, inner):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<defs>{FONT_IMPORT}</defs>{inner}</svg>')


def slug(n):
    return "".join(ch if ch.isalnum() else "-" for ch in n.lower()).strip("-").replace("--", "-")


for name, w, h, body in FRAMES:
    open(os.path.join(OUT, slug(name) + ".svg"), "w").write(
        svg_doc(w, h, f'<g id="{escape(name)}"><clipPath id="clip-{slug(name)}"><rect width="{w}" height="{h}"/></clipPath><g clip-path="url(#clip-{slug(name)})">{body}</g></g>'))

# one canvas with every frame, desktop rows then mobile row
GAP = 160; x = 0; y = 120; rowh = 0; parts = []; maxw = 0
cols = 0
for name, w, h, body in FRAMES:
    if name.startswith("M1"):
        x = 0; y += rowh + GAP + 120; rowh = 0; cols = 0
    elif cols == 4:
        x = 0; y += rowh + GAP + 60; rowh = 0; cols = 0
    parts.append(f'<g id="{escape(name)}" transform="translate({x} {y})">'
                 f'{t(0, -30, name, 40, 800, INK)}'
                 f'<clipPath id="all-{slug(name)}"><rect width="{w}" height="{h}"/></clipPath>'
                 f'<g clip-path="url(#all-{slug(name)})">{body}</g></g>')
    x += w + GAP; cols += 1; rowh = max(rowh, h); maxw = max(maxw, x)
total_h = y + rowh + 120
open(os.path.join(OUT, "closeby-all-screens.svg"), "w").write(
    svg_doc(maxw, total_h, r(0, 0, maxw, total_h, "#e9e1cf") + "".join(parts)))
print(len(FRAMES), "frames ->", OUT)
