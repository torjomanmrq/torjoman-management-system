// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/supabase'
  ],

  devtools: {
    enabled: true
  },

  // عربي + RTL بالكامل (مبدأ حاكم في البريف §2)
  app: {
    head: {
      htmlAttrs: {
        lang: 'ar',
        dir: 'rtl'
      },
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  // الخطوط: في وضع التطوير نعطّل المزوّدات الشبكية ليعمل الخادم دون إنترنت
  // (يتجنّب انهيار vite-node عند انقطاع الشبكة). الإنتاج يبقى كامل المزوّدات.
  fonts: process.env.NODE_ENV !== 'production'
    ? { providers: { google: false, bunny: false, fontshare: false, googleicons: false } }
    : {},

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Supabase: المفاتيح من .env (SUPABASE_URL / SUPABASE_KEY).
  // redirect معطّل الآن — سنبني حماية المسارات حسب الدور كـ middleware خاص بنا (المهمة 7).
  supabase: {
    redirect: false
  }
})
