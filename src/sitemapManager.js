import fs from 'node:fs';
import path from 'node:path';

const CONFIG = {
  saraf: {
    sitemapPath: '/home/sanskarsaraf.in/public_html/sitemap.xml',
    baseUrl: 'https://sanskarsaraf.in/blog',
    postsDir: '/home/sanskarsaraf.in/public_html/blog/posts'
  },
  casemate: {
    sitemapPath: '/home/casemate.co.in/public_html/sitemap.xml',
    baseUrl: 'https://casemate.co.in/blog',
    postsDir: '/home/casemate.co.in/public_html/blog/posts'
  }
};

export async function updateSitemap(brand, slug) {
  const config = CONFIG[brand];
  if (!config) return;

    let sitemap = '';
    if (fs.existsSync(config.sitemapPath)) {
      sitemap = fs.readFileSync(config.sitemapPath, 'utf8');
    } else {
      sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`;
    }

    const postUrl = `${config.baseUrl}/${slug}`;
    
    // Check if URL already exists
    if (sitemap.includes(postUrl)) {
      console.log(`[Sitemap] ${postUrl} already exists in sitemap.`);
      return;
    }

    const newUrlEntry = `  <url>
    <loc>${postUrl}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;

    // Insert before closing </urlset>
    if (sitemap.includes('</urlset>')) {
      sitemap = sitemap.replace('</urlset>', `${newUrlEntry}\n</urlset>`);
      fs.writeFileSync(config.sitemapPath, sitemap);
      console.log(`[Sitemap] Added ${postUrl} to ${config.sitemapPath}`);
    }
  } catch (err) {
    console.error(`[Sitemap] Error updating sitemap for ${brand}:`, err.message);
  }
}

export async function fullSyncSitemaps() {
  for (const brand of Object.keys(CONFIG)) {
    const config = CONFIG[brand];
    if (!fs.existsSync(config.postsDir)) continue;

    const files = fs.readdirSync(config.postsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const slug = file.replace('.md', '');
      await updateSitemap(brand, slug);
    }
  }
}
