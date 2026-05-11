import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { archetypeA, archetypeB, archetypeC, archetypeD, archetypeE } from './blogTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '..', 'uploads', 'blog-headers');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const ARCHETYPES = { A: archetypeA, B: archetypeB, C: archetypeC, D: archetypeD, E: archetypeE };

export async function renderBlogHeader({ archetype = 'A', brand, title, kicker, palette, logoUrl, bgImage }) {
  const templateFn = ARCHETYPES[archetype] || archetypeA;
  const html = templateFn({ title, kicker, palette, logoUrl, brand, bgImage });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const slug = `blog-header-${Date.now()}`;
    const filename = `${slug}.png`;
    const outputPath = path.join(outputDir, filename);

    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 630 },
      fullPage: false,
    });

    const publicUrl = `${process.env.IMAGE_BASE_URL || 'https://social.minpay.in/blog/uploads/blog-headers'}/${filename}`;
    console.log(`[Renderer] ✅ Header image: ${publicUrl}`);
    return publicUrl;
  } finally {
    await browser.close();
  }
}
