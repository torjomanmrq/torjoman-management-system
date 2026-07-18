import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * sitemap.xml — يسرد الصفحات العامّة القابلة للفهرسة فقط (الهبوط + الدخول +
 * الأخبار المنشورة). بقيّة المسارات مغلقة بالدور وتحمل noindex، فلا تُدرَج.
 */
export default defineEventHandler(async (event) => {
  const site = useRuntimeConfig().public.siteUrl.replace(/\/$/, '')
  const pages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/login', priority: '0.5', changefreq: 'monthly' }
  ]

  const admin = serverSupabaseServiceRole<Database>(event)
  const { data: news } = await admin
    .from('news')
    .select('id, news_date')
    .eq('published', true)
    .order('news_date', { ascending: false })

  const newsPages = (news ?? []).map(n => ({
    loc: `/news/${n.id}`,
    priority: '0.6',
    changefreq: 'monthly',
    lastmod: n.news_date
  }))

  const urls = [...pages, ...newsPages].map(p => `  <url>
    <loc>${site}${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>${'lastmod' in p ? `\n    <lastmod>${p.lastmod}</lastmod>` : ''}
  </url>`).join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
})
