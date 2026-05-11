import matter from 'gray-matter';

function formatPublishDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function cleanFrontMatterValue(value = '') {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, "'")
    .trim();
}

function stringifyOneLineFrontMatter(frontMatter) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontMatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(cleanFrontMatterValue).join(', ')}]`);
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: "${cleanFrontMatterValue(value)}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

export function assembleMarkdown(draft) {
  const { frontMatter, content } = draft;

  // Strip existing front matter from content if present
  const { content: bodyOnly } = matter(content);

  // Author Bios
  const BIOS = {
    saraf: `---
**About the Author**: [Sanskar Saraf](https://sanskarsaraf.in) is a senior legal strategist specializing in commercial disputes and corporate law in India. With years of experience representing clients across High Courts and tribunals, his insights bridge the gap between complex statutes and practical business solutions.`,
    casemate: `---
**About the Author**: The [Casemate](https://casemate.co.in) team consists of legal technologists and practitioners dedicated to modernizing the Indian legal system. Through AI-driven insights and practice management tools, we empower advocates to achieve higher levels of efficiency and precision.`
  };

  // Ensure body starts with # Title for SEO and PHP-fallback parsing
  let finalBody = bodyOnly.trim();
  if (!finalBody.startsWith('# ')) {
    finalBody = `# ${frontMatter.title}\n\n${finalBody}`;
  }

  // Append Bio if not present
  const brand = frontMatter.canonical.includes('casemate') ? 'casemate' : 'saraf';
  if (!finalBody.includes('About the Author')) {
    finalBody = `${finalBody}\n\n${BIOS[brand]}`;
  }
  finalBody = finalBody.replace(/^#\s+.+\n+/, '');

  // Build Full Schema.org JSON-LD for Search Engines
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": frontMatter.title,
    "image": [frontMatter.image],
    "datePublished": frontMatter.date,
    "dateModified": new Date().toISOString().split('T')[0],
    "author": [{
      "@type": "Person",
      "name": frontMatter.author,
      "url": frontMatter.canonical.split('/blog')[0]
    }],
    "description": frontMatter.description,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": frontMatter.canonical
    }
  };

  // Build YAML front matter
  const fm = {
    title: frontMatter.title,
    date: frontMatter.date || formatPublishDate(),
    author: frontMatter.author,
    description: frontMatter.description,
    tags: frontMatter.tags,
    image: frontMatter.image,
    og_image: frontMatter.og_image,
    canonical: frontMatter.canonical,
    reading_time: frontMatter.reading_time,
    draft: false,
    schema_type: frontMatter.schema_type || 'Article',
    json_ld: JSON.stringify(schema)
  };

  return matter.stringify(finalBody, fm);
}
