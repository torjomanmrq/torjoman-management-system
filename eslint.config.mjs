// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // أنواع قاعدة البيانات تُولَّد آليّاً (supabase gen types) — لا تُفحَص ولا تُحرَّر يدويّاً.
  { ignores: ['app/types/database.types.ts'] }
)
