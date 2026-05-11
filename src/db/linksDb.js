import { getDb } from './blogDb.js';

// Add a published blog URL to the internal links index
export async function addPublishedLink({ brand, slug, title, url }) {
  await getDb().collection('internal_links').updateOne({
    brand,
    slug,
  }, {
    $set: {
      brand,
      slug,
      title,
      url,
      addedAt: new Date(),
    },
  }, { upsert: true });
}

export async function removePublishedLink({ brand, slug }) {
  await getDb().collection('internal_links').deleteMany({ brand, slug });
}

// Retrieve recent internal links for a brand (for injection into new blogs)
export async function getInternalLinks(brand, limit = 8) {
  const docs = await getDb().collection('internal_links')
    .find({ brand })
    .sort({ addedAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(d => `- [${d.title}](${d.url})`).join('\n');
}
