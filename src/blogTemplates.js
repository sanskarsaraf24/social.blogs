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
    .left { flex: 0 0 72%; padding: 56px 58px; display: flex; flex-direction: column; justify-content: center; gap: 24px; }
    .right { flex: 0 0 28%; background: ${palette.accent}; display: flex; align-items: center; justify-content: center; position: relative; }
    .kicker { font-size: 18px; text-transform: uppercase; letter-spacing: 4px; font-weight: 800; color: ${palette.secondary}; }
    .title { font-family: 'Playfair Display', serif; font-size: 72px; line-height: 0.98; color: ${palette.text}; font-weight: 900; max-width: 760px; letter-spacing: 0; }
    .rule { width: 72px; height: 5px; background: ${palette.secondary}; }
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
    .content { position: relative; z-index: 2; text-align: center; padding: 40px 64px 64px; max-width: 1080px; }
    .kicker { font-size: 18px; text-transform: uppercase; letter-spacing: 5px; font-weight: 800; color: ${palette.secondary}; margin-bottom: 18px; }
    .rule { width: 84px; height: 5px; background: ${palette.accent}; margin: 0 auto 30px; }
    .title { font-family: 'Playfair Display', serif; font-size: 82px; line-height: 0.96; color: ${palette.text}; font-weight: 900; letter-spacing: 0; }
    .logo-bar { position: absolute; bottom: 34px; display: flex; align-items: center; gap: 16px; }
    .logo { height: 44px; width: auto; opacity: 0.75; }
    .brand-name { font-size: 15px; text-transform: uppercase; letter-spacing: 4px; color: ${palette.detail}; font-weight: 800; }
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
    .main { flex: 1; padding: 58px 64px 52px 60px; display: flex; flex-direction: column; justify-content: space-between; }
    .top { display: flex; flex-direction: column; gap: 20px; max-width: 880px; }
    .kicker { font-size: 18px; text-transform: uppercase; letter-spacing: 5px; font-weight: 800; color: ${palette.detail}; }
    .title { font-family: 'Playfair Display', serif; font-size: 78px; line-height: 0.96; color: ${palette.text}; font-weight: 900; letter-spacing: 0; }
    .accent-rule { width: 96px; height: 5px; background: ${palette.accent}; }
    .bottom { display: flex; justify-content: space-between; align-items: flex-end; }
    .logo { height: 40px; width: auto; opacity: 0.8; }
    .date { font-size: 16px; color: ${palette.detail}; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }
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
    .content { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 58px 64px; gap: 24px; max-width: 860px; z-index: 2; }
    .kicker { font-size: 18px; text-transform: uppercase; letter-spacing: 5px; font-weight: 800; color: ${palette.secondary}; }
    .title { font-family: 'Playfair Display', serif; font-size: 76px; line-height: 0.98; color: ${palette.text}; font-weight: 900; letter-spacing: 0; }
    .rule { width: 76px; height: 5px; background: ${palette.secondary}; }
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
// ── E: "The Hero Visual" — Full-bleed background image with text overlay ──────
export function archetypeE({ title, kicker, palette, logoUrl, bgImage }) {
  const bg = bgImage || 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=1200&auto=format&fit=crop';
  return `<!DOCTYPE html><html><head>${FONTS}<style>
    ${BASE_STYLE}
    body { background: #000; display: flex; align-items: center; justify-content: center; position: relative; font-family: 'Inter', sans-serif; }
    .bg-image { position: absolute; inset: 0; background-image: url('${bg}'); background-size: cover; background-position: center; filter: brightness(0.6); }
    .overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.8) 100%); }
    .content { position: relative; z-index: 10; text-align: center; padding: 48px 72px; max-width: 1080px; display: flex; flex-direction: column; align-items: center; gap: 28px; }
    .kicker { font-size: 19px; text-transform: uppercase; letter-spacing: 6px; font-weight: 800; color: ${palette.secondary}; padding: 10px 18px; border: 2px solid ${palette.secondary}; background: rgba(0,0,0,0.35); }
    .title { font-family: 'Playfair Display', serif; font-size: 80px; line-height: 0.98; color: #FFFFFF; font-weight: 900; text-shadow: 0 5px 18px rgba(0,0,0,0.72); letter-spacing: 0; }
    .rule { width: 118px; height: 6px; background: ${palette.accent}; }
    .logo-wrap { position: absolute; bottom: 40px; right: 40px; z-index: 20; }
    .logo { height: 50px; width: auto; filter: brightness(10); }
  </style></head><body>
    <div class="bg-image"></div>
    <div class="overlay"></div>
    <div class="content">
      <div class="kicker">${kicker}</div>
      <div class="title">${title}</div>
      <div class="rule"></div>
    </div>
    <div class="logo-wrap">
      <img class="logo" src="${logoUrl}" alt="logo" onerror="this.style.display='none'">
    </div>
  </body></html>`;
}
