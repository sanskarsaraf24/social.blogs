import 'dotenv/config';
import Groq from 'groq-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLastPublishedBrand, getPastSlugs, saveDraft } from './db/blogDb.js';
import { getInternalLinks } from './db/linksDb.js';
import { renderBlogHeader } from './blogRenderer.js';
import { extractSeoFields } from './seoExtractor.js';
import { assembleMarkdown } from './markdownAssembler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const TAVILY_KEY = process.env.TAVILY_API_KEY;
const MAX_TAVILY_CALLS = 4;
const MIN_WORD_COUNT = 1000;
const GENERATION_GAP_MS = 60_000;
const MAX_PAST_SLUGS = 4;
const MAX_INTERNAL_LINKS = 4;

let activeGeneration = null;

// ── Brand config ──────────────────────────────────────────────────────────────
const BRANDS = {
  saraf: {
    name: 'Saraf & Co',
    domain: 'saraf',
    canonicalBase: 'https://sanskarsaraf.in/blog',
    author: 'Sanskar Saraf',
    palette: { bg: '#F5F1EA', accent: '#4B1E2F', text: '#1F1F1F', secondary: '#C9A24D', detail: '#6B6B6B' },
    logoUrl: '/uploads/logos/saraf-logo.png',
  },
  casemate: {
    name: 'Casemate',
    domain: 'casemate',
    canonicalBase: 'https://casemate.co.in/blog',
    author: 'CaseMate Team',
    palette: { bg: '#FDFCF7', accent: '#0F172A', text: '#0F172A', secondary: '#C5A059', detail: '#94A3B8' },
    logoUrl: '/uploads/logos/casemate-logo.png',
  },
};

// ── Tavily search (called by the agent autonomously) ──────────────────────────
async function tavilySearch(query) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_KEY,
      query,
      search_depth: 'advanced',
      max_results: 5,
      include_answer: true,
    }),
  });
  const data = await res.json();
  // Return clean, distilled text for the agent
  const answer = data.answer ? `SUMMARY: ${data.answer}\n\n` : '';
  const results = (data.results || [])
    .map(r => `SOURCE: ${r.title}\n${r.content}`)
    .join('\n\n---\n\n');
  return answer + results;
}

// ── Load skills from disk ─────────────────────────────────────────────────────
function loadSkill(filename) {
  const p = path.join(__dirname, '..', 'skills', filename);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isGenerationRunning() {
  return Boolean(activeGeneration);
}

function beginGeneration(brand, trigger = 'manual') {
  if (activeGeneration) {
    return { ok: false, activeGeneration };
  }
  activeGeneration = {
    brand,
    trigger,
    startedAt: new Date().toISOString(),
  };
  return { ok: true };
}

function endGeneration() {
  activeGeneration = null;
}

function compactList(items = [], maxItems = 4, maxLineLength = 140) {
  return String(items || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map(line => line.slice(0, maxLineLength))
    .join('\n');
}

function brandBrief(brandConfig) {
  if (brandConfig.domain === 'saraf') {
    return [
      'Brand: Saraf & Co.',
      'Tone: authoritative, practical, precise, and calm.',
      'Audience: Indian business leaders and legal decision-makers.',
      'Focus: corporate law, commercial disputes, regulatory changes, arbitration, and compliance.',
      'Avoid generic intros, section labels, and filler language.'
    ].join(' ');
  }

  return [
    'Brand: Casemate.',
    'Tone: institutional, source-backed, and clear.',
    'Audience: advocates, in-house legal teams, and legal operators.',
    'Focus: legal-tech workflows, AI for legal work, court data, research, and practice efficiency.',
    'Avoid generic intros, section labels, and filler language.'
  ].join(' ');
}

function stripGeneratedArtifacts(content = '') {
  let cleaned = String(content).replace(/\r\n/g, '\n').trim();
  cleaned = cleaned.replace(/^---[\s\S]*?\n---\s*/m, '');
  cleaned = cleaned.replace(/<function=\w+>\s*[\s\S]*?<\/function>/g, '');
  cleaned = cleaned.replace(/`?\b(?:tavily_search|finish_blog)\s*\([\s\S]*?\)`?/g, '');
  cleaned = cleaned.replace(/^#{1,6}\s*(OPENING HOOK|PROBLEM FRAMING|CORE BODY|REAL-WORLD EXAMPLE|FAQ SECTION|CONCLUSION)\s*$/gim, '');
  cleaned = cleaned.replace(/\n{2,}#{1,6}\s*Visual Brief[\s\S]*$/i, '');
  cleaned = cleaned.replace(/\n{2,}```json\s*\{[\s\S]*?archetype_hint[\s\S]*?```\s*$/i, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

function countWords(content = '') {
  return stripGeneratedArtifacts(content)
    .replace(/^#{1,6}\s+/gm, '')
    .split(/\s+/)
    .filter(Boolean).length;
}

function extractTitle(content = '', brandConfig) {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : `${brandConfig.name} Insights`;
}

function isGenericTitle(title = '') {
  return /^(saraf\s*&?\s*co|case\s*mate|casemate)?\s*insights$/i.test(title.trim());
}

function hasGeneratedArtifacts(content = '') {
  return /<function=|\b(?:tavily_search|finish_blog)\s*\(|Next,\s+I\s+will\s+search|Visual Brief|OPENING HOOK|PROBLEM FRAMING|CORE BODY|FAQ SECTION/i.test(content);
}

function safeParseJson(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch (firstError) {
    const match = String(raw || '').match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    if (fallback !== null) return fallback;
    throw firstError;
  }
}

function buildContextSummary(pastSlugs, internalLinks) {
  const slugs = compactList(pastSlugs, MAX_PAST_SLUGS, 120);
  const links = compactList(internalLinks, MAX_INTERNAL_LINKS, 120);
  return {
    pastSlugs: slugs || 'None yet.',
    internalLinks: links || 'None yet.',
  };
}

function buildOutlinePrompt({ brandConfig, research, pastSlugs, internalLinks }) {
  const context = buildContextSummary(pastSlugs, internalLinks);
  return `You are writing a blog for ${brandConfig.name}.

Brand brief: ${brandBrief(brandConfig)}
Date: ${new Date().toISOString().split('T')[0]}
Canonical base: ${brandConfig.canonicalBase}

Past slugs:
${context.pastSlugs}

Internal links:
${context.internalLinks}

Research notes:
${research}

Return ONLY valid JSON with these keys:
{
  "title": "specific SEO-friendly title",
  "angle": "1 short sentence on the core angle",
  "target_word_count": 1200,
  "outline": ["section 1", "section 2", "section 3", "section 4", "section 5"],
  "visual_brief": {
    "visual_brief": "3 to 5 words",
    "archetype_hint": "A",
    "dominant_mood": "serious",
    "kicker": "short category label"
  }
}

Rules:
- Do not use generic titles like "${brandConfig.name} Insights".
- Do not include markdown.
- Do not include section labels like OPENING HOOK or PROBLEM FRAMING.`;
}

function buildWritingPrompt({ brandConfig, outline, research, pastSlugs, internalLinks }) {
  const context = buildContextSummary(pastSlugs, internalLinks);
  const sections = Array.isArray(outline?.outline) ? outline.outline.join('\n- ') : '';
  return `Write the final blog for ${brandConfig.name}.

Brand brief: ${brandBrief(brandConfig)}
Title: ${outline.title}
Angle: ${outline.angle}
Target length: ${outline.target_word_count || 1200} words

Research notes:
${research}

Outline:
- ${sections}

Past slugs to avoid:
${context.pastSlugs}

Internal links to weave in naturally where relevant:
${context.internalLinks}

Rules:
- Start with exactly one H1 using the title above.
- Write 1000-2500 words.
- Do not include YAML front matter.
- Do not include "OPENING HOOK", "PROBLEM FRAMING", "CORE BODY", "FAQ SECTION", "CONCLUSION", or any outline labels.
- Do not include visual brief JSON, tool notes, or research notes.
- Keep the language specific, practical, and publication-ready.`;
}

async function runOutlineAgent(brand, pastSlugs, internalLinks, brandConfig) {
  const queries = brand === 'saraf'
    ? [
        'recent Indian corporate law developments 2026',
        'commercial disputes arbitration regulatory compliance India 2026'
      ]
    : [
        'recent legal technology trends India 2026',
        'AI in legal research and workflow automation India 2026'
      ];

  const researchBlocks = [];
  for (const query of queries) {
    researchBlocks.push(await tavilySearch(query));
  }

  const outlinePrompt = buildOutlinePrompt({
    brandConfig,
    research: researchBlocks.map(block => block.slice(0, 1800)).join('\n\n---\n\n'),
    pastSlugs,
    internalLinks,
  });

  const completion = await groq.chat.completions.create({
    model: PRIMARY_MODEL,
    messages: [{ role: 'system', content: 'Return compact JSON only.' }, { role: 'user', content: outlinePrompt }],
    max_tokens: 900,
    temperature: 0.4,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0].message.content || '{}';
  return {
    outline: safeParseJson(raw, {
      title: `${brandConfig.name} Insights`,
      angle: 'Practical update',
      target_word_count: 1200,
      outline: ['Introduction', 'Key developments', 'Practical impact', 'What to watch', 'Conclusion'],
      visual_brief: { visual_brief: 'Editorial clarity', archetype_hint: 'B', dominant_mood: 'editorial', kicker: 'Insights' },
    }),
    research: researchBlocks.map(block => block.slice(0, 1800)).join('\n\n---\n\n'),
  };
}

async function runWritingAgent(brand, outline, research, pastSlugs, internalLinks, brandConfig) {
  const writingPrompt = buildWritingPrompt({
    brandConfig,
    outline,
    research: research.slice(0, 2400),
    pastSlugs,
    internalLinks,
  });

  const completion = await groq.chat.completions.create({
    model: PRIMARY_MODEL,
    messages: [{ role: 'system', content: 'Write the full blog in markdown only.' }, { role: 'user', content: writingPrompt }],
    max_tokens: 2400,
    temperature: 0.7,
  });

  return stripGeneratedArtifacts(completion.choices[0].message.content || '');
}

async function generateValidContent(brand, pastSlugs, internalLinks, brandConfig) {
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { outline, research } = await runOutlineAgent(brand, pastSlugs, internalLinks, brandConfig);
    await sleep(GENERATION_GAP_MS);
    const content = await runWritingAgent(brand, outline, research, pastSlugs, internalLinks, brandConfig);

    const wordCount = countWords(content);
    const title = outline.title || extractTitle(content, brandConfig);
    const errors = [];

    if (wordCount < MIN_WORD_COUNT) errors.push(`too short (${wordCount} words)`);
    if (isGenericTitle(title)) errors.push(`generic title "${title}"`);
    if (hasGeneratedArtifacts(content)) errors.push('contains leaked tool/scaffold text');

    if (!errors.length) {
      return {
        contentResult: { content, visual_brief: outline.visual_brief || { visual_brief: 'Editorial clarity', archetype_hint: 'B', dominant_mood: 'editorial', kicker: 'Insights' } },
        title,
        wordCount,
      };
    }

    lastError = errors.join(', ');
    console.warn(`[Blog Engine] Content validation failed on attempt ${attempt}: ${lastError}`);
  }

  throw new Error(`Generated blog failed validation after 2 attempts: ${lastError}`);
}

export async function runContentAgent(brand, pastSlugs, internalLinks) {
  const brandConfig = BRANDS[brand];
  const { outline, research } = await runOutlineAgent(brand, pastSlugs, internalLinks, brandConfig);
  await sleep(GENERATION_GAP_MS);
  const content = await runWritingAgent(brand, outline, research, pastSlugs, internalLinks, brandConfig);
  return {
    content: content,
    visual_brief: outline.visual_brief || { visual_brief: 'Editorial clarity', archetype_hint: 'B', dominant_mood: 'editorial', kicker: 'Insights' },
  };
}

// ── Image Agent ───────────────────────────────────────────────────────────────
export async function runImageAgent(title, visualBrief, brand) {
  const brandConfig = BRANDS[brand];
  const palette = brandConfig.palette;

  const prompt = `You are an Art Director for a premium legal/fintech brand.
Your goal is to create a highly relevant, cinematic header image for this blog post.

BLOG TITLE: "${title}"
VISUAL BRIEF: ${visualBrief.visual_brief}
DOMINANT MOOD: ${visualBrief.dominant_mood}
KICKER: ${visualBrief.kicker}
ARCHETYPE HINT: ${visualBrief.archetype_hint}

Select the best archetype (A/B/C/D/E) for this blog. Archetype E (Full-bleed AI Visual) is preferred for high-impact topics.
Return ONLY valid JSON with this structure:
{
  "archetype": "E",
  "kicker": "short category label",
  "accent_override": null | "#hexcolor",
  "image_keywords": "A highly detailed, cinematic, photorealistic description for an AI image generator. Describe a scene (e.g. 'A high-end Mumbai courtroom with warm sunset light hitting wooden panels') not just keywords."
}`;

  const response = await groq.chat.completions.create({
    model: PRIMARY_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  let decision = { archetype: visualBrief.archetype_hint || 'A', kicker: visualBrief.kicker || 'Insights', accent_override: null, image_keywords: 'business law premium' };
  try {
    decision = JSON.parse(response.choices[0].message.content);
  } catch { /* use default */ }

  console.log(`[Image Agent] Archetype: ${decision.archetype}, Kicker: "${decision.kicker}", Keywords: "${decision.image_keywords}"`);

  // Build background image URL for AI-generated visual (Archetype E)
  let bgImage = null;
  if (decision.archetype === 'E' || decision.image_keywords) {
    const prompt = encodeURIComponent(`Premium professional ${decision.image_keywords}, cinematic lighting, photorealistic, 8k, high contrast, clean composition, no text`);
    bgImage = `https://image.pollinations.ai/prompt/${prompt}?width=1200&height=630&nologo=true&seed=${Date.now()}`;
    console.log(`[Image Agent] AI Background: ${bgImage}`);
  }

  const imageUrl = await renderBlogHeader({
    archetype: decision.archetype,
    brand,
    title,
    kicker: decision.kicker,
    palette: { ...palette, accent: decision.accent_override || palette.accent },
    logoUrl: brandConfig.logoUrl,
    bgImage
  });

  return { archetype: decision.archetype, imageUrl };
}

// ── Main orchestrator ─────────────────────────────────────────────────────────
export async function runForBrand(brand) {
  const brandConfig = BRANDS[brand];
  const locked = beginGeneration(brand, 'manual');
  if (!locked.ok) {
    const active = locked.activeGeneration;
    throw new Error(`Generation already in progress for ${active.brand} (started ${active.startedAt})`);
  }
  console.log(`\n[Blog Engine] === Starting generation for ${brandConfig.name} ===`);

  const pastSlugs = await getPastSlugs(brand, 20);
  const internalLinks = await getInternalLinks(brand, 8);

  try {
    const { contentResult, title: rawTitle, wordCount } = await generateValidContent(brand, pastSlugs, internalLinks, brandConfig);
    const imageResult = await runImageAgent(rawTitle, contentResult.visual_brief, brand);
    const seo = extractSeoFields(contentResult.content, rawTitle, brand, brandConfig.canonicalBase);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 0, 0, 0);

    const draft = {
      id: seo.slug,
      brand,
      title: rawTitle,
      slug: seo.slug,
      content: contentResult.content,
      visualBrief: contentResult.visual_brief,
      frontMatter: {
        title: rawTitle,
        date: tomorrow.toISOString().split('T')[0],
        author: brandConfig.author,
        description: seo.metaDescription,
        tags: seo.tags,
        image: imageResult.imageUrl,
        og_image: imageResult.imageUrl,
        canonical: seo.canonicalUrl,
        reading_time: seo.readingTime,
        draft: false,
        schema_type: 'Article',
      },
      status: 'generated',
      imageUrl: imageResult.imageUrl,
      archetype: imageResult.archetype,
      seoScore: { wordCount: seo.wordCount, readingTime: seo.readingTime },
      autoPublish: true,
      scheduledAt: tomorrow,
      createdAt: new Date(),
    };

    await saveDraft(draft);
    console.log(`[Blog Engine] ✅ Draft saved: "${rawTitle}" — scheduled for ${draft.frontMatter.date}`);
    return draft;
  } finally {
    endGeneration();
  }
}

export async function runBlogEngine() {
  if (isGenerationRunning()) {
    const active = activeGeneration;
    console.log(`[Blog Engine] Generation already running for ${active.brand}; skipping scheduled run.`);
    return null;
  }
  const lastBrand = await getLastPublishedBrand();
  // Alternate: if last was saraf → casemate, if last was casemate → saraf, default to casemate
  const brand = lastBrand === 'saraf' ? 'casemate' : 'saraf';
  console.log(`[Blog Engine] Brand rotation: last was "${lastBrand || 'none'}" → generating for "${brand}"`);
  return runForBrand(brand);
}

export { isGenerationRunning };

// ── CLI entry point ───────────────────────────────────────────────────────────
if (process.argv.includes('--run-now')) {
  const brand = process.argv.find(a => a.startsWith('--brand='))?.split('=')[1];
  import('./db/blogDb.js').then(({ connectDb }) => connectDb()).then(() => {
    return brand ? runForBrand(brand) : runBlogEngine();
  }).then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}

if (process.argv.includes('--dry-run')) {
  console.log('[Dry Run] Blog engine configuration validated.');
  console.log('  GROQ_API_KEY:', process.env.GROQ_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('  TAVILY_API_KEY:', process.env.TAVILY_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('  MONGODB_URI:', process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
  console.log('  SARAF_BLOG_PATH:', process.env.SARAF_BLOG_PATH || '❌ Missing');
  console.log('  CASEMATE_BLOG_PATH:', process.env.CASEMATE_BLOG_PATH || '❌ Missing');
  process.exit(0);
}
