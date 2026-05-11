import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import multer from 'multer';
import { connectDb } from './src/db/blogDb.js';
import { runBlogEngine, runForBrand } from './src/blogEngine.js';
import { deployBlog } from './src/blogDeployer.js';
import { getDrafts, getDraft, saveDraftEdits, deleteDraft, setAutoPublish, reschedule } from './src/db/blogDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3300;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Image upload (replace header) ────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'uploads/blog-headers'),
    filename: (req, file, cb) => cb(null, `${req.params.id}-custom${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── API Routes ────────────────────────────────────────────────────────────────

// List all drafts (filterable by brand, status)
app.get('/api/blog/drafts', async (req, res) => {
  try {
    const { brand, status } = req.query;
    const drafts = await getDrafts({ brand, status });
    res.json({ drafts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single draft
app.get('/api/blog/draft/:id', async (req, res) => {
  try {
    const draft = await getDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Not found' });
    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save content edits
app.put('/api/blog/draft/:id', async (req, res) => {
  try {
    const { content, frontMatter } = req.body;
    await saveDraftEdits(req.params.id, { content, frontMatter });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reschedule
app.put('/api/blog/draft/:id/reschedule', async (req, res) => {
  try {
    const { scheduledAt } = req.body;
    await reschedule(req.params.id, new Date(scheduledAt));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish now
app.post('/api/blog/draft/:id/publish', async (req, res) => {
  try {
    const draft = await getDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Not found' });
    await deployBlog(draft);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Replace header image (upload)
app.post('/api/blog/draft/:id/replace-image', upload.single('image'), async (req, res) => {
  try {
    const imageUrl = `${process.env.IMAGE_BASE_URL}/${req.params.id}-custom${path.extname(req.file.originalname)}`;
    await saveDraftEdits(req.params.id, { imageUrl });
    res.json({ ok: true, imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Regenerate image only
app.post('/api/blog/draft/:id/regenerate-image', async (req, res) => {
  try {
    const draft = await getDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Not found' });
    const { runImageAgent } = await import('./src/blogEngine.js');
    const imageResult = await runImageAgent(draft.title, draft.visualBrief, draft.brand);
    await saveDraftEdits(req.params.id, { imageUrl: imageResult.imageUrl, archetype: imageResult.archetype });
    res.json({ ok: true, imageUrl: imageResult.imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle auto-publish
app.put('/api/blog/draft/:id/auto-publish', async (req, res) => {
  try {
    const { autoPublish } = req.body;
    await setAutoPublish(req.params.id, autoPublish);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual generate trigger
app.post('/api/blog/generate', async (req, res) => {
  try {
    const { brand } = req.body;
    res.json({ ok: true, message: 'Generation started' });
    // Run in background
    if (brand) {
      runForBrand(brand).catch(console.error);
    } else {
      runBlogEngine().catch(console.error);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete draft
app.delete('/api/blog/draft/:id', async (req, res) => {
  try {
    await deleteDraft(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cron Jobs ─────────────────────────────────────────────────────────────────

// 6 AM IST (00:30 UTC) — Generate next day's blog
cron.schedule('30 0 * * *', () => {
  console.log('[CRON] Running blog generation for tomorrow...');
  runBlogEngine().catch(console.error);
}, { timezone: 'Asia/Kolkata' });

// 6 AM IST — Auto-publish today's approved posts
cron.schedule('30 0 * * *', async () => {
  console.log('[CRON] Checking for posts to auto-publish...');
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueToday = await getDrafts({ status: 'generated', autoPublish: true });
    for (const draft of dueToday) {
      const scheduled = new Date(draft.scheduledAt);
      if (scheduled >= today && scheduled < tomorrow) {
        console.log(`[CRON] Auto-publishing: ${draft.title}`);
        await deployBlog(draft);
      }
    }
  } catch (err) {
    console.error('[CRON] Auto-publish error:', err.message);
  }
}, { timezone: 'Asia/Kolkata' });

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  await connectDb();
  app.listen(PORT, () => {
    console.log(`[Blog Engine] Running at http://localhost:${PORT}`);
    console.log(`[Blog Engine] MongoDB: ${process.env.MONGODB_DB}`);
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
