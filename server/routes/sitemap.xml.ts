/**
 * sitemap.xml — يسرد الصفحات العامّة القابلة للفهرسة فقط (الهبوط + الدخول).
 * بقيّة المسارات مغلقة بالدور وتحمل noindex، فلا تُدرَج.
 */
export default defineEventHandler((event) => {
  const site = useRuntimeConfig().public.siteUrl.replace(/\/$/, '')
  const pages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/login', priority: '0.5', changefreq: 'monthly' }
  ]
  const urls = pages.map(p => `  <url>
    <loc>${site}${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
})
