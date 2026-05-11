import fs from 'node:fs';
import path from 'node:path';
import { assembleMarkdown } from './markdownAssembler.js';
import { markPublished } from './db/blogDb.js';
import { addPublishedLink } from './db/linksDb.js';

const DEPLOY_PATHS = {
  saraf: process.env.SARAF_BLOG_PATH || '/home/sanskarsaraf.in/public_html/blog/posts',
  casemate: process.env.CASEMATE_BLOG_PATH || '/home/casemate.co.in/public_html/blog/posts',
};

export async function deployBlog(draft) {
  const deployDir = DEPLOY_PATHS[draft.brand];
  if (!deployDir) throw new Error(`No deploy path for brand: ${draft.brand}`);

  // Ensure directory exists
  fs.mkdirSync(deployDir, { recursive: true });

  const filename = `${draft.slug}.md`;
  const targetPath = path.join(deployDir, filename);
  const markdown = assembleMarkdown(draft);

  fs.writeFileSync(targetPath, markdown, 'utf8');
  console.log(`[Deployer] ✅ Published: ${targetPath}`);

  // Update MongoDB status
  await markPublished(draft.id);

  // Add to internal links index
  await addPublishedLink({
    brand: draft.brand,
    slug: draft.slug,
    title: draft.title,
    url: `${draft.frontMatter.canonical}`,
  });

  console.log(`[Deployer] Internal links index updated for ${draft.brand}`);
  return targetPath;
}
