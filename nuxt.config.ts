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
      }
    }
  },

  css: ['~/assets/css/main.css'],

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
