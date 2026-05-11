// Pure-code SEO field extraction — no AI needed
function formatSlugDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function extractSeoFields(content, title, brand, canonicalBase) {
  // Strip front matter if present
  const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();

  // Word count
  const words = body.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const readingTime = Math.max(1, Math.round(wordCount / 200));

  // Meta description: first sentence of body (max 160 chars)
  const firstParagraph = body.replace(/^#.*$/m, '').trim().split('\n').find(l => l.trim() && !l.startsWith('#'));
  let metaDescription = (firstParagraph || title).replace(/\*\*|__|\[.*?\]\(.*?\)/g, '').trim();
  if (metaDescription.length > 155) metaDescription = metaDescription.slice(0, 152) + '...';

  // Tags: extract from H2 headings + title words
  const h2s = [...body.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].toLowerCase());
  const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const tagCandidates = [...new Set([...titleWords, ...h2s.slice(0, 3)])].slice(0, 5);
  const tags = tagCandidates.map(t => t.replace(/[^a-z0-9 ]/g, '').trim()).filter(Boolean);

  // Slug
  const slug = `${formatSlugDate()}-${title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)}`;

  const canonicalUrl = `${canonicalBase}/${slug}`;

  return { wordCount, readingTime, metaDescription, tags, slug, canonicalUrl };
}
