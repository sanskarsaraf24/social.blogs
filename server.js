import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import multer from 'multer';
import { connectDb } from './src/db/blogDb.js';
import { runBlogEngine, runForBrand } from './src/blogEngine.js';
import { deployBlog, removeDeployedBlog } from './src/blogDeployer.js';
import { getDrafts, getDraft, saveDraftEdits, deleteDraft, setAutoPublish, reschedule } from './src/db/blogDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3300;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Image upload (replace header) ────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'uploads/blog-headers'),
    filename: (req, file, cb) => cb(null, `${req.params.id}-custom${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── Blog Router ───────────────────────────────────────────────────────────────
const blogRouter = express.Router();

// 1. Static Assets & Uploads
blogRouter.use('/uploads', express.static(path.join(__dirname, 'uploads')));
blogRouter.use(express.static(path.join(__dirname, 'frontend/dist')));

// 2. API Routes
blogRouter.get('/api/blog/drafts', async (req, res) => {
  try {
    const { brand, status } = req.query;
    const drafts = await getDrafts({ brand, status });
    res.json({ drafts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.get('/api/blog/draft/:id', async (req, res) => {
  try {
    const draft = await getDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Not found' });
    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.put('/api/blog/draft/:id', async (req, res) => {
  try {
    const { content, frontMatter } = req.body;
    await saveDraftEdits(req.params.id, { content, frontMatter });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.put('/api/blog/draft/:id/reschedule', async (req, res) => {
  try {
    const { scheduledAt } = req.body;
    await reschedule(req.params.id, new Date(scheduledAt));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post('/api/blog/draft/:id/publish', async (req, res) => {
  try {
    const draft = await getDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Not found' });
    
    // Update date to TODAY if publishing now
    const today = new Date().toISOString().split('T')[0];
    draft.frontMatter.date = today;
    
    await deployBlog(draft);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post('/api/blog/draft/:id/replace-image', upload.single('image'), async (req, res) => {
  try {
    const imageUrl = `${process.env.IMAGE_BASE_URL}/${req.params.id}-custom${path.extname(req.file.originalname)}`;
    await saveDraftEdits(req.params.id, { imageUrl });
    res.json({ ok: true, imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post('/api/blog/draft/:id/regenerate-image', async (req, res) => {
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

blogRouter.put('/api/blog/draft/:id/auto-publish', async (req, res) => {
  try {
    const { autoPublish } = req.body;
    await setAutoPublish(req.params.id, autoPublish);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post('/api/blog/generate', async (req, res) => {
  try {
    const { brand } = req.body;
    res.json({ ok: true, message: 'Generation started' });
    if (brand) {
      runForBrand(brand).catch(console.error);
    } else {
      runBlogEngine().catch(console.error);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.delete('/api/blog/draft/:id', async (req, res) => {
  try {
    const draft = await getDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Not found' });

    const removal = await removeDeployedBlog(draft);
    await deleteDraft(req.params.id);
    res.json({ ok: true, removal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. SPA Fallback for /blog sub-routes
blogRouter.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

// Mount the entire Blog Engine under /blog
app.use('/blog', blogRouter);

// ── Cron Jobs ─────────────────────────────────────────────────────────────────

cron.schedule('30 0 * * *', () => {
  console.log('[CRON] Running blog generation for tomorrow...');
  runBlogEngine().catch(console.error);
}, { timezone: 'Asia/Kolkata' });

cron.schedule('30 0 * * *', async () => {
  console.log('[CRON] Checking for posts to auto-publish...');
  try {
    const dueToday = await getDrafts({ status: 'generated', autoPublish: true });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Blog Engine] Running at http://localhost:${PORT}`);
    console.log(`[Blog Engine] Dashboard accessible at /blog`);
  });
}

start().catch(err => {
  console.error('[Blog Engine] Failed to start:', err);
  process.exit(1);
});
