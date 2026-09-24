// Hand-drawn SVG scenes for the landing "How it works" / "Features" sections.
// Colours come from the brand tokens; motion comes from the cb-* classes in
// globals.css (switched off for prefers-reduced-motion).

const STAR = "M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6Z";

function Sparkle({ x, y, delay = 0, className = "fill-brand-yellow" }: { x: number; y: number; delay?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={STAR} className={`cb-twinkle ${className}`} style={{ animationDelay: `${delay}s` }} />
    </g>
  );
}

function Scene({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 240 160" role="img" aria-label={label} className="h-auto w-full">
      {children}
    </svg>
  );
}

/* ---------- Shoppers ---------- */

function MiniShop({ x, awning, body }: { x: number; awning: string; body: string }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="0" y="84" width="56" height="56" rx="3" className={body} />
      <rect x="-3" y="74" width="62" height="14" rx="3" className={awning} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 20} y="74" width="8" height="14" className="fill-cream/70" />
      ))}
      <rect x="20" y="108" width="16" height="32" rx="2" className="fill-forest" />
      <rect x="5" y="96" width="11" height="10" rx="1.5" className="fill-brand-sky" />
      <rect x="40" y="96" width="11" height="10" rx="1.5" className="fill-brand-sky" />
    </g>
  );
}

export function FindShopArt() {
  return (
    <Scene label="Map pin bouncing over neighbourhood shops">
      <rect x="0" y="140" width="240" height="20" className="fill-brand-green/25" />
      <MiniShop x={22} awning="fill-brand-orange" body="fill-brand-peach" />
      <MiniShop x={92} awning="fill-brand-green" body="fill-brand-yellow" />
      <MiniShop x={162} awning="fill-brand-blue" body="fill-brand-peach" />
      <ellipse cx="120" cy="146" rx="16" ry="4" className="cb-ring fill-brand-lime/60" />
      <g className="cb-bob">
        <path d="M120 66 C108 50 100 42 100 31 a20 20 0 1 1 40 0 c0 11 -8 19 -20 35z" className="fill-brand-orange stroke-forest" strokeWidth="2" />
        <circle cx="120" cy="31" r="7" className="fill-cream" />
      </g>
      <Sparkle x={62} y={40} />
      <Sparkle x={190} y={30} delay={0.7} />
    </Scene>
  );
}

export function CartArt() {
  const items = [
    // milk carton
    <g key="milk">
      <rect x="98" y="40" width="16" height="24" rx="2" className="fill-white stroke-forest" strokeWidth="1.5" />
      <path d="M98 46 l8 -8 l8 8" className="fill-brand-sky stroke-forest" strokeWidth="1.5" />
    </g>,
    // apple
    <g key="apple">
      <circle cx="128" cy="52" r="9" className="fill-brand-orange stroke-forest" strokeWidth="1.5" />
      <path d="M128 43 q2 -6 7 -6" className="stroke-brand-green fill-none" strokeWidth="2" />
    </g>,
    // bread
    <g key="bread">
      <rect x="138" y="44" width="22" height="14" rx="6" className="fill-brand-yellow stroke-forest" strokeWidth="1.5" />
    </g>,
  ];
  return (
    <Scene label="Groceries dropping into a shopping bag, with UPI card and coin">
      <rect x="0" y="140" width="240" height="20" className="fill-brand-green/25" />
      {items.map((item, i) => (
        <g key={i} className="cb-drop" style={{ animationDelay: `${i * 0.9}s` }}>
          {item}
        </g>
      ))}
      <path d="M104 76 v-10 a16 16 0 0 1 32 0 v10" className="stroke-forest fill-none" strokeWidth="4" strokeLinecap="round" />
      <path d="M84 74 h72 l8 66 h-88z" className="fill-brand-lime stroke-forest" strokeWidth="2" strokeLinejoin="round" />
      <text x="120" y="116" textAnchor="middle" className="fill-forest" fontSize="13" fontWeight="800">
        CloseBy
      </text>
      <g className="cb-float">
        <rect x="178" y="38" width="48" height="32" rx="5" className="fill-brand-blue" />
        <rect x="184" y="45" width="10" height="7" rx="1.5" className="fill-brand-yellow" />
        <text x="202" y="64" textAnchor="middle" className="fill-cream" fontSize="10" fontWeight="800">
          UPI
        </text>
      </g>
      <g className="cb-float" style={{ animationDelay: "1.2s" }}>
        <circle cx="38" cy="70" r="15" className="fill-brand-yellow stroke-forest" strokeWidth="2" />
        <text x="38" y="75" textAnchor="middle" className="fill-forest" fontSize="14" fontWeight="800">
          ₹
        </text>
      </g>
      <Sparkle x={60} y={34} delay={0.4} />
    </Scene>
  );
}

export function TrackArt() {
  const steps = ["Placed", "Accepted", "Ready"];
  return (
    <Scene label="Delivery scooter on the road, order steps lighting up and a chat bubble">
      {steps.map((s, i) => (
        <g key={s} className="cb-step" style={{ animationDelay: `${i * 0.8}s` }}>
          <rect x="14" y={14 + i * 20} width="72" height="15" rx="7.5" className="fill-brand-lime" />
          <circle cx="23" cy={21.5 + i * 20} r="4" className="fill-forest" />
          <text x="31" y={25 + i * 20} className="fill-forest" fontSize="9" fontWeight="800">
            {s}
          </text>
        </g>
      ))}
      <g className="cb-float">
        <rect x="142" y="16" width="80" height="34" rx="12" className="fill-white stroke-forest" strokeWidth="1.5" />
        <path d="M160 49 l-6 10 l14 -9z" className="fill-white stroke-forest" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="158" y="48" width="12" height="3" className="fill-white" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={168 + i * 14} cy="33" r="4" className="cb-blink fill-brand-blue" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </g>
      <rect x="0" y="130" width="240" height="30" className="fill-forest" />
      <line x1="0" y1="145" x2="240" y2="145" className="cb-road stroke-cream/70" strokeWidth="3" strokeDasharray="10 8" />
      <g className="cb-drive">
        <rect x="0" y="90" width="20" height="18" rx="2" className="fill-brand-orange stroke-forest" strokeWidth="1.5" />
        <rect x="6" y="110" width="38" height="10" rx="5" className="fill-brand-blue" />
        <line x1="40" y1="112" x2="47" y2="92" className="stroke-forest" strokeWidth="3" strokeLinecap="round" />
        <line x1="43" y1="92" x2="52" y2="92" className="stroke-forest" strokeWidth="3" strokeLinecap="round" />
        <rect x="18" y="86" width="11" height="22" rx="5" className="fill-brand-lime stroke-forest" strokeWidth="1.5" />
        <line x1="27" y1="94" x2="44" y2="93" className="stroke-brand-lime" strokeWidth="4" strokeLinecap="round" />
        <circle cx="24" cy="79" r="6.5" className="fill-brand-peach stroke-forest" strokeWidth="1.5" />
        <path d="M17.5 78 a6.5 6.5 0 0 1 13 0z" className="fill-brand-orange" />
        <circle cx="12" cy="123" r="7" className="fill-forest stroke-cream" strokeWidth="2" />
        <circle cx="40" cy="123" r="7" className="fill-forest stroke-cream" strokeWidth="2" />
      </g>
    </Scene>
  );
}

/* ---------- Shop owners ---------- */

export function ListShopArt() {
  return (
    <Scene label="A new shop front with a swinging OPEN sign">
      <rect x="0" y="140" width="240" height="20" className="fill-brand-green/25" />
      <rect x="54" y="56" width="132" height="84" rx="3" className="fill-brand-peach stroke-forest" strokeWidth="2" />
      <rect x="68" y="22" width="104" height="22" rx="4" className="fill-forest" />
      <text x="120" y="37" textAnchor="middle" className="fill-brand-lime" fontSize="11" fontWeight="800" letterSpacing="1">
        MY SHOP
      </text>
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i}>
          <rect x={50 + i * 20} y="44" width="20" height="16" className={i % 2 ? "fill-cream" : "fill-brand-orange"} />
          <circle cx={60 + i * 20} cy="60" r="10" className={i % 2 ? "fill-cream" : "fill-brand-orange"} />
        </g>
      ))}
      <rect x="66" y="80" width="54" height="40" rx="2" className="fill-brand-sky stroke-forest" strokeWidth="2" />
      <line x1="66" y1="100" x2="120" y2="100" className="stroke-forest" strokeWidth="2" />
      {[72, 86, 100].map((x, i) => (
        <rect key={x} x={x} y={i === 1 ? 88 : 90} width="10" height={i === 1 ? 12 : 10} rx="1.5" className={["fill-brand-orange", "fill-brand-green", "fill-brand-yellow"][i]} />
      ))}
      {[74, 92].map((x, i) => (
        <circle key={x} cx={x + 4} cy="113" r="5" className={i ? "fill-brand-blue" : "fill-brand-lime"} />
      ))}
      <rect x="132" y="80" width="40" height="60" rx="2" className="fill-brand-green stroke-forest" strokeWidth="2" />
      <circle cx="164" cy="112" r="2.5" className="fill-brand-yellow" />
      <g className="cb-swing" style={{ transformOrigin: "152px 84px" }}>
        <line x1="146" y1="84" x2="141" y2="94" className="stroke-forest" strokeWidth="1.5" />
        <line x1="158" y1="84" x2="163" y2="94" className="stroke-forest" strokeWidth="1.5" />
        <rect x="136" y="94" width="32" height="14" rx="3" className="fill-brand-lime stroke-forest" strokeWidth="1.5" />
        <text x="152" y="104.5" textAnchor="middle" className="fill-forest" fontSize="8" fontWeight="800">
          OPEN
        </text>
      </g>
      <Sparkle x={34} y={40} />
      <Sparkle x={206} y={30} delay={0.6} className="fill-brand-lime" />
      <Sparkle x={214} y={96} delay={1.2} />
    </Scene>
  );
}

export function AddProductsArt() {
  const boxes = [
    { x: 140, y: 58, w: 16, h: 22, c: "fill-brand-orange" },
    { x: 160, y: 62, w: 18, h: 18, c: "fill-brand-yellow" },
    { x: 182, y: 54, w: 14, h: 26, c: "fill-brand-blue" },
    { x: 200, y: 64, w: 16, h: 16, c: "fill-brand-lime" },
    { x: 142, y: 100, w: 22, h: 20, c: "fill-brand-peach" },
    { x: 168, y: 94, w: 14, h: 26, c: "fill-brand-green" },
    { x: 186, y: 102, w: 26, h: 18, c: "fill-brand-sky" },
  ];
  return (
    <Scene label="Speaking into a phone, and products appearing on a shelf">
      <rect x="0" y="140" width="240" height="20" className="fill-brand-green/25" />
      <rect x="22" y="14" width="66" height="126" rx="11" className="fill-forest" />
      <rect x="28" y="24" width="54" height="106" rx="5" className="fill-cream" />
      {["rice 5kg ₹60", "dal 1kg ₹120", "atta 5kg ₹245"].map((t, i) => (
        <text key={t} x="34" y={40 + i * 13} className="cb-step fill-forest" fontSize="7" fontWeight="700" style={{ animationDelay: `${i * 0.6}s` }}>
          {t}
        </text>
      ))}
      <circle cx="55" cy="104" r="12" className="cb-ring fill-none stroke-brand-orange" strokeWidth="2" />
      <circle cx="55" cy="104" r="12" className="cb-ring fill-none stroke-brand-orange" strokeWidth="2" style={{ animationDelay: "0.9s" }} />
      <circle cx="55" cy="104" r="12" className="fill-brand-orange" />
      <rect x="52" y="96" width="6" height="11" rx="3" className="fill-cream" />
      <path d="M48.5 104 a6.5 6.5 0 0 0 13 0 M55 110.5 v3" className="stroke-cream fill-none" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M94 76 C108 62 116 62 128 72" className="cb-dash stroke-brand-orange fill-none" strokeWidth="2.5" strokeDasharray="6 6" strokeLinecap="round" />
      <path d="M124 64 l6 9 l-10 2" className="stroke-brand-orange fill-none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <g className="cb-float">
        <rect x="98" y="34" width="26" height="16" rx="8" className="fill-brand-lime stroke-forest" strokeWidth="1.5" />
        <text x="111" y="45.5" textAnchor="middle" className="fill-forest" fontSize="9" fontWeight="800">
          AI
        </text>
      </g>
      <rect x="134" y="36" width="4" height="104" className="fill-forest" />
      <rect x="220" y="36" width="4" height="104" className="fill-forest" />
      <rect x="134" y="80" width="90" height="5" rx="1" className="fill-forest" />
      <rect x="134" y="120" width="90" height="5" rx="1" className="fill-forest" />
      {boxes.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx="2"
          className={`cb-pop ${b.c} stroke-forest`}
          strokeWidth="1.5"
          style={{ animationDelay: `${0.3 + i * 0.25}s` }}
        />
      ))}
    </Scene>
  );
}

export function GrowArt() {
  const bars = [26, 42, 58, 80];
  return (
    <Scene label="Sales chart growing, a new order notification and a stack of coins">
      <rect x="0" y="140" width="240" height="20" className="fill-brand-green/25" />
      <rect x="18" y="22" width="130" height="114" rx="8" className="fill-white stroke-forest" strokeWidth="2" />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={34 + i * 26}
          y={126 - h}
          width="16"
          height={h}
          rx="2"
          className={`cb-grow ${i === bars.length - 1 ? "fill-brand-lime" : "fill-brand-green"}`}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
      <line x1="28" y1="126" x2="138" y2="126" className="stroke-forest" strokeWidth="2" />
      <path d="M36 92 L62 80 L88 66 L126 34" className="cb-draw stroke-brand-orange fill-none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M114 34 L127 33 L124 46" className="stroke-brand-orange fill-none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <g className="cb-pop" style={{ animationDelay: "0.6s" }}>
        <rect x="152" y="24" width="82" height="42" rx="9" className="fill-forest" />
        <circle cx="166" cy="38" r="6" className="fill-brand-yellow" />
        <text x="176" y="41" className="fill-cream" fontSize="8" fontWeight="800">
          New order!
        </text>
        <text x="160" y="58" className="fill-brand-lime" fontSize="9" fontWeight="800">
          ₹240 · 3 items
        </text>
      </g>
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={i} cx="194" cy={130 - i * 8} rx="18" ry="6" className="fill-brand-yellow stroke-forest" strokeWidth="1.5" />
      ))}
      <g className="cb-drop" style={{ animationDuration: "2.4s" }}>
        <ellipse cx="194" cy="92" rx="18" ry="6" className="fill-brand-yellow stroke-forest" strokeWidth="1.5" />
      </g>
      <Sparkle x={222} y={84} delay={0.3} />
    </Scene>
  );
}

/* ---------- Features: phone searching "doodh" ---------- */

export function SearchPhoneArt() {
  const letters = "doodh".split("");
  const results = [
    { name: "Toned Milk", sub: "Amul · 500 ml", price: "₹28", c: "fill-brand-sky" },
    { name: "Cow Milk", sub: "Mother Dairy · 1 L", price: "₹68", c: "fill-brand-yellow" },
    { name: "Buffalo Milk", sub: "Local dairy · 1 L", price: "₹70", c: "fill-brand-peach" },
  ];
  return (
    <svg viewBox="0 0 220 380" role="img" aria-label='Phone searching "doodh" and finding milk from nearby shops' className="h-auto w-full">
      <ellipse cx="110" cy="368" rx="70" ry="8" className="fill-forest/15" />
      <g className="cb-float">
        <rect x="20" y="8" width="180" height="350" rx="28" className="fill-forest" />
        <rect x="30" y="22" width="160" height="322" rx="18" className="fill-cream" />
        <rect x="88" y="28" width="44" height="6" rx="3" className="fill-forest" />
        <text x="44" y="60" className="fill-forest" fontSize="14" fontWeight="800">
          Close<tspan className="fill-brand-green">By</tspan>
        </text>
        <rect x="42" y="74" width="136" height="30" rx="15" className="fill-white stroke-forest" strokeWidth="1.5" />
        <circle cx="60" cy="88" r="5" className="fill-none stroke-forest" strokeWidth="2" />
        <line x1="64" y1="92" x2="68" y2="96" className="stroke-forest" strokeWidth="2" strokeLinecap="round" />
        {letters.map((ch, i) => (
          <text key={i} x={76 + i * 8.5} y="93" className="cb-type fill-forest" fontSize="13" fontWeight="700" style={{ animationDelay: `${i * 0.15}s` }}>
            {ch}
          </text>
        ))}
        <rect x="120" y="81" width="1.8" height="15" className="cb-blink fill-brand-green" />
        <g className="cb-result" style={{ animationDelay: "0s" }}>
          <rect x="42" y="114" width="94" height="18" rx="9" className="fill-brand-lime" />
          <text x="50" y="126" className="fill-forest" fontSize="8.5" fontWeight="800">
            doodh = milk ✓
          </text>
        </g>
        {results.map((r, i) => (
          <g key={r.name} className="cb-result" style={{ animationDelay: `${0.15 * (i + 1)}s` }}>
            <rect x="42" y={142 + i * 52} width="136" height="44" rx="10" className="fill-white stroke-forest/20" strokeWidth="1" />
            <rect x="50" y={150 + i * 52} width="28" height="28" rx="6" className={r.c} />
            <text x="86" y={162 + i * 52} className="fill-forest" fontSize="9" fontWeight="800">
              {r.name}
            </text>
            <text x="86" y={174 + i * 52} className="fill-forest/60" fontSize="7.5">
              {r.sub}
            </text>
            <text x="170" y={162 + i * 52} textAnchor="end" className="fill-brand-green" fontSize="9" fontWeight="800">
              {r.price}
            </text>
          </g>
        ))}
        <g className="cb-result" style={{ animationDelay: "0.6s" }}>
          <rect x="42" y="302" width="136" height="28" rx="14" className="fill-brand-green" />
          <text x="110" y="320" textAnchor="middle" className="fill-cream" fontSize="9.5" fontWeight="800">
            3 shops near you
          </text>
        </g>
      </g>
      <Sparkle x={12} y={120} />
      <Sparkle x={208} y={70} delay={0.8} className="fill-brand-lime" />
      <Sparkle x={206} y={250} delay={1.4} />
    </svg>
  );
}
