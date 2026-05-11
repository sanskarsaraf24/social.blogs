// 4 Supreme Blog Header Archetypes — 1200x630px
// All use Playfair Display + Inter, strict brand palette, no rounded corners

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

const BASE_STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; border-radius: 0 !important; -webkit-font-smoothing: antialiased; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
`;

// ── A: "The Authority" — Split layout, heavy brand block right ───────────────
export function archetypeA({ title, kicker, palette, logoUrl }) {
  return `<!DOCTYPE html><html><head>${FONTS}<style>
    ${BASE_STYLE}
    body { display: flex; background: ${palette.bg}; font-family: 'Inter', sans-serif; }
    .left { flex: 0 0 65%; padding: 70px 60px; display: flex; flex-direction: column; justify-content: center; gap: 24px; }
    .right { flex: 0 0 35%; background: ${palette.accent}; display: flex; align-items: center; justify-content: center; position: relative; }
    .kicker { font-size: 13px; text-transform: uppercase; letter-spacing: 4px; font-weight: 700; color: ${palette.secondary}; }
    .title { font-family: 'Playfair Display', serif; font-size: 52px; line-height: 1.1; color: ${palette.text}; font-weight: 900; max-width: 580px; }
    .rule { width: 48px; height: 3px; background: ${palette.secondary}; }
    .logo-wrap { position: absolute; bottom: 40px; right: 40px; opacity: 0.25; }
    .logo { width: 120px; height: auto; filter: brightness(10); }
    .watermark { font-family: 'Playfair Display', serif; font-size: 80px; color: ${palette.bg}; opacity: 0.06; position: absolute; transform: rotate(-90deg); white-space: nowrap; letter-spacing: 8px; font-weight: 900; }
    .brand-dot { width: 8px; height: 8px; background: ${palette.secondary}; display: inline-block; margin-right: 10px; }
  </style></head><body>
    <div class="left">
      <div class="kicker"><span class="brand-dot"></span>${kicker}</div>
      <div class="title">${title}</div>
      <div class="rule"></div>
    </div>
    <div class="right">
      <div class="watermark">INSIGHTS</div>
      <div class="logo-wrap"><img class="logo" src="${logoUrl}" alt="logo" onerror="this.style.display='none'"></div>
    </div>
  </body></html>`;
}

// ── B: "The Grid Master" — Centric, architectural grid texture ───────────────
export function archetypeB({ title, kicker, palette, logoUrl }) {
  return `<!DOCTYPE html><html><head>${FONTS}<style>
    ${BASE_STYLE}
    body { background: ${palette.bg}; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; font-family: 'Inter', sans-serif; }
    .grid-bg { position: absolute; inset: 0;
      background-image: linear-gradient(${palette.detail}22 1px, transparent 1px), linear-gradient(90deg, ${palette.detail}22 1px, transparent 1px);
      background-size: 48px 48px; }
    .content { position: relative; z-index: 2; text-align: center; padding: 60px; max-width: 900px; }
    .kicker { font-size: 12px; text-transform: uppercase; letter-spacing: 5px; font-weight: 700; color: ${palette.secondary}; margin-bottom: 20px; }
    .rule { width: 60px; height: 2px; background: ${palette.accent}; margin: 0 auto 28px; }
    .title { font-family: 'Playfair Display', serif; font-size: 54px; line-height: 1.1; color: ${palette.text}; font-weight: 900; }
    .logo-bar { position: absolute; bottom: 40px; display: flex; align-items: center; gap: 16px; }
    .logo { height: 36px; width: auto; opacity: 0.7; }
    .brand-name { font-size: 11px; text-transform: uppercase; letter-spacing: 4px; color: ${palette.detail}; font-weight: 600; }
  </style></head><body>
    <div class="grid-bg"></div>
    <div class="content">
      <div class="kicker">${kicker}</div>
      <div class="rule"></div>
      <div class="title">${title}</div>
    </div>
    <div class="logo-bar">
      <img class="logo" src="${logoUrl}" alt="logo" onerror="this.style.display='none'">
      <span class="brand-name">Insights</span>
    </div>
  </body></html>`;
}

// ── C: "The Editorial" — Vertical rail, editorial whitespace ─────────────────
export function archetypeC({ title, kicker, palette, logoUrl }) {
  return `<!DOCTYPE html><html><head>${FONTS}<style>
    ${BASE_STYLE}
    body { background: ${palette.bg}; display: flex; font-family: 'Inter', sans-serif; }
    .rail { width: 8px; background: ${palette.secondary}; flex-shrink: 0; }
    .main { flex: 1; padding: 70px 70px 60px 64px; display: flex; flex-direction: column; justify-content: space-between; }
    .top { display: flex; flex-direction: column; gap: 20px; max-width: 880px; }
    .kicker { font-size: 12px; text-transform: uppercase; letter-spacing: 5px; font-weight: 700; color: ${palette.detail}; }
    .title { font-family: 'Playfair Display', serif; font-size: 58px; line-height: 1.06; color: ${palette.text}; font-weight: 900; }
    .accent-rule { width: 80px; height: 4px; background: ${palette.accent}; }
    .bottom { display: flex; justify-content: space-between; align-items: flex-end; }
    .logo { height: 40px; width: auto; opacity: 0.8; }
    .date { font-size: 12px; color: ${palette.detail}; letter-spacing: 2px; text-transform: uppercase; }
  </style></head><body>
    <div class="rail"></div>
    <div class="main">
      <div class="top">
        <div class="kicker">${kicker}</div>
        <div class="title">${title}</div>
        <div class="accent-rule"></div>
      </div>
      <div class="bottom">
        <img class="logo" src="${logoUrl}" alt="logo" onerror="this.style.display='none'">
        <span class="date">${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
      </div>
    </div>
  </body></html>`;
}

// ── D: "The Comparison" — Geometric diagonal split ───────────────────────────
export function archetypeD({ title, kicker, palette, logoUrl }) {
  return `<!DOCTYPE html><html><head>${FONTS}<style>
    ${BASE_STYLE}
    body { background: ${palette.bg}; position: relative; overflow: hidden; font-family: 'Inter', sans-serif; }
    .panel-right { position: absolute; right: 0; top: 0; width: 42%; height: 100%; background: ${palette.accent}; clip-path: polygon(15% 0, 100% 0, 100% 100%, 0% 100%); }
    .content { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 70px 64px; gap: 24px; max-width: 780px; z-index: 2; }
    .kicker { font-size: 12px; text-transform: uppercase; letter-spacing: 5px; font-weight: 700; color: ${palette.secondary}; }
    .title { font-family: 'Playfair Display', serif; font-size: 54px; line-height: 1.1; color: ${palette.text}; font-weight: 900; }
    .rule { width: 56px; height: 3px; background: ${palette.secondary}; }
    .logo-corner { position: absolute; bottom: 40px; right: 50px; z-index: 3; }
    .logo { height: 44px; width: auto; filter: brightness(10); opacity: 0.5; }
  </style></head><body>
    <div class="panel-right"></div>
    <div class="content">
      <div class="kicker">${kicker}</div>
      <div class="title">${title}</div>
      <div class="rule"></div>
    </div>
    <div class="logo-corner">
      <img class="logo" src="${logoUrl}" alt="logo" onerror="this.style.display='none'">
    </div>
  </body></html>`;
}
