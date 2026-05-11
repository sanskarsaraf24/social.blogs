import { MongoClient } from 'mongodb';

let db;
let client;

export async function connectDb() {
  client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'blog_automation');
  console.log(`[DB] Connected to MongoDB: ${process.env.MONGODB_DB}`);

  // Create indexes for performance
  await db.collection('blog_drafts').createIndex({ brand: 1, status: 1 });
  await db.collection('blog_drafts').createIndex({ scheduledAt: 1 });
  await db.collection('blog_drafts').createIndex({ slug: 1 }, { unique: true, sparse: true });
  await db.collection('internal_links').createIndex({ brand: 1 });
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not connected. Call connectDb() first.');
  return db;
}

// ── blog_drafts CRUD ──────────────────────────────────────────────────────────

export async function getDrafts({ brand, status, autoPublish } = {}) {
  const filter = {};
  if (brand) filter.brand = brand;
  if (status) filter.status = status;
  if (autoPublish !== undefined) filter.autoPublish = autoPublish;
  return getDb().collection('blog_drafts')
    .find(filter)
    .sort({ scheduledAt: -1 })
    .toArray();
}

export async function getDraft(id) {
  return getDb().collection('blog_drafts').findOne({ id });
}

export async function saveDraft(draft) {
  await getDb().collection('blog_drafts').insertOne(draft);
}

export async function saveDraftEdits(id, updates) {
  await getDb().collection('blog_drafts').updateOne(
    { id },
    { $set: { ...updates, updatedAt: new Date() } }
  );
}

export async function reschedule(id, scheduledAt) {
  await getDb().collection('blog_drafts').updateOne(
    { id },
    { $set: { scheduledAt, updatedAt: new Date() } }
  );
}

export async function setAutoPublish(id, autoPublish) {
  await getDb().collection('blog_drafts').updateOne(
    { id },
    { $set: { autoPublish, updatedAt: new Date() } }
  );
}

export async function deleteDraft(id) {
  await getDb().collection('blog_drafts').deleteOne({ id });
}

export async function markPublished(id) {
  await getDb().collection('blog_drafts').updateOne(
    { id },
    { $set: { status: 'published', publishedAt: new Date() } }
  );
}

export async function getLastPublishedBrand() {
  const last = await getDb().collection('blog_drafts')
    .find({ status: 'published' })
    .sort({ publishedAt: -1 })
    .limit(1)
    .toArray();
  return last[0]?.brand || null;
}

export async function getPastSlugs(brand, limit = 20) {
  const docs = await getDb().collection('blog_drafts')
    .find({ brand })
    .sort({ createdAt: -1 })
    .limit(limit)
    .project({ title: 1, slug: 1, _id: 0 })
    .toArray();
  return docs.map(d => `${d.slug} — "${d.title}"`).join('\n');
}
