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
const FALLBACK_MODEL = 'openai/gpt-oss-120b';
const CONTENT_MODELS = [PRIMARY_MODEL, FALLBACK_MODEL];
const TAVILY_KEY = process.env.TAVILY_API_KEY;
const MAX_TAVILY_CALLS = 4;
const MIN_WORD_COUNT = 1000;

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

function isRateLimitError(err) {
  return err?.status === 429
    || err?.code === 'rate_limit_exceeded'
    || err?.error?.code === 'rate_limit_exceeded'
    || /rate limit/i.test(err?.message || '');
}

async function createChatCompletionWithFallback(payload, purpose) {
  let lastError = null;

  for (const model of CONTENT_MODELS) {
    try {
      if (model !== PRIMARY_MODEL) {
        const fromModel = lastError?.model || PRIMARY_MODEL;
        console.warn(`[Blog Engine] ${purpose}: primary model hit a rate limit, falling back from ${fromModel} to ${model}`);
      }
      return await groq.chat.completions.create({ ...payload, model });
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err)) throw err;
    }
  }

  throw lastError;
}

async function generateValidContent(brand, pastSlugs, internalLinks, brandConfig) {
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const contentResult = await runContentAgent(brand, pastSlugs, internalLinks);
    contentResult.content = stripGeneratedArtifacts(contentResult.content);

    const wordCount = countWords(contentResult.content);
    const title = extractTitle(contentResult.content, brandConfig);
    const errors = [];

    if (wordCount < MIN_WORD_COUNT) errors.push(`too short (${wordCount} words)`);
    if (isGenericTitle(title)) errors.push(`generic title "${title}"`);
    if (hasGeneratedArtifacts(contentResult.content)) errors.push('contains leaked tool/scaffold text');

    if (!errors.length) {
      return { contentResult, title, wordCount };
    }

    lastError = errors.join(', ');
    console.warn(`[Blog Engine] Content validation failed on attempt ${attempt}: ${lastError}`);
  }

  throw new Error(`Generated blog failed validation after 2 attempts: ${lastError}`);
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
            content: { type: 'string', description: 'The complete publishable blog body in Markdown. Start with one H1. Do not include YAML front matter, tool calls, research notes, or visual brief JSON.' },
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
You MUST use these tools to perform research and submit your work. Use the following EXACT syntax for tool calls:
- \`tavily_search({"query": "..."})\`: To search the web.
- \`finish_blog({"content": "...", "visual_brief": {...}})\`: To submit your final blog.

Example: \`tavily_search({"query": "latest legal trends in India 2026"})\`

## INSTRUCTIONS
1. Start by searching for recent, trending news in the ${brandConfig.name} topic domain.
2. Pick the most timely, high-SEO-value topic from your research.
3. Continue researching to gather citations, data, and examples.
4. Write the full 1000-2500 word blog following ALL rules in the Blog Skill above.
5. When done, call finish_blog() with the complete markdown body + visual brief.

OUTPUT OVERRIDES:
- content MUST start with exactly one H1: "# Specific, SEO-friendly title".
- Do NOT include YAML front matter; the app assembles it.
- Do NOT include "OPENING HOOK", "PROBLEM FRAMING", "CORE BODY", "FAQ SECTION", "CONCLUSION", or similar planning labels.
- Do NOT include Visual Brief JSON inside the content. Put visual_brief only in the finish_blog argument.
- Do NOT include tool calls, function tags, research notes, or "Next, I will search..." in the final content.
- The title must be specific to the selected topic, never "${brandConfig.name} Insights" or generic "Insights".

IMPORTANT: Wrap your tool calls in backticks and use valid JSON for arguments.`;

  const messages = [
    { role: 'user', content: `Research and write today's blog for ${brandConfig.name}. Start by searching for what's trending.` }
  ];

  console.log(`[Content Agent] Starting agentic run for ${brandConfig.name}...`);

  // Agentic loop
  while (!blogResult) {
    const response = await createChatCompletionWithFallback({
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      // tools, // REMOVED: Using manual parsing for better stability on Groq
      // tool_choice: 'auto',
      max_tokens: 4000,
      temperature: 0.7,
    }, 'Content generation');

    const msg = response.choices[0].message;
    messages.push(msg);

    // Fallback: Check for manual tool calls in text
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const match = msg.content?.match(/(\w+)\(([\s\S]*?)\)/);
      if (match && (match[1] === 'tavily_search' || match[1] === 'finish_blog')) {
        const funcName = match[1];
        let argsStr = match[2].trim();
        // Clean up markdown/backticks if model wrapped them
        argsStr = argsStr.replace(/^`|`$/g, '');
        
        try {
          // If it's just a string like "query", wrap it in JSON
          if (funcName === 'tavily_search' && !argsStr.startsWith('{')) {
             argsStr = JSON.stringify({ query: argsStr });
          }
          
          msg.tool_calls = [{
            id: `call_${Date.now()}`,
            type: 'function',
            function: { name: funcName, arguments: argsStr }
          }];
        } catch (e) {
          console.error('[Content Agent] Failed to parse manual tool call:', argsStr);
        }
      }
      
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const leakedToolText = /<function=|\b(?:tavily_search|finish_blog)\s*\(|Next,\s+I\s+will\s+search/i.test(msg.content || '');
        if (!leakedToolText && countWords(msg.content) >= MIN_WORD_COUNT) {
           console.warn('[Content Agent] No tool call found in long message — assuming completion.');
           blogResult = { content: stripGeneratedArtifacts(msg.content), visual_brief: { archetype_hint: 'B', kicker: 'Insights', visual_brief: 'Topic-specific editorial', dominant_mood: 'editorial' } };
           break;
        }
        // Otherwise, keep going or push a nudge
        messages.push({ role: 'user', content: 'Please proceed with a tool call (tavily_search or finish_blog) to continue.' });
        continue;
      }
    }

    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments);

      if (call.function.name === 'tavily_search') {
        if (tavilyCallCount >= MAX_TAVILY_CALLS) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: `BUDGET EXHAUSTED: You have used all ${MAX_TAVILY_CALLS} Tavily calls. You must now write the blog and call finish_blog().` });
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
        args.content = stripGeneratedArtifacts(args.content);
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
  console.log(`\n[Blog Engine] === Starting generation for ${brandConfig.name} ===`);

  const pastSlugs = await getPastSlugs(brand, 20);
  const internalLinks = await getInternalLinks(brand, 8);

  // Step 1: Content Agent (fully agentic)
  const { contentResult, title: rawTitle, wordCount } = await generateValidContent(brand, pastSlugs, internalLinks, brandConfig);

  // Step 2: 2-minute cooldown
  console.log('[Blog Engine] ⏱ Cooldown: 120 seconds...');
  await new Promise(r => setTimeout(r, 120_000));

  // Step 3: Extract title from content
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
