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
const MODEL = 'llama-3.3-70b-versatile';
const TAVILY_KEY = process.env.TAVILY_API_KEY;
const MAX_TAVILY_CALLS = 6;

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

// ── Content Agent (fully autonomous) ─────────────────────────────────────────
export async function runContentAgent(brand, pastSlugs, internalLinks) {
  const brandConfig = BRANDS[brand];
  const blogSkill = loadSkill('BlogWriterSkill.md');
  const brandProfile = loadSkill(`${brand === 'saraf' ? 'Saraf' : 'Casemate'}BrandProfile.md`);

  let tavilyCallCount = 0;
  let blogResult = null;

  const tools = [
    {
      type: 'function',
      function: {
        name: 'tavily_search',
        description: `Search the web for real-time information. You may call this up to ${MAX_TAVILY_CALLS} times. Use it to find trending topics, court judgments, statistics, and expert commentary. Budget remaining will be shown after each call.`,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Specific, targeted search query.' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'finish_blog',
        description: 'Submit the completed blog when you have finished writing it. Call this ONLY once, when the full blog is ready.',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The complete blog in Markdown format, including YAML front matter at the top.' },
            visual_brief: {
              type: 'object',
              description: 'Instructions for the Image Agent.',
              properties: {
                visual_brief: { type: 'string', description: '3-word vibe (e.g. "Architectural authority quiet")' },
                archetype_hint: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                dominant_mood: { type: 'string', enum: ['serious', 'technical', 'editorial', 'comparative'] },
                kicker: { type: 'string', description: 'Category label (e.g. "Commercial Law")' },
              },
              required: ['visual_brief', 'archetype_hint', 'dominant_mood', 'kicker'],
            },
          },
          required: ['content', 'visual_brief'],
        },
      },
    },
  ];

  const systemPrompt = `${blogSkill}

---

## BRAND PROFILE
${brandProfile}

## CONTEXT
- Brand: ${brandConfig.name}
- Today's Date: ${new Date().toISOString().split('T')[0]}
- Author: ${brandConfig.author}
- Canonical Base URL: ${brandConfig.canonicalBase}

## PAST PUBLISHED SLUGS (DO NOT REPEAT THESE TOPICS)
${pastSlugs || 'None yet — this is the first blog.'}

## AVAILABLE INTERNAL LINKS (use 2-3 of these in your blog body where relevant)
${internalLinks || 'None yet — first blog, skip internal links.'}

## YOUR TOOLS
- \`tavily_search(query)\`: Search the web. Budget: ${MAX_TAVILY_CALLS} calls max. You decide all queries.
- \`finish_blog(content, visual_brief)\`: Submit your completed blog. Call once when done.

## INSTRUCTIONS
1. Start by searching for recent, trending news in the ${brandConfig.name} topic domain.
2. Pick the most timely, high-SEO-value topic from your research.
3. Continue researching to gather citations, data, and examples.
4. Write the full 1800-2200 word blog following ALL rules in the Blog Skill above.
5. When done, call finish_blog() with the complete markdown + visual brief.`;

  const messages = [
    { role: 'user', content: `Research and write today's blog for ${brandConfig.name}. Start by searching for what's trending.` }
  ];

  console.log(`[Content Agent] Starting agentic run for ${brandConfig.name}...`);

  // Agentic loop
  while (!blogResult) {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools,
      tool_choice: 'auto',
      max_tokens: 4000,
      temperature: 0.7,
    });

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // Model finished without calling finish_blog — extract content from text
      console.warn('[Content Agent] No tool call — extracting from text response.');
      blogResult = { content: msg.content, visual_brief: { archetype_hint: 'A', kicker: 'Insights', visual_brief: 'Professional editorial clean', dominant_mood: 'serious' } };
      break;
    }

    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments);

      if (call.function.name === 'tavily_search') {
        if (tavilyCallCount >= MAX_TAVILY_CALLS) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: 'BUDGET EXHAUSTED: You have used all 6 Tavily calls. You must now write the blog and call finish_blog().' });
          continue;
        }
        tavilyCallCount++;
        console.log(`[Content Agent] Tavily call ${tavilyCallCount}/${MAX_TAVILY_CALLS}: "${args.query}"`);
        const result = await tavilySearch(args.query);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `${result}\n\n[Tavily calls remaining: ${MAX_TAVILY_CALLS - tavilyCallCount}]`,
        });

      } else if (call.function.name === 'finish_blog') {
        console.log('[Content Agent] Blog received via finish_blog()');
        blogResult = args;
      }
    }
  }

  return blogResult;
}

// ── Image Agent ───────────────────────────────────────────────────────────────
export async function runImageAgent(title, visualBrief, brand) {
  const brandConfig = BRANDS[brand];
  const palette = brandConfig.palette;

  const prompt = `You are an Art Director for a premium legal/fintech brand.

BLOG TITLE: "${title}"
VISUAL BRIEF: ${visualBrief.visual_brief}
DOMINANT MOOD: ${visualBrief.dominant_mood}
KICKER: ${visualBrief.kicker}
ARCHETYPE HINT: ${visualBrief.archetype_hint}

BRAND PALETTE:
- Background: ${palette.bg}
- Accent: ${palette.accent}
- Text: ${palette.text}
- Secondary: ${palette.secondary}
- Detail: ${palette.detail}

Select the best archetype (A/B/C/D) for this blog header image.
Return ONLY valid JSON with this exact structure:
{
  "archetype": "A" | "B" | "C" | "D",
  "kicker": "short category label",
  "accent_override": null | "#hexcolor"
}`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  let decision = { archetype: visualBrief.archetype_hint || 'A', kicker: visualBrief.kicker || 'Insights', accent_override: null };
  try {
    decision = JSON.parse(response.choices[0].message.content);
  } catch { /* use default */ }

  console.log(`[Image Agent] Archetype: ${decision.archetype}, Kicker: "${decision.kicker}"`);

  const imageUrl = await renderBlogHeader({
    archetype: decision.archetype,
    brand,
    title,
    kicker: decision.kicker,
    palette: { ...palette, accent: decision.accent_override || palette.accent },
    logoUrl: brandConfig.logoUrl,
  });

  return { archetype: decision.archetype, imageUrl };
}

// ── Main orchestrator ─────────────────────────────────────────────────────────
export async function runForBrand(brand) {
  const brandConfig = BRANDS[brand];
  console.log(`\n[Blog Engine] === Starting generation for ${brandConfig.name} ===`);

  const pastSlugs = await getPastSlugs(brand, 20);
  const internalLinks = await getInternalLinks(brand, 8);

  // Step 1: Content Agent (fully agentic)
  const contentResult = await runContentAgent(brand, pastSlugs, internalLinks);

  // Step 2: 2-minute cooldown
  console.log('[Blog Engine] ⏱ Cooldown: 120 seconds...');
  await new Promise(r => setTimeout(r, 120_000));

  // Step 3: Extract title from content
  const titleMatch = contentResult.content.match(/^#\s+(.+)$/m);
  const rawTitle = titleMatch ? titleMatch[1].trim() : `${brandConfig.name} Insights`;

  // Step 4: Image Agent
  const imageResult = await runImageAgent(rawTitle, contentResult.visual_brief, brand);

  // Step 5: SEO extraction
  const seo = extractSeoFields(contentResult.content, rawTitle, brand, brandConfig.canonicalBase);

  // Step 6: Assemble + save draft
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
}

export async function runBlogEngine() {
  const lastBrand = await getLastPublishedBrand();
  // Alternate: if last was saraf → casemate, if last was casemate → saraf, default to casemate
  const brand = lastBrand === 'saraf' ? 'casemate' : 'saraf';
  console.log(`[Blog Engine] Brand rotation: last was "${lastBrand || 'none'}" → generating for "${brand}"`);
  return runForBrand(brand);
}

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
